#!/usr/bin/env python3
"""Deterministic continuity watcher. No model call except a triggered Luna advisory."""

import argparse
import contextlib
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
ROUTE = HERE.parent / "codex-route.sh"
CTL = HERE / "controller.sh"
LIMIT = re.compile(r"hit your session limit|usage limit|rate limit|usage-limit", re.I)
RESET = re.compile(r"(?:resets?|try again)\s*(?:at|in)?\s*([^.;\n]+)", re.I)
SID = re.compile(r"session id:\s*([0-9a-f-]{36})", re.I)
TOKENS = re.compile(r"tokens used\s*\n\s*([0-9,]+)", re.I)


def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def read(path, default):
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return default


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name("." + path.name + "." + uuid.uuid4().hex)
    with temp.open("w") as out:
        json.dump(value, out, indent=2, sort_keys=True)
        out.write("\n")
        out.flush()
        os.fsync(out.fileno())
    os.replace(temp, path)


def log(root, message):
    with (root / "events.log").open("a") as out:
        out.write(json.dumps({"at": utc(), "message": message}) + "\n")


@contextlib.contextmanager
def locked(root):
    root.mkdir(parents=True, exist_ok=True)
    with (root / ".watch.lock").open("a+b") as fd:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield


def ctl(root, *args, env=None, input=None):
    e = os.environ.copy()
    e["GT3_RUN_DIR"] = str(root)
    if env:
        e.update(env)
    return subprocess.run([str(CTL), *map(str, args)], env=e, input=input,
                          text=True, capture_output=True)


def creds(state):
    return {"GT3_MANAGER_ID": state["managerId"], "GT3_MANAGER_GEN": str(state["generation"])}


def birth(pid):
    path = Path("/proc") / str(pid) / "stat"
    if path.exists():
        data = path.read_text()
        return "linux:" + data[data.rfind(")") + 2:].split()[19]
    p = subprocess.run(["ps", "-p", str(pid), "-o", "lstart="], capture_output=True, text=True)
    return "ps:" + p.stdout.strip() if p.returncode == 0 and p.stdout.strip() else None


def alive(record):
    if not (record and record.get("pid") and record.get("birth")):
        return False
    proc = Path("/proc") / str(record["pid"]) / "stat"
    if proc.exists() and proc.read_text().split()[2] == "Z":
        return False
    return birth(record["pid"]) == record["birth"]


def reset_at(text, observed_at=None):
    match = RESET.search(text)
    if not match:
        return None
    raw = match.group(1).strip()
    try:
        return dt.datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(dt.timezone.utc).isoformat()
    except ValueError:
        pass
    clock = re.search(r"(\d{1,2}):(\d{2})\s*(am|pm)?", raw, re.I)
    if not clock:
        return None
    zone = ZoneInfo("Asia/Qatar") if "Asia/Qatar" in raw else dt.datetime.now().astimezone().tzinfo
    local = dt.datetime.fromisoformat(observed_at.replace("Z", "+00:00")).astimezone(zone) if observed_at else dt.datetime.now(zone)
    hour = int(clock.group(1))
    if clock.group(3):
        hour = hour % 12 + (12 if clock.group(3).lower() == "pm" else 0)
    target = local.replace(hour=hour, minute=int(clock.group(2)), second=0, microsecond=0)
    if target < local - dt.timedelta(minutes=2):
        return None  # Date omitted and clock time already passed: do not invent tomorrow.
    return target.astimezone(dt.timezone.utc).isoformat()


def quota_signal(root, provider, route, available, source, detail, reset=None):
    q = read(root / "quota.json", {"routes": {}})
    key = provider + ":" + route
    old = q["routes"].get(key, {})
    observations = old.get("observations", [])
    observations.append({"available": available, "source": source, "observedAt": utc(),
                         "resetAt": reset, "detail": detail[:300]})
    rejection = old.get("lastCliRejection")
    if source == "cli-rejection":
        rejection = {"observedAt": utc(), "resetAt": reset}
    elif source == "successful-call-after-reset":
        rejection = None
    conflict = old.get("source") == "user" and old.get("available") is not None and old.get("available") != available
    q["routes"][key] = {"available": available, "source": source, "observedAt": utc(),
                         "resetAt": reset, "approximateRemaining": old.get("approximateRemaining"),
                         "capacity": old.get("capacity"), "warning": old.get("warning"),
                         "lastCliRejection": rejection,
                         "discrepancyCause": "UNKNOWN" if conflict else old.get("discrepancyCause"),
                         "observations": observations[-20:]}
    write(root / "quota.json", q)


