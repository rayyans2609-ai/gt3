#!/usr/bin/env python3
"""Deterministic local crash/race tests; no model calls or product runtime."""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor


HERE = Path(__file__).resolve().parent
CTL = HERE / "controller.py"
ROUTE = HERE.parent / "codex-route.sh"
GIT = HERE / "guarded-git.sh"
spec = importlib.util.spec_from_file_location("gt3_controller", CTL)
controller = importlib.util.module_from_spec(spec)
spec.loader.exec_module(controller)


def call(run_dir, *args, ident=None, generation=None, crash=None, data=None, executable=CTL, path=None):
    env = os.environ.copy()
    env["GT3_RUN_DIR"] = str(run_dir)
    env.pop("GT3_MANAGER_ID", None)
    env.pop("GT3_MANAGER_GEN", None)
    env.pop("GT3_CTL_CRASH_AT", None)
    if ident is not None:
        env["GT3_MANAGER_ID"] = ident
    if generation is not None:
        env["GT3_MANAGER_GEN"] = str(generation)
    if crash:
        env["GT3_CTL_CRASH_AT"] = crash
    if path:
        env["PATH"] = str(path) + os.pathsep + env["PATH"]
    command = [sys.executable, str(executable)] if executable.suffix == ".py" else [str(executable)]
    return subprocess.run(command + list(map(str, args)), env=env, input=data,
                          capture_output=True, text=True)


def ok(result):
    assert result.returncode == 0, (result.returncode, result.stderr)
    return result


def refused(result):
    assert result.returncode == 3, (result.returncode, result.stderr)
    return result


def state(run_dir):
    return json.loads((run_dir / "manager.json").read_text())


def new_run(tmp):
    run_dir = tmp / "run"
    ok(call(run_dir, "init", "--opus-id", "opus-session"))
    return run_dir


def failover(run_dir):
    ok(call(run_dir, "failover", "--expect-gen", 1, "--expect-id", "opus-session",
            "--sol-id", "sol-session"))
    return state(run_dir)


def test_crash_claim(tmp):
    run = tmp / "claim"
    assert call(run, "init", "--opus-id", "opus-session", crash="claim-acquired").returncode == 97
    assert not (run / "manager.json").exists()
    ok(call(run, "init", "--opus-id", "opus-session"))


def test_crash_publication(tmp):
    run = tmp / "publication"
    assert call(run, "init", "--opus-id", "opus-session",
                crash="before-metadata-publication").returncode == 97
    assert not (run / "manager.json").exists()
    ok(call(run, "init", "--opus-id", "opus-session"))
    assert call(run, "failover", "--expect-gen", 1, "--expect-id", "opus-session",
                "--sol-id", "sol-session", crash="before-metadata-publication").returncode == 97
    assert state(run)["mode"] == "opus-primary"
    failover(run)


def test_dispatch_admission(tmp):
    run = new_run(tmp)
    for stage, expected in (("after-intent", "intent"), ("after-admission", "admitted")):
        assert call(run, "admit", "dispatch", ident="opus-session", generation=1,
                    crash=stage).returncode == 97
        actions = json.loads((run / "actions.json").read_text())
        assert actions[-1]["state"] == expected
        refused(call(run, "failover", "--expect-gen", 1, "--expect-id", "opus-session",
                     "--sol-id", "sol-session"))
        ok(call(run, "reconcile", actions[-1]["id"], "--outcome", "not-started",
                "--reason", "stub verified no child", ident="opus-session", generation=1))
    failover(run)


def test_child_registration_intent(tmp):
    run = new_run(tmp)
    assert call(run, "register-process", "--pid", os.getpid(), "--tag", "fake-worker",
                ident="opus-session", generation=1, crash="child-registration-intent").returncode == 97
    assert json.loads((run / "processes.json").read_text()) == []
    action = json.loads((run / "actions.json").read_text())[-1]
    assert action["state"] == "admitted"
    refused(call(run, "failover", "--expect-gen", 1, "--expect-id", "opus-session",
                 "--sol-id", "sol-session"))
    ok(call(run, "reconcile", action["id"], "--outcome", "not-started", "--reason",
            "registration publication absent", ident="opus-session", generation=1))
    failover(run)


def test_concurrent_reclaimers(tmp):
    run = new_run(tmp)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: call(run, "failover", "--expect-gen", 1,
                                                "--expect-id", "opus-session", "--sol-id",
                                                "sol-session"), range(2)))
    assert sorted(r.returncode for r in results) == [0, 3]
    assert state(run)["generation"] == 2


def test_pid_reuse(tmp):
    birth = controller.process_birth(os.getpid())
    assert birth and controller.same_process({"pid": os.getpid(), "birth": birth})
    assert not controller.same_process({"pid": os.getpid(), "birth": "old-process-birth"})
    run = new_run(tmp)
    ok(call(run, "turn", "start", "--pid", os.getpid(), ident="opus-session", generation=1))
    refused(call(run, "failover", "--expect-gen", 1, "--expect-id", "opus-session",
                 "--sol-id", "sol-session"))
    ok(call(run, "turn", "end", ident="opus-session", generation=1))


def test_simultaneous_return(tmp):
    run = new_run(tmp)
    with ThreadPoolExecutor(max_workers=2) as pool:
        future1 = pool.submit(call, run, "failover", "--expect-gen", 1,
                              "--expect-id", "opus-session", "--sol-id", "sol-session")
        future2 = pool.submit(call, run, "request-handback", "--expect-gen", 2,
                              ident="opus-session", generation=1)
        codes = sorted([future1.result().returncode, future2.result().returncode])
    assert codes == [0, 3]
    assert state(run)["mode"] == "sol-starting"
    assert state(run)["generation"] == 2


