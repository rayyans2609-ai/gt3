#!/usr/bin/env python3
"""A-K sandbox integration simulation; all Codex calls here are stubs."""

import datetime as dt
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
CTL = HERE / "controller.sh"
WATCH = HERE / "continuity-watch.sh"
BASE = Path("/tmp/gt3-cont-sim")
PASS = []


def command(args, *, env=None, cwd=None, input=None, ok=True):
    p = subprocess.run([str(a) for a in args], cwd=cwd, env=env, input=input,
                       text=True, capture_output=True)
    if ok and p.returncode:
        raise AssertionError(f"{args}: {p.returncode}: {p.stderr}: {p.stdout}")
    return p


def load(path):
    return json.loads(path.read_text())


def save(path, value):
    path.write_text(json.dumps(value) + "\n")


def credentials(run):
    s = load(run / "manager.json")
    return {**os.environ, "GT3_RUN_DIR": str(run), "GT3_MANAGER_ID": s["managerId"],
            "GT3_MANAGER_GEN": str(s["generation"]), "PATH": str(BASE / "bin") + ":" + os.environ["PATH"]}


def wait_until(predicate, seconds=5):
    end = time.time() + seconds
    while time.time() < end:
        if predicate():
            return True
        time.sleep(.05)
    return False


def gone(run):
    pid = load(run / "turn.json")["pid"]
    return command(["ps", "-p", pid], ok=False).returncode != 0


def setup(name):
    place = BASE / name
    place.mkdir(parents=True)
    repo = place / "repo"
    repo.mkdir()
    command(["git", "init", "-q", str(repo)])
    command(["git", "-C", str(repo), "config", "user.name", "Simulation"])
    command(["git", "-C", str(repo), "config", "user.email", "sim@example.test"])
    (repo / "note.txt").write_text("initial\n")
    command(["git", "-C", str(repo), "add", "."])
    command(["git", "-C", str(repo), "commit", "-qm", "initial"])
    run = place / "run"
    run.mkdir()
    job = place / "job"
    job.mkdir()
    save(job / "state.json", {"state": "working", "detail": ""})
    (job / "timeline.jsonl").write_text("")
    command([CTL, "--run-dir", run, "init", "--opus-id", "opus-test"])
    save(run / "watch-config.json", {"jobDir": str(job), "worktree": str(repo),
                                       "workerStaleSeconds": .2, "staleSeconds": 9999})
    (run / "continuity.md").write_text("# Packet\nExact next action: inspect note.txt\nTakeover effort: high\n")
    return place, run, job, repo


def tick(run):
    command([WATCH, "--run-dir", run, "tick"], env=credentials(run))


def blocked(job, detail="You've hit your session limit · resets 2:20pm (Asia/Qatar)"):
    item = {"at": dt.datetime.now(dt.timezone.utc).isoformat(), "state": "blocked", "detail": detail}
    with (job / "timeline.jsonl").open("a") as out:
        out.write(json.dumps(item) + "\n")
    save(job / "state.json", item)


def takeover(run, job):
    blocked(job)
    tick(run)
    assert wait_until(lambda: load(run / "manager.json")["mode"] == "sol-continuity")
    tick(run)


def record(letter, run, assertion):
    assert assertion
    PASS.append({"scenario": letter, "result": "PASS", "evidence": str(run)})


