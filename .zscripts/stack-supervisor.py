#!/usr/bin/env python3
"""PataFundi stack supervisor — double-forked daemon, immune to session reaping.

Keeps backend (:4000) and frontend (:3000) alive; restarts either within
MONITOR_INTERVAL seconds if it dies. Logs to .zscripts/supervisor.log.
"""
import os
import sys
import time
import subprocess
import socket

PROJECT = "/home/z/my-project"
LOG = os.path.join(PROJECT, ".zscripts", "supervisor.log")
MONITOR_INTERVAL = 5
BACKEND_PORT = 4000
FRONTEND_PORT = 3000


def log(msg):
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n"
    with open(LOG, "a") as f:
        f.write(line)
    # keep log bounded
    try:
        if os.path.getsize(LOG) > 5 * 1024 * 1024:
            with open(LOG, "r") as f:
                lines = f.readlines()
            with open(LOG, "w") as f:
                f.writelines(lines[-2000:])
    except OSError:
        pass


def port_open(port, timeout=2):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout):
            return True
    except OSError:
        return False


def spawn(cmd, cwd):
    env = dict(os.environ)
    env.setdefault("NODE_ENV", "development")
    logf = open(f"{PROJECT}/.zscripts/sup-{os.path.basename(cmd[-1]) if cmd else 'proc'}.log", "a")
    p = subprocess.Popen(
        cmd,
        cwd=cwd,
        stdout=logf,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        start_new_session=True,
        env=env,
    )
    log(f"spawned {' '.join(cmd)} (pid {p.pid}) from {cwd}")
    return p


def double_fork():
    # First fork
    pid = os.fork()
    if pid > 0:
        sys.exit(0)  # parent exits
    os.setsid()
    # Second fork
    pid = os.fork()
    if pid > 0:
        sys.exit(0)  # intermediate exits
    # grandchild: fully orphaned daemon, PPID = 1
    sys.stdout.flush()
    sys.stderr.flush()
    # detach stdio
    devnull = os.open(os.devnull, os.O_RDWR)
    os.dup2(devnull, 0)
    os.dup2(devnull, 1)
    os.dup2(devnull, 2)
    if devnull > 2:
        os.close(devnull)


def main():
    log("=== stack supervisor starting (PPID %d) ===" % os.getppid())
    procs = {"backend": None, "frontend": None}
    while True:
        # Backend
        if not port_open(BACKEND_PORT):
            if procs["backend"] is not None:
                try:
                    procs["backend"].poll()
                except Exception:
                    pass
                log("backend DOWN on :4000 — restarting")
            procs["backend"] = spawn(
                ["node", os.path.join(PROJECT, "backend/src/server.js")], PROJECT
            )
            time.sleep(3)
        # Frontend
        if not port_open(FRONTEND_PORT):
            if procs["frontend"] is not None:
                try:
                    procs["frontend"].poll()
                except Exception:
                    pass
                log("frontend DOWN on :3000 — restarting")
            procs["frontend"] = spawn(
                ["npm", "run", "dev", "--", "--port", "3000", "--strictPort"],
                os.path.join(PROJECT, "frontend"),
            )
            time.sleep(3)
        time.sleep(MONITOR_INTERVAL)


if __name__ == "__main__":
    double_fork()
    main()