def route_eligible(root, route):
    record = read(root / "quota.json", {"routes": {}})["routes"].get(route, {})
    rejection = record.get("lastCliRejection")
    if rejection:
        reset = rejection.get("resetAt")
        if not reset:
            return False
        try:
            return dt.datetime.fromisoformat(reset).timestamp() <= time.time()
        except ValueError:
            return False
    if record.get("available") is not False:
        return True
    reset = record.get("resetAt")
    if not reset:
        return False
    try:
        return dt.datetime.fromisoformat(reset).timestamp() <= time.time()
    except ValueError:
        return False


def timeline(root, job):
    path = job / "timeline.jsonl"
    cursor_path = root / "timeline-cursor.json"
    cursor = read(cursor_path, {"inode": None, "offset": 0, "lastAt": None})
    if not path.exists():
        return []
    st = path.stat()
    if cursor["inode"] != st.st_ino or st.st_size < cursor["offset"]:
        cursor["inode"], cursor["offset"] = st.st_ino, 0
        log(root, "timeline rotation/truncation; scanning complete lines from start")
    with path.open("rb") as stream:
        stream.seek(cursor["offset"])
        data = stream.read()
    last_newline = data.rfind(b"\n")
    if last_newline < 0:
        return []
    complete = data[:last_newline + 1]
    cursor["offset"] += len(complete)
    entries = []
    for raw in complete.splitlines():
        try:
            item = json.loads(raw)
            entries.append(item)
            cursor["lastAt"] = item.get("at", cursor["lastAt"])
        except (ValueError, UnicodeDecodeError):
            log(root, "invalid complete timeline line skipped")
    write(cursor_path, cursor)
    return entries


def event(root, kind, task=None, detail=None):
    queue = read(root / "event-queue.json", [])
    event_id = uuid.uuid4().hex
    queue.append({"id": event_id, "kind": kind, "taskId": task, "detail": detail,
                  "createdAt": utc(), "ackAt": None, "attempts": 0, "delivery": None})
    write(root / "event-queue.json", queue)
    return event_id


def session_from_log(path):
    if not path.exists():
        return None
    contents = re.sub(r"\x1b\[[0-9;]*m", "", path.read_text(errors="replace"))
    matches = SID.findall(contents)
    return matches[-1] if matches else None


def launch_turn(root, state, prompt, session=None, effort=None):
    status = read(root / "turn.json", {})
    if alive(status):
        return False
    effort = effort or status.get("effort") or "high"
    call_id = uuid.uuid4().hex
    path = root / "calls" / (call_id + ".log")
    path.parent.mkdir(exist_ok=True)
    command = [str(ROUTE)]
    if session:
        command.append("resume")
    command += ["-m", "gpt-6-sol", "-r", effort]
    if session:
        command.append(session)
    command.append(prompt)
    environment = os.environ.copy()
    environment.update(creds(state))
    environment.update(GT3_RUN_DIR=str(root), GT3_MANAGER_LAUNCH="1")
    with path.open("w") as output:
        child = subprocess.Popen(command, cwd=str(read(root / "watch-config.json", {}).get("worktree", HERE.parent.parent)),
                                 env=environment, stdin=subprocess.DEVNULL, stdout=output,
                                 stderr=subprocess.STDOUT, start_new_session=True)
    write(root / "turn.json", {"pid": child.pid, "birth": birth(child.pid), "log": str(path),
                                    "sessionId": session, "effort": effort, "callId": call_id,
                                    "startedAt": utc(), "generation": state["generation"]})
    log(root, "manager turn launched " + call_id)
    return True


def handle_turn_exit(root, state):
    turn = read(root / "turn.json", {})
    if not turn or alive(turn) or turn.get("processed"):
        return
    path = Path(turn["log"])
    output = path.read_text(errors="replace") if path.exists() else ""
    sid = session_from_log(path) or turn.get("sessionId")
    turn.update(processed=True, sessionId=sid, endedAt=utc())
    write(root / "turn.json", turn)
    if sid:
        write(root / "sol-session.json", {"sessionId": sid, "effort": turn["effort"]})
    if LIMIT.search(output):
        quota_signal(root, "codex", "gpt-6-sol", False, "cli-rejection", output[-500:], reset_at(output))
        log(root, "Codex usage limit; retry only when reset is eligible")
        turn["limitRejected"] = True
        turn["nextRetryEpoch"] = time.time() + 120
        write(root / "turn.json", turn)
    elif "tokens used" in output.lower():
        prior = read(root / "quota.json", {"routes": {}})["routes"].get("codex:gpt-6-sol", {})
        if prior.get("resetAt") and route_eligible(root, "codex:gpt-6-sol"):
            quota_signal(root, "codex", "gpt-6-sol", True, "successful-call-after-reset", "successful response")
    if state["mode"] == "sol-starting" and not sid:
        log(root, "takeover ended without session ID; reconcile before retry")
    elif state["mode"] == "sol-continuity":
        pending = any(w["status"] in ("launching", "running") for w in read(root / "workers.json", []))
        unacked = any(not e["ackAt"] for e in read(root / "event-queue.json", []))
        if not pending and not unacked and "ACTIONABLE_NEXT" in output:
            event(root, "continuation", detail="manager ended with actionable work")


