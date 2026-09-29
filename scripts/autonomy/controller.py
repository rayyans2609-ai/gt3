#!/usr/bin/env python3
"""Cooperative, fenced manager mutations for one GT3 continuity run."""

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import tempfile
import uuid


class Refused(Exception):
    pass


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def crash(point):
    if os.environ.get("GT3_CTL_CRASH_AT") == point:
        os._exit(97)


def atomic_json(path, value):
    fd, temp = tempfile.mkstemp(prefix=".ctl-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w") as out:
            json.dump(value, out, indent=2, sort_keys=True)
            out.write("\n")
            out.flush()
            os.fsync(out.fileno())
        os.replace(temp, path)
        directory = os.open(str(path.parent), os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def read_json(path, default=None):
    if not path.exists():
        return default
    with path.open() as source:
        return json.load(source)


def process_birth(pid):
    # macOS has ps lstart; Linux /proc start ticks avoid second-level ambiguity.
    stat = Path("/proc") / str(pid) / "stat"
    if stat.exists():
        data = stat.read_text()
        return "linux:" + data[data.rfind(")") + 2:].split()[19]
    result = subprocess.run(["ps", "-p", str(pid), "-o", "lstart="],
                            capture_output=True, text=True, check=False)
    return "ps:" + result.stdout.strip() if result.returncode == 0 and result.stdout.strip() else None


def same_process(marker):
    birth = process_birth(marker["pid"])
    return birth is not None and birth == marker["birth"]


def credential(state):
    manager_id = os.environ.get("GT3_MANAGER_ID")
    generation = os.environ.get("GT3_MANAGER_GEN")
    if not manager_id or generation is None:
        raise Refused("missing manager credentials in armed run")
    if manager_id != state["managerId"] or generation != str(state["generation"]):
        raise Refused("stale or non-owner manager credentials")


def expect(state, generation, mode, holder):
    if state["generation"] != generation or state["mode"] != mode or state["holder"] != holder:
        raise Refused("expected generation/owner/state changed")


def no_pending(actions):
    pending = [a["id"] for a in actions if a["state"] != "done"]
    if pending:
        raise Refused("unreconciled action(s): " + ", ".join(pending))


def add_action(actions, action, state):
    item = {"id": uuid.uuid4().hex, "action": action, "state": "intent",
            "managerId": state["managerId"], "generation": state["generation"], "at": now()}
    actions.append(item)
    return item


def finish_action(actions_path, actions, item, outcome="completed"):
    item.update(state="done", outcome=outcome, doneAt=now())
    atomic_json(actions_path, actions)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", default=os.environ.get("GT3_RUN_DIR"))
    sub = parser.add_subparsers(dest="command", required=True)
    init = sub.add_parser("init")
    init.add_argument("--opus-id", required=True)
    turn = sub.add_parser("turn")
    turn.add_argument("operation", choices=["start", "end"])
    turn.add_argument("--pid", type=int)
    fail = sub.add_parser("failover")
    fail.add_argument("--expect-gen", type=int, required=True)
    fail.add_argument("--expect-id", required=True)
    fail.add_argument("--sol-id", required=True)
    ack = sub.add_parser("ack")
    ack.add_argument("--expect-gen", type=int, required=True)
    request = sub.add_parser("request-handback")
    request.add_argument("--expect-gen", type=int, required=True)
    checkpoint = sub.add_parser("checkpoint")
    checkpoint.add_argument("--file", required=True)
    handback = sub.add_parser("handback")
    handback.add_argument("--expect-gen", type=int, required=True)
    admit = sub.add_parser("admit")
    admit.add_argument("action", choices=["dispatch", "repository-commit", "repository-push",
                                                "repository-branch", "process-control", "file-write"])
    done = sub.add_parser("done")
    done.add_argument("id")
    done.add_argument("--outcome", default="completed")
    reconcile = sub.add_parser("reconcile")
    reconcile.add_argument("id")
    reconcile.add_argument("--outcome", choices=["not-started", "completed", "externally-verified"], required=True)
    reconcile.add_argument("--reason", required=True)
    write = sub.add_parser("write")
    write.add_argument("path")
    run = sub.add_parser("run")
    run.add_argument("action", choices=["dispatch", "repository-commit", "repository-push",
                                              "repository-branch"])
    run.add_argument("argv", nargs=argparse.REMAINDER)
    launch = sub.add_parser("launch-manager")
    launch.add_argument("argv", nargs=argparse.REMAINDER)
    register = sub.add_parser("register-process")
    register.add_argument("--pid", type=int, required=True)
    register.add_argument("--tag", required=True)
    stop = sub.add_parser("stop-process")
    stop.add_argument("--pid", type=int, required=True)
    status = sub.add_parser("status")
    args = parser.parse_args()
    if not args.run_dir:
        raise Refused("GT3_RUN_DIR or --run-dir required")
    root = Path(args.run_dir).expanduser().resolve()
    if args.command != "init" and not root.is_dir():
        raise Refused("run directory does not exist")
    root.mkdir(parents=True, exist_ok=True)
    manager_path = root / "manager.json"
    actions_path = root / "actions.json"
    processes_path = root / "processes.json"
    # The lock inode is never replaced or removed. flock is released by the OS on death.
    with (root / ".controller.lock").open("a+b") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        crash("claim-acquired")
        state = read_json(manager_path)
        actions = read_json(actions_path, [])
        processes = read_json(processes_path, [])
        if args.command == "init":
            if state is not None:
                raise Refused("run already armed")
            state = {"mode": "opus-primary", "holder": "opus", "managerId": args.opus_id,
                     "generation": 1, "since": now(), "activeTurn": None,
                     "previousOpus": None, "checkpoint": None}
            crash("before-metadata-publication")
            atomic_json(manager_path, state)
            atomic_json(actions_path, [])
            atomic_json(processes_path, [])
            print(json.dumps(state))
            return 0
        if state is None:
            raise Refused("run is not armed")
        if args.command == "status":
            print(json.dumps({"manager": state, "pending": [a for a in actions if a["state"] != "done"]}))
            return 0
        if args.command == "request-handback":
            previous = state.get("previousOpus")
            if not previous or os.environ.get("GT3_MANAGER_ID") != previous["id"] or \
                    os.environ.get("GT3_MANAGER_GEN") != str(previous["generation"]):
                raise Refused("Opus return credentials do not match previous authority")
            expect(state, args.expect_gen, "sol-continuity", "sol")
            state.update(mode="handback-requested", since=now(), checkpoint=None)
            crash("before-metadata-publication")
            atomic_json(manager_path, state)
            return 0
        if args.command == "failover":
            expect(state, args.expect_gen, "opus-primary", "opus")
            if state["managerId"] != args.expect_id:
                raise Refused("expected manager session changed")
            if state["activeTurn"] and same_process(state["activeTurn"]):
                raise Refused("active Opus turn still alive")
            no_pending(actions)
            state.update(mode="sol-starting", holder="sol", managerId=args.sol_id,
                         generation=state["generation"] + 1, since=now(), activeTurn=None,
                         previousOpus={"id": state["managerId"], "generation": state["generation"]},
                         checkpoint=None)
            crash("before-metadata-publication")
            atomic_json(manager_path, state)
            return 0
        credential(state)
        if args.command == "turn":
            if args.operation == "start":
                if state["activeTurn"] and same_process(state["activeTurn"]):
                    raise Refused("active turn already alive")
                pid = args.pid or os.getppid()
                birth = process_birth(pid)
                if not birth:
                    raise Refused("turn PID not alive")
                state["activeTurn"] = {"pid": pid, "birth": birth, "id": state["managerId"],
                                       "generation": state["generation"], "since": now()}
            else:
                state["activeTurn"] = None
            atomic_json(manager_path, state)
        elif args.command == "ack":
            expect(state, args.expect_gen, "sol-starting", "sol")
            state.update(mode="sol-continuity", since=now())
            atomic_json(manager_path, state)
        elif args.command == "checkpoint":
            if state["mode"] != "handback-requested" or state["holder"] != "sol":
                raise Refused("checkpoint allowed only during requested handback")
            path = Path(args.file).resolve()
            if not path.is_file() or not path.is_relative_to(root):
                raise Refused("checkpoint must be a run-directory file")
            data = path.read_bytes()
            if not data:
                raise Refused("checkpoint is empty")
            state["checkpoint"] = {"path": str(path), "sha256": hashlib.sha256(data).hexdigest(),
                                    "generation": state["generation"], "at": now()}
            atomic_json(manager_path, state)
        elif args.command == "handback":
            expect(state, args.expect_gen, "handback-requested", "sol")
            no_pending(actions)
            cp = state.get("checkpoint")
            if not cp or cp["generation"] != state["generation"] or \
                    not Path(cp["path"]).is_file() or \
                    hashlib.sha256(Path(cp["path"]).read_bytes()).hexdigest() != cp["sha256"]:
                raise Refused("current Sol checkpoint required")
            state.update(mode="opus-primary", holder="opus", managerId=state["previousOpus"]["id"],
                         generation=state["generation"] + 1, since=now(), activeTurn=None,
                         previousOpus=None, checkpoint=None)
            crash("mid-handback")
            atomic_json(manager_path, state)
            crash("after-handback-publication")
        elif args.command == "admit":
            item = add_action(actions, args.action, state)
            atomic_json(actions_path, actions)
            crash("after-intent")
            item.update(state="admitted", admittedAt=now())
            atomic_json(actions_path, actions)
            crash("after-admission")
            print(item["id"])
        elif args.command in ("done", "reconcile"):
            item = next((a for a in actions if a["id"] == args.id), None)
            if not item or item["state"] == "done":
                raise Refused("unknown or already completed action")
            if args.command == "done" and (item["managerId"] != state["managerId"] or
                                             item["generation"] != state["generation"]):
                raise Refused("action belongs to a previous owner")
            if args.command == "reconcile":
                item["reason"] = args.reason
            finish_action(actions_path, actions, item, args.outcome)
        elif args.command == "write":
            path = Path(args.path).expanduser().resolve()
            if path in (manager_path, actions_path, processes_path, root / ".controller.lock"):
                raise Refused("controller state cannot be written through ctl write")
            data = sys.stdin.buffer.read()
            item = add_action(actions, "file-write", state)
            atomic_json(actions_path, actions)
            crash("after-intent")
            item.update(state="admitted", admittedAt=now())
            atomic_json(actions_path, actions)
            crash("after-admission")
            path.parent.mkdir(parents=True, exist_ok=True)
            fd, temp = tempfile.mkstemp(prefix=".ctl-write-", dir=str(path.parent))
            try:
                if path.exists():
                    os.fchmod(fd, stat.S_IMODE(path.stat().st_mode))
                with os.fdopen(fd, "wb") as out:
                    out.write(data)
                    out.flush()
                    os.fsync(out.fileno())
                os.replace(temp, path)
            finally:
                if os.path.exists(temp):
                    os.unlink(temp)
            finish_action(actions_path, actions, item)
        elif args.command == "register-process":
            birth = process_birth(args.pid)
            if not birth:
                raise Refused("process is not alive")
            item = add_action(actions, "process-control", state)
            atomic_json(actions_path, actions)
            crash("after-intent")
            item.update(state="admitted", admittedAt=now())
            atomic_json(actions_path, actions)
            crash("child-registration-intent")
            processes.append({"pid": args.pid, "birth": birth, "tag": args.tag,
                              "registeredBy": state["managerId"], "generation": state["generation"]})
            atomic_json(processes_path, processes)
            finish_action(actions_path, actions, item)
        elif args.command == "stop-process":
            entry = next((p for p in processes if p["pid"] == args.pid), None)
            if not entry or not same_process(entry):
                raise Refused("PID is unregistered or has been reused")
            item = add_action(actions, "process-control", state)
            atomic_json(actions_path, actions)
            item.update(state="admitted", admittedAt=now())
            atomic_json(actions_path, actions)
            os.kill(args.pid, signal.SIGTERM)
            finish_action(actions_path, actions, item)
        elif args.command in ("run", "launch-manager"):
            argv = args.argv[1:] if args.argv and args.argv[0] == "--" else args.argv
            if not argv:
                raise Refused("run requires a command after --")
            manager_launch = args.command == "launch-manager"
            if manager_launch:
                if state["holder"] != "sol" or state["mode"] not in ("sol-starting", "sol-continuity", "handback-requested"):
                    raise Refused("manager launch requires Sol ownership")
                if state["activeTurn"] and same_process(state["activeTurn"]):
                    raise Refused("a manager turn is already alive")
                no_pending(actions)
            action = "manager-launch" if manager_launch else args.action
            item = add_action(actions, action, state)
            atomic_json(actions_path, actions)
            crash("after-intent")
            item.update(state="admitted", admittedAt=now())
            atomic_json(actions_path, actions)
            crash("after-admission")
            env = os.environ.copy()
            if not manager_launch and action == "dispatch":
                env.pop("GT3_MANAGER_ID", None)
                env.pop("GT3_MANAGER_GEN", None)
            try:
                child = subprocess.Popen(argv, env=env)
            except OSError as error:
                finish_action(actions_path, actions, item, "launch-failed")
                raise Refused(str(error))
            item["pid"] = child.pid
            item["birth"] = process_birth(child.pid)
            atomic_json(actions_path, actions)
            crash("child-registration-intent")
            if manager_launch:
                state["activeTurn"] = {"pid": child.pid, "birth": item["birth"],
                                       "id": state["managerId"], "generation": state["generation"],
                                       "since": now()}
                atomic_json(manager_path, state)
            if manager_launch or action == "dispatch":
                finish_action(actions_path, actions, item, "launched")
                fcntl.flock(lock, fcntl.LOCK_UN)
                result = child.wait()
                if manager_launch:
                    fcntl.flock(lock, fcntl.LOCK_EX)
                    state = read_json(manager_path)
                    if state["activeTurn"] and state["activeTurn"]["pid"] == child.pid and \
                            state["activeTurn"]["birth"] == item["birth"]:
                        state["activeTurn"] = None
                        atomic_json(manager_path, state)
                return result
            fcntl.flock(lock, fcntl.LOCK_UN)
            result = child.wait()
            fcntl.flock(lock, fcntl.LOCK_EX)
            actions = read_json(actions_path, [])
            item = next(a for a in actions if a["id"] == item["id"])
            finish_action(actions_path, actions, item, "exit:" + str(result))
            return result
        return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Refused as error:
        print("controller: refused: " + str(error), file=sys.stderr)
        sys.exit(3)