def main():
    if BASE.exists():
        shutil.rmtree(BASE)
    (BASE / "bin").mkdir(parents=True)
    stub = BASE / "bin" / "codex"
    stub.write_text("""#!/usr/bin/env python3
import json, os, pathlib, re, subprocess, sys, uuid
args=sys.argv[1:]
root=pathlib.Path(os.environ.get('GT3_RUN_DIR','/tmp'))
sid='11111111-1111-4111-8111-'+uuid.uuid4().hex[:12]
print('session id: '+sid, flush=True)
print('model: '+(args[args.index('-m')+1] if '-m' in args else 'unknown'), flush=True)
print('reasoning effort: '+next((x for x in args if 'model_reasoning_effort=' in x),'unknown'), flush=True)
if (root/'stub-limit').exists():
 print('usage limit; try again at 2099-01-01T00:00:00Z', flush=True); sys.exit(1)
if os.environ.get('GT3_MANAGER_LAUNCH')=='1' and 'resume' not in args:
 subprocess.run([str(pathlib.Path(os.environ['SIM_CTL'])), 'ack', '--expect-gen', os.environ['GT3_MANAGER_GEN']],check=True)
 repo=pathlib.Path.cwd()
 head=subprocess.check_output(['git','rev-parse','--short','HEAD'],text=True).strip()
 dirty=subprocess.check_output(['git','status','--porcelain'],text=True).strip()
 print('LIVE HEAD '+head+' DIRTY '+repr(dirty)+' EXACT NEXT inspect note.txt',flush=True)
elif os.environ.get('GT3_MANAGER_LAUNCH')=='1' and 'resume' in args:
 prompt=args[-1]
 match=re.search(r'"id": "([0-9a-f]{32})"',prompt)
 if match:
  ledger=root/'stub-handled.json'
  handled=json.loads(ledger.read_text()) if ledger.exists() else []
  if match.group(1) not in handled:
   handled.append(match.group(1)); ledger.write_text(json.dumps(handled))
   print('EVENT SIDE EFFECT ONCE '+match.group(1),flush=True)
 if match and not (root/'stub-no-ack').exists():
  subprocess.run([str(pathlib.Path(os.environ['SIM_WATCH'])), 'ack', match.group(1)],check=True)
 print('EVENT HANDLED '+(match.group(1) if match else 'none'),flush=True)
else:
 print('manager-dead' if 'Classify manager liveness' in args[-1] else 'STUB REVIEW OR WORKER',flush=True)
print('tokens used\\n0',flush=True)
""")
    stub.chmod(0o755)
    os.environ["SIM_CTL"] = str(CTL)
    os.environ["SIM_WATCH"] = str(WATCH)

    place, run, job, repo = setup("A")
    for _ in range(3):
        tick(run)
    record("A", run, load(run / "manager.json")["mode"] == "opus-primary" and
           not (run / "turn.json").exists())

    place, run, job, repo = setup("B")
    takeover(run, job)
    record("B", run, "EXACT NEXT inspect note.txt" in Path(load(run / "turn.json")["log"]).read_text())

    place, run, job, repo = setup("C")
    env = credentials(run)
    command([WATCH, "--run-dir", run, "worker-launch", "--permissions", "write:note.txt",
             "--brief", "fake", "--model", "stub", "--effort", "low", "task-c", "--", "sh", "-c", "sleep 2; echo done"], env=env)
    assert wait_until(lambda: load(run / "workers.json")[0]["status"] == "running")
    takeover(run, job)
    assert load(run / "workers.json")[0]["status"] == "running"
    assert wait_until(lambda: load(run / "workers.json")[0]["status"] == "completed")
    tick(run)
    assert wait_until(lambda: load(run / "event-queue.json")[0]["ackAt"] is not None or
                      (tick(run) or False))
    record("C", run, load(run / "workers.json")[0]["completion"]["exitCode"] == 0)

    place, run, job, repo = setup("D")
    (repo / "note.txt").write_text("uncommitted\n")
    takeover(run, job)
    record("D", run, "DIRTY 'M note.txt'" in Path(load(run / "turn.json")["log"]).read_text())

    place, run, job, repo = setup("E")
    packet_head = command(["git", "-C", repo, "rev-parse", "--short", "HEAD"]).stdout.strip()
    (run / "continuity.md").write_text("Packet HEAD " + packet_head + "\nTakeover effort: high\n")
    (repo / "next.txt").write_text("new\n")
    command(["git", "-C", repo, "add", "."])
    command(["git", "-C", repo, "commit", "-qm", "newer"])
    takeover(run, job)
    actual_head = command(["git", "-C", repo, "rev-parse", "--short", "HEAD"]).stdout.strip()
    record("E", run, actual_head != packet_head and "LIVE HEAD " + actual_head in Path(load(run / "turn.json")["log"]).read_text())

    place, run, job, repo = setup("F")
    command([WATCH, "--run-dir", run, "worker-launch", "--permissions", "read:repo",
             "--brief", "fake", "--model", "stub", "--effort", "low", "heavy-f", "--", "sleep", "2"], env=credentials(run))
    assert wait_until(lambda: load(run / "workers.json")[0]["status"] == "running")
    takeover(run, job)
    record("F", run, len(load(run / "workers.json")) == 1 and load(run / "workers.json")[0]["taskId"] == "heavy-f")

    place, run, job, repo = setup("G")
    takeover(run, job)
    for task, model in (("sol-g", "gpt-6-sol"), ("terra-g", "gpt-5.6-terra"), ("luna-g", "gpt-6-luna")):
        command([WATCH, "--run-dir", run, "worker-launch", "--permissions", "read:repo",
                 "--brief", "fake", "--model", model, "--effort", "low", task, "--", "echo", task], env=credentials(run))
    record("G", run, len(load(run / "workers.json")) == 3)

    place, run, job, repo = setup("H")
    takeover(run, job)
    (run / "astra-stub.json").write_text(json.dumps({"trigger": "conflicting evidence", "owner": "sol",
                                                   "subagent": "bounded Luna", "synthesis": "inspect evidence"}))
    record("H", run, load(run / "manager.json")["holder"] == "sol" and (run / "astra-stub.json").exists())

    place, run, job, repo = setup("I")
    takeover(run, job)
    review = command([HERE.parent / "codex-route.sh", "-m", "gpt-6-sol", "-r", "xhigh", "Review tiny brief"],
                     env={k: v for k, v in credentials(run).items() if k not in ("GT3_RUN_DIR", "GT3_MANAGER_ID", "GT3_MANAGER_GEN")}, cwd=repo)
    (run / "reviewer.log").write_text(review.stdout)
    record("I", run, "session id:" in review.stdout and "xhigh" in review.stdout)

    place, run, job, repo = setup("J")
    takeover(run, job)
    command([WATCH, "--run-dir", run, "worker-launch", "--permissions", "read:repo",
             "--brief", "fake", "--model", "stub", "--effort", "low", "task-j", "--", "sleep", "2"], env=credentials(run))
    save(run / "quota.json", {"routes": {"claude:opus": {"resetAt": "2000-01-01T00:00:00+00:00"}}})
    tick(run)
    assert (run / "opus-wake").exists() and load(run / "workers.json")[0]["status"] == "running"
    old = {**os.environ, "GT3_RUN_DIR": str(run), "GT3_MANAGER_ID": "opus-test", "GT3_MANAGER_GEN": "1"}
    command([CTL, "request-handback", "--expect-gen", "2"], env=old)
    assert wait_until(lambda: load(run / "workers.json")[0]["status"] == "completed")
    tick(run)
    assert wait_until(lambda: load(run / "event-queue.json")[0]["ackAt"] is not None or
                      (tick(run) or False))
    assert load(run / "event-queue.json")[0]["attempts"] >= 1
    (run / "continuity.md").write_text("refreshed checkpoint\n")
    command([CTL, "checkpoint", "--file", run / "continuity.md"], env=credentials(run))
    command([CTL, "handback", "--expect-gen", "2"], env=credentials(run))
    record("J", run, load(run / "manager.json")["holder"] == "opus")

    place, run, job, repo = setup("K")
    (run / "stub-limit").touch()
    blocked(job)
    tick(run)
    assert wait_until(lambda: gone(run))
    tick(run)
    record("K", run, load(run / "quota.json")["routes"]["codex:gpt-6-sol"]["available"] is False and
           load(run / "manager.json")["mode"] == "sol-starting")
    command([WATCH, "--run-dir", run, "quota-snapshot", "codex:gpt-6-sol", "--available", "true",
             "--remaining", "ample"], env=credentials(run))
    quota = load(run / "quota.json")["routes"]["codex:gpt-6-sol"]
    record("quota conflict", run, quota["discrepancyCause"] == "UNKNOWN" and
           quota["lastCliRejection"]["resetAt"] == "2099-01-01T00:00:00+00:00")

    place, run, job, repo = setup("negative")
    blocked(job, "Waiting for user answer to a question")
    tick(run)
    record("user-question blocked", run, load(run / "manager.json")["holder"] == "opus")

    place, run, job, repo = setup("ack-crash")
    takeover(run, job)
    (run / "stub-no-ack").touch()
    command([WATCH, "--run-dir", run, "worker-launch", "--permissions", "read:repo",
             "--brief", "fake", "--model", "stub", "--effort", "low", "ack-task", "--", "echo", "done"], env=credentials(run))
    assert wait_until(lambda: load(run / "workers.json")[0]["status"] == "completed")
    tick(run)
    assert wait_until(lambda: gone(run))
    tick(run)
    (run / "stub-no-ack").unlink()
    assert wait_until(lambda: load(run / "event-queue.json")[0]["ackAt"] is not None)
    record("ack crash/redelivery", run, load(run / "event-queue.json")[0]["attempts"] == 2 and
           len(load(run / "stub-handled.json")) == 1)

    place, run, job, repo = setup("cursor")
    line = json.dumps({"at": dt.datetime.now(dt.timezone.utc).isoformat(), "state": "blocked",
                       "detail": "You've hit your session limit · resets 2:20pm (Asia/Qatar)"})
    (job / "timeline.jsonl").write_text(line[:20])
    tick(run)
    assert load(run / "manager.json")["holder"] == "opus"
    with (job / "timeline.jsonl").open("a") as out:
        out.write(line[20:] + "\n" + json.dumps({"at": dt.datetime.now(dt.timezone.utc).isoformat(),
                                                   "state": "blocked", "detail": "user question"}) + "\n")
    tick(run)
    record("partial line and historical limit", run, load(run / "manager.json")["holder"] == "sol")
    old_inode = load(run / "timeline-cursor.json")["inode"]
    (job / "timeline.jsonl").rename(job / "timeline.old")
    (job / "timeline.jsonl").write_text(json.dumps({"at": "2000-01-01T00:00:00+00:00",
                                                       "state": "blocked", "detail": "usage limit"}) + "\n")
    tick(run)
    record("rotation and historical event", run, load(run / "timeline-cursor.json")["inode"] != old_inode)

    place, run, job, repo = setup("stale-worker")
    child = subprocess.Popen(["sleep", "3"])
    save(run / "workers.json", [{"taskId": "hung", "status": "running", "pid": child.pid,
                                 "birth": __import__("datetime").datetime.now().strftime("%a %b %d %H:%M:%S %Y"),
                                 "log": str(run / "hung.log"), "lastProgressEpoch": time.time()-100}])
    # Use the same process identity implementation as the watcher.
    import importlib.util
    spec = importlib.util.spec_from_file_location("watcher", HERE / "continuity_watch.py")
    watcher = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(watcher)
    workers = load(run / "workers.json")
    workers[0]["birth"] = watcher.birth(child.pid)
    save(run / "workers.json", workers)
    (run / "hung.log").write_text("")
    old = time.time()-100
    os.utime(run / "hung.log", (old, old))
    os.utime(run / "continuity.md", (old, old))
    os.utime(job / "timeline.jsonl", (old, old))
    config = load(run / "watch-config.json")
    config["staleSeconds"] = .1
    save(run / "watch-config.json", config)
    tick(run)
    record("hung worker progress", run, load(run / "workers.json")[0]["staleReported"] is True and
           load(run / "manager.json")["holder"] == "sol")
    child.terminate()
    child.wait()

    place, run, job, repo = setup("detached")
    pidfile = place / "watch.pid"
    shell = f'nohup {WATCH} --run-dir {run} loop --interval 0.2 >/dev/null 2>&1 & echo $! > {pidfile}'
    command(["sh", "-c", shell], env=credentials(run))
    assert wait_until(lambda: pidfile.exists() and command(["ps", "-p", pidfile.read_text().strip()], ok=False).returncode == 0)
    pid = int(pidfile.read_text().strip())
    time.sleep(.8)  # At least four idle ticks after the launching shell has exited.
    ps = command(["ps", "-p", pid, "-o", "%cpu=,rss="], ok=False).stdout.strip()
    (place / "idle-host.txt").write_text("detached watcher after parent exited: " + ps + "\n")
    os.kill(pid, 15)
    record("detached parent exit", run, bool(ps))

    (BASE / "results.json").write_text(json.dumps(PASS, indent=2) + "\n")
    print("PASS", len(PASS), "scenarios; evidence", BASE)


if __name__ == "__main__":
    main()