def scan_workers(root, cfg):
    workers = read(root / "workers.json", [])
    changed = False
    now = time.time()
    for worker in workers:
        if worker["status"] == "running":
            log_path = Path(worker["log"])
            progress = max(log_path.stat().st_mtime if log_path.exists() else 0,
                           worker.get("lastProgressEpoch", 0))
            if worker.get("staleReported") and now - progress <= cfg.get("workerStaleSeconds", 1800):
                worker["staleReported"] = False
                changed = True
            if now - progress > cfg.get("workerStaleSeconds", 1800) and not worker.get("staleReported"):
                worker["staleReported"] = True
                event(root, "worker-stale", worker["taskId"], "no log progress")
                changed = True
            if not alive(worker) and not worker.get("completion"):
                worker["status"] = "unresolved"
                event(root, "worker-unresolved", worker["taskId"], "supervisor vanished; exit unknown")
                changed = True
        elif worker["status"] == "completed" and not worker.get("eventId"):
            worker["eventId"] = event(root, "worker-complete", worker["taskId"], worker["completion"])
            changed = True
    if changed:
        write(root / "workers.json", workers)
    return workers


def advisory(root, cfg):
    path = root / "luna-advisory.log"
    evidence = {"manager": read(root / "manager.json", {}), "state": read(Path(cfg["jobDir"]) / "state.json", {}),
                "workers": [{"taskId": w["taskId"], "status": w["status"]} for w in read(root / "workers.json", [])]}
    prompt = "Classify manager liveness as exactly manager-dead, legit-wait, or unclear. Evidence: " + json.dumps(evidence)
    with path.open("a") as out:
        p = subprocess.run([str(ROUTE), "-m", "gpt-6-luna", "-r", "high", prompt],
                           cwd=cfg["worktree"], stdout=out, stderr=subprocess.STDOUT,
                           env={k: v for k, v in os.environ.items() if k not in ("GT3_RUN_DIR", "GT3_MANAGER_ID", "GT3_MANAGER_GEN")})
    contents = path.read_text(errors="replace")
    matches = re.findall(r"\b(manager-dead|legit-wait|unclear)\b", contents)
    answer = matches[-1] if matches else "unclear"
    if p.returncode and LIMIT.search(contents):
        quota_signal(root, "codex", "gpt-6-luna", False, "cli-rejection", contents[-500:], reset_at(contents))
    log(root, "Luna advisory " + answer + " exit=" + str(p.returncode))
    return answer == "manager-dead"