def test_stale_mutations(tmp):
    run = new_run(tmp)
    failover(run)
    bin_dir = tmp / "bin"
    bin_dir.mkdir()
    for name in ("codex", "git"):
        stub = bin_dir / name
        stub.write_text("#!/bin/sh\necho invoked >> \"$GT3_RUN_DIR/invoked\"\n")
        stub.chmod(0o755)
    for ident, generation in (("opus-session", 1), (None, None)):
        refused(call(run, "-m", "gpt-6-luna", "-r", "low", "test",
                     ident=ident, generation=generation, executable=ROUTE, path=bin_dir))
        refused(call(run, "commit", "-m", "test", ident=ident, generation=generation,
                     executable=GIT, path=bin_dir))
        refused(call(run, "write", str(tmp / "target"), ident=ident,
                     generation=generation, data="stale"))
    assert not (run / "invoked").exists()
    assert not (tmp / "target").exists()
    empty_env = os.environ.copy()
    empty_env["GT3_RUN_DIR"] = ""
    empty_env["PATH"] = str(bin_dir) + os.pathsep + empty_env["PATH"]
    empty = subprocess.run([str(ROUTE), "-m", "gpt-6-luna", "-r", "low", "test"],
                           env=empty_env, capture_output=True, text=True)
    refused(empty)
    ok(call(run, "-m", "gpt-6-luna", "-r", "low", "test", ident="sol-session",
            generation=2, executable=ROUTE, path=bin_dir))
    assert (run / "invoked").read_text().strip() == "invoked"


def test_late_ack(tmp):
    run = new_run(tmp)
    failover(run)
    ok(call(run, "ack", "--expect-gen", 2, ident="sol-session", generation=2))
    refused(call(run, "ack", "--expect-gen", 2, ident="sol-session", generation=2))
    assert state(run)["mode"] == "sol-continuity"
    assert state(run)["generation"] == 2


def test_single_manager_launch(tmp):
    run = new_run(tmp)
    failover(run)
    env = os.environ.copy()
    env.update(GT3_RUN_DIR=str(run), GT3_MANAGER_ID="sol-session", GT3_MANAGER_GEN="2")
    child = subprocess.Popen([sys.executable, str(CTL), "launch-manager", "--",
                              sys.executable, "-c", "import time; time.sleep(0.5)"],
                             env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for _ in range(30):
            if state(run)["activeTurn"]:
                break
            time.sleep(0.02)
        assert state(run)["activeTurn"]
        refused(call(run, "launch-manager", "--", sys.executable, "-c", "pass",
                     ident="sol-session", generation=2))
        assert child.wait(timeout=2) == 0
        assert state(run)["activeTurn"] is None
    finally:
        if child.poll() is None:
            child.terminate()
            child.wait(timeout=2)


def handback_ready(run):
    failover(run)
    ok(call(run, "ack", "--expect-gen", 2, ident="sol-session", generation=2))
    ok(call(run, "request-handback", "--expect-gen", 2, ident="opus-session", generation=1))
    packet = run / "continuity.md"
    ok(call(run, "write", packet, ident="sol-session", generation=2,
            data="checkpoint after return\n"))
    ok(call(run, "checkpoint", "--file", packet, ident="sol-session", generation=2))


def test_crash_handback(tmp):
    run = new_run(tmp)
    handback_ready(run)
    assert call(run, "handback", "--expect-gen", 2, ident="sol-session", generation=2,
                crash="mid-handback").returncode == 97
    assert state(run)["holder"] == "sol" and state(run)["generation"] == 2
    ok(call(run, "handback", "--expect-gen", 2, ident="sol-session", generation=2))
    assert state(run)["holder"] == "opus" and state(run)["generation"] == 3
    refused(call(run, "handback", "--expect-gen", 2, ident="sol-session", generation=2))
    second = tmp / "second"
    second.mkdir()
    run2 = new_run(second)
    handback_ready(run2)
    assert call(run2, "handback", "--expect-gen", 2, ident="sol-session", generation=2,
                crash="after-handback-publication").returncode == 97
    assert state(run2)["holder"] == "opus" and state(run2)["generation"] == 3
    refused(call(run2, "handback", "--expect-gen", 2, ident="sol-session", generation=2))


def test_second_failover(tmp):
    run = new_run(tmp)
    failover(run)
    refused(call(run, "failover", "--expect-gen", 1, "--expect-id", "opus-session",
                 "--sol-id", "other-sol"))
    assert state(run)["mode"] == "sol-starting"


TESTS = [
    ("crash at claim acquisition", test_crash_claim),
    ("crash before metadata publication", test_crash_publication),
    ("crash at dispatch admission", test_dispatch_admission),
    ("crash at child registration intent", test_child_registration_intent),
    ("concurrent reclaimers", test_concurrent_reclaimers),
    ("PID reuse identity", test_pid_reuse),
    ("simultaneous failover and Opus return", test_simultaneous_return),
    ("stale or missing routed mutations", test_stale_mutations),
    ("late acknowledgement", test_late_ack),
    ("single live manager launch", test_single_manager_launch),
    ("crash during handback", test_crash_handback),
    ("second failover in sol-starting", test_second_failover),
]


def main():
    failures = 0
    for name, test in TESTS:
        try:
            with tempfile.TemporaryDirectory(prefix="gt3-ctl-test-") as temporary:
                test(Path(temporary))
            print("PASS  " + name)
        except Exception as error:
            failures += 1
            print("FAIL  " + name + ": " + repr(error))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