def tick(root):
    with locked(root):
        cfg = read(root / "watch-config.json", {})
        job = Path(cfg.get("jobDir", root))
        state = read(root / "manager.json", None)
        if not state:
            raise RuntimeError("controller has not armed this run")
        entries = timeline(root, job)
        workers = scan_workers(root, cfg)
        handle_turn_exit(root, state)
        state = read(root / "manager.json", state)
        trigger = None
        if state["mode"] == "opus-primary":
            for entry in entries:
                at = entry.get("at", "")
                if at and at < state["since"]:
                    continue
                detail = str(entry.get("detail", ""))
                if entry.get("state") == "blocked" and LIMIT.search(detail):
                    trigger = "limit-text timeline"
                    quota_signal(root, "claude", "opus", False, "timeline", detail, reset_at(detail, at or None))
            current = read(job / "state.json", {})
            detail = str(current.get("detail", ""))
            if not trigger and current.get("state") == "blocked" and LIMIT.search(detail) and \
                    (job / "state.json").stat().st_mtime >= dt.datetime.fromisoformat(state["since"]).timestamp():
                trigger = "limit-text state"
                quota_signal(root, "claude", "opus", False, "state", detail, reset_at(detail))
            opus = read(root / "opus-process.json", {})
            if not trigger and opus and not alive(opus):
                trigger = "configured Opus PID exited"
            if not trigger and current.get("state") == "working":
                packet = root / "continuity.md"
                marks = [p.stat().st_mtime for p in (job / "timeline.jsonl", packet,
                         *[Path(v) for v in cfg.get("transcripts", [])]) if p.exists()]
                progress = max(marks) if marks else 0
                active_worker = any(w["status"] == "running" and alive(w) and not w.get("staleReported") for w in workers)
                if not active_worker and time.time() - progress > cfg.get("staleSeconds", 1800):
                    last = read(root / "advisory.json", {})
                    if time.time() - last.get("at", 0) > cfg.get("staleSeconds", 1800):
                        write(root / "advisory.json", {"at": time.time()})
                        if advisory(root, cfg):
                            trigger = "Luna manager-dead advisory after ambiguous staleness"
            if trigger:
                new_id = "sol-" + uuid.uuid4().hex
                result = ctl(root, "failover", "--expect-gen", state["generation"],
                             "--expect-id", state["managerId"], "--sol-id", new_id)
                log(root, "failover " + trigger + " result=" + str(result.returncode) + " " + result.stderr.strip())
                if result.returncode == 0:
                    state = read(root / "manager.json", state)
        previous_turn = read(root / "turn.json", {})
        if state["mode"] == "sol-starting" and previous_turn.get("limitRejected") and previous_turn.get("processed"):
            codex_record = read(root / "quota.json", {"routes": {}})["routes"].get("codex:gpt-6-sol", {})
            reset = (codex_record.get("lastCliRejection") or {}).get("resetAt") or codex_record.get("resetAt")
            deadline = cfg.get("deadline")
            if reset and dt.datetime.fromisoformat(reset).timestamp() <= time.time() and \
                    time.time() >= previous_turn.get("nextRetryEpoch", 0) and \
                    (not deadline or dt.datetime.fromisoformat(deadline).timestamp() > time.time()):
                write(root / "turn.json", {})
                log(root, "Codex reset eligible; retrying takeover")
        if state["mode"] == "sol-starting" and not read(root / "turn.json", {}):
            packet = root / "continuity.md"
            effort = "xhigh" if re.search(r"Takeover effort:\s*xhigh", packet.read_text() if packet.exists() else "", re.I) else "high"
            prompt = (HERE / "sol-takeover.md").read_text() + "\nPacket: " + str(packet)
            launch_turn(root, state, prompt, effort=effort)
        if state["mode"] in ("sol-continuity", "handback-requested"):
            session = read(root / "sol-session.json", {}).get("sessionId")
            if session and route_eligible(root, "codex:gpt-6-sol") and not alive(read(root / "turn.json", {})):
                queue = read(root / "event-queue.json", [])
                pending = next((e for e in queue if not e["ackAt"]), None)
                if pending:
                    pending["attempts"] += 1
                    pending["delivery"] = utc()
                    write(root / "event-queue.json", queue)
                    prompt = "Durable event (handle idempotently, then ack): " + json.dumps(pending)
                    if state["mode"] == "handback-requested":
                        prompt += "\nHandback requested; keep delivering events and checkpoint safely."
                    launch_turn(root, state, prompt, session=session)
        q = read(root / "quota.json", {"routes": {}})
        claude = q["routes"].get("claude:opus", {})
        reset = claude.get("resetAt")
        if state["holder"] == "sol" and reset and not (root / "opus-wake").exists():
            try:
                instant = dt.datetime.fromisoformat(reset.replace("Z", "+00:00"))
                due = instant.timestamp() <= time.time()
            except ValueError:
                due = False
            if due:
                (root / "opus-wake").touch()
                log(root, "opus-available (eligible to retry, not confirmed quota)")
        return state["mode"]


def manager_admit(root):
    result = ctl(root, "admit", "file-write")
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


def manager_done(root, action):
    result = ctl(root, "done", action)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())


def worker_launch(root, args):
    if not args.task_id or not args.permissions:
        raise ValueError("stable task ID and bounded permissions required")
    with locked(root):
        action = manager_admit(root)
        try:
            workers = read(root / "workers.json", [])
            if any(w["taskId"] == args.task_id for w in workers):
                raise ValueError("task ID already registered; reconcile intent")
            item = {"taskId": args.task_id, "status": "launching", "permissions": args.permissions,
                    "command": args.command[1:] if args.command and args.command[0] == "--" else args.command,
                    "brief": args.brief, "model": args.model, "effort": args.effort,
                    "owner": os.environ["GT3_MANAGER_ID"], "createdAt": utc(),
                    "log": str(root / "workers" / (args.task_id + ".log"))}
            workers.append(item)
            write(root / "workers.json", workers)
            environment = os.environ.copy()
            environment["GT3_RUN_DIR"] = str(root)
            subprocess.Popen([str(CTL), "run", "dispatch", "--", sys.executable,
                              str(Path(__file__).resolve()), "--run-dir", str(root),
                              "supervise", args.task_id], env=environment, stdin=subprocess.DEVNULL,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        finally:
            manager_done(root, action)


def supervise(root, task_id):
    with locked(root):
        workers = read(root / "workers.json", [])
        worker = next(w for w in workers if w["taskId"] == task_id)
        if worker["status"] != "launching":
            return
        log_path = Path(worker["log"])
        log_path.parent.mkdir(exist_ok=True)
        environment = {k: v for k, v in os.environ.items() if k not in
                       ("GT3_RUN_DIR", "GT3_MANAGER_ID", "GT3_MANAGER_GEN", "GT3_MANAGER_LAUNCH")}
        with log_path.open("w") as out:
            child = subprocess.Popen(worker["command"], cwd=read(root / "watch-config.json", {}).get("worktree"),
                                     stdout=out, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                                     env=environment)
        worker.update(status="running", pid=child.pid, birth=birth(child.pid), startedAt=utc(),
                      lastProgressEpoch=time.time())
        write(root / "workers.json", workers)
    code = child.wait()
    with locked(root):
        workers = read(root / "workers.json", [])
        worker = next(w for w in workers if w["taskId"] == task_id)
        worker.update(status="completed", completion={"exitCode": code, "at": utc(), "log": worker["log"]})
        write(root / "workers.json", workers)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", default=os.environ.get("GT3_RUN_DIR"), required=False)
    sub = parser.add_subparsers(dest="mode", required=True)
    sub.add_parser("tick")
    loop = sub.add_parser("loop")
    loop.add_argument("--interval", type=float, default=120)
    ack = sub.add_parser("ack")
    ack.add_argument("event_id")
    snap = sub.add_parser("quota-snapshot")
    snap.add_argument("route")
    snap.add_argument("--available", choices=["true", "false", "unknown"], required=True)
    snap.add_argument("--remaining")
    snap.add_argument("--capacity")
    snap.add_argument("--warning")
    worker = sub.add_parser("worker-launch")
    worker.add_argument("task_id")
    worker.add_argument("--permissions", required=True)
    worker.add_argument("--brief", required=True)
    worker.add_argument("--model", required=True)
    worker.add_argument("--effort", required=True)
    worker.add_argument("command", nargs=argparse.REMAINDER)
    supervisor = sub.add_parser("supervise")
    supervisor.add_argument("task_id")
    args = parser.parse_args()
    if not args.run_dir:
        parser.error("--run-dir or GT3_RUN_DIR required")
    root = Path(args.run_dir).resolve()
    if args.mode == "tick":
        tick(root)
    elif args.mode == "loop":
        while True:
            tick(root)
            time.sleep(args.interval)
    elif args.mode == "supervise":
        supervise(root, args.task_id)
    elif args.mode == "worker-launch":
        worker_launch(root, args)
    elif args.mode in ("ack", "quota-snapshot"):
        with locked(root):
            action = manager_admit(root)
            try:
                if args.mode == "ack":
                    queue = read(root / "event-queue.json", [])
                    item = next((e for e in queue if e["id"] == args.event_id), None)
                    if not item:
                        raise ValueError("unknown event")
                    if not item["ackAt"]:
                        item["ackAt"] = utc()
                        write(root / "event-queue.json", queue)
                else:
                    q = read(root / "quota.json", {"routes": {}})
                    key = args.route
                    old = q["routes"].get(key, {})
                    observation = {"source": "user", "observedAt": utc(),
                                   "available": {"true": True, "false": False, "unknown": None}[args.available],
                                   "approximateRemaining": args.remaining, "capacity": args.capacity,
                                   "warning": args.warning, "resetAt": None}
                    if old.get("source") == "cli-rejection" and old.get("available") != observation["available"]:
                        old["discrepancyCause"] = "UNKNOWN"
                    old.setdefault("observations", []).append(observation)
                    old.update(observation)
                    q["routes"][key] = old
                    result = ctl(root, "write", str(root / "quota.json"), input=json.dumps(q) + "\n")
                    if result.returncode:
                        raise RuntimeError(result.stderr.strip())
            finally:
                manager_done(root, action)


if __name__ == "__main__":
    main()
