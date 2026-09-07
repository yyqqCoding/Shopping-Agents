# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

"""Run the assistant demo (API + web app) with one command.

    python scripts/run_demo.py                  # API :8004 + web :3004
    python scripts/run_demo.py --api-only       # just the API

Boots uvicorn and the Next.js dev server, waits until they answer, prints the URLs, and
stops everything on Ctrl-C. Python packages and the examples/ npm workspace are installed
on first run. Ports are preferences: the API already running on its port is reused; any
other busy port moves the server to the next free one, and the web app is pointed at
wherever the API is. Chat credentials come from the demo's .env, the repo-root .env, then
the SDK's credential chain; browsing needs none.
"""

from __future__ import annotations

import argparse
import contextlib
import importlib.util
import json
import os
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

REPO_ROOT = Path(__file__).resolve().parents[1]
EXAMPLES_DIR = REPO_ROOT / "examples"
DEMO_DIR = EXAMPLES_DIR / "assistant"
NEXT = EXAMPLES_DIR / "node_modules" / ".bin" / "next"

API_PORT = 8004
WEB_PORT = 3004
STORE = "ACME"

PYTHON_MODULES = (
    "commerce_common",
    "shopping_agent",
    "shopping_agent_runtime",
    "fastapi",
    "uvicorn",
    "dotenv",
)

GREEN, YELLOW, DIM, RESET = "\033[32m", "\033[33m", "\033[2m", "\033[0m"


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        return sock.connect_ex(("127.0.0.1", port)) == 0


def find_free_port(preferred: int, span: int = 50) -> int:
    for port in range(preferred, preferred + span):
        if not port_in_use(port):
            return port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def env_file_has_key(path: Path) -> bool:
    """True when the file sets a non-empty ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY."""
    if not path.exists():
        return False
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        key, _, value = line.strip().partition("=")
        if key.strip() in ("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY") and value.strip().strip(
            "\"'"
        ):
            return True
    return False


def healthy_demo_api(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://localhost:{port}/api/health", timeout=2) as response:
            return json.load(response).get("store") == STORE
    except Exception:  # anything else on the port is not ours
        return False


def plan_api_port(preferred: int, no_reuse: bool) -> tuple[int, bool]:
    """``(port, reuse)``: reuse the demo's own API on the preferred port, else a free one."""
    if not port_in_use(preferred):
        return preferred, False
    if not no_reuse and healthy_demo_api(preferred):
        return preferred, True
    return find_free_port(preferred + 1), False


def wait_for(url: str, timeout_s: float, process: subprocess.Popen | None = None) -> bool:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if process is not None and process.poll() is not None:
            return False
        try:
            with urllib.request.urlopen(url, timeout=2):
                return True
        except Exception:  # not up yet
            time.sleep(0.5)
    return False


def pipe_output(process: subprocess.Popen, label: str) -> None:
    def run() -> None:
        assert process.stdout is not None
        for line in process.stdout:
            sys.stdout.write(f"{DIM}[{label}]{RESET} {line.decode(errors='replace')}")

    threading.Thread(target=run, daemon=True).start()


def ensure_python_deps(install: bool) -> None:
    missing = [m for m in PYTHON_MODULES if importlib.util.find_spec(m) is None]
    if not missing:
        return
    requirements = REPO_ROOT / "requirements.txt"
    if not install:
        sys.exit(
            f"Missing Python packages ({', '.join(missing)}). Run: pip install -r {requirements}"
        )
    print(f"{YELLOW}Installing the repository's Python packages (first run)…{RESET}")
    subprocess.run([sys.executable, "-m", "pip", "install", "-r", str(requirements)], check=True)


def ensure_web_deps(install: bool) -> None:
    """The web app and its shared package are one npm workspace at examples/, installed once."""
    if NEXT.exists():
        return
    if not install:
        sys.exit(f"{EXAMPLES_DIR}/node_modules missing — run `npm ci` in {EXAMPLES_DIR} first.")
    print(f"{YELLOW}Installing the web workspace (first run)…{RESET}")
    result = subprocess.run(["npm", "ci", "--no-audit", "--no-fund"], cwd=EXAMPLES_DIR)
    if result.returncode:
        sys.exit(f"npm ci failed (see above); fix the registry, or run it in {EXAMPLES_DIR}.")


def spawn(command: list[str], cwd: Path, env: dict[str, str] | None = None) -> subprocess.Popen:
    return subprocess.Popen(
        command,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        start_new_session=True,  # each child owns a process group, so shutdown takes its tree
    )


def start_api(port: int, federated: bool) -> subprocess.Popen:
    env = os.environ.copy()
    if federated:
        env["COMMERCE_DEMO_AUTH"] = "sdk"
    command = [
        sys.executable,
        "-m",
        "uvicorn",
        "assistant.api.main:app",
        "--app-dir",
        str(EXAMPLES_DIR),
        "--port",
        str(port),
    ]
    return spawn(command, REPO_ROOT, env)


def start_web(port: int, api_port: int, prod: bool) -> subprocess.Popen:
    app_dir = DEMO_DIR / "storefront-web"
    env = {
        **os.environ,
        "NEXT_PUBLIC_API_URL": "",
        "API_INTERNAL_URL": f"http://127.0.0.1:{api_port}",
    }
    if prod:
        subprocess.run([str(NEXT), "build"], cwd=app_dir, check=True, env=env)
    return spawn([str(NEXT), "start" if prod else "dev", "--port", str(port)], app_dir, env)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(__doc__ or "").partition("\n")[0],
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(__doc__ or "").partition("\n")[2],
    )
    side = parser.add_mutually_exclusive_group()
    side.add_argument("--api-only", action="store_true", help="start only the API")
    side.add_argument("--web-only", action="store_true", help="start only the web app")
    parser.add_argument(
        "--api-port",
        type=int,
        metavar="PORT",
        help="preferred API port (with --web-only: its port)",
    )
    parser.add_argument("--no-reuse", action="store_true", help="always boot a fresh API")
    parser.add_argument("--no-install", action="store_true", help="fail instead of installing")
    parser.add_argument("--prod", action="store_true", help="next build + start instead of dev")
    parser.add_argument(
        "--federated",
        action="store_true",
        help="authenticate through the SDK's credential chain, ignoring key files and ANTHROPIC_API_KEY",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()

    def terminate(signum: int, frame: object) -> None:
        del signum, frame
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, terminate)

    api_port = args.api_port if args.api_port is not None else API_PORT
    run_api, run_web = not args.web_only, not args.api_only

    web_port = WEB_PORT
    reuse_api = False
    if run_api:
        preferred = api_port
        api_port, reuse_api = plan_api_port(preferred, args.no_reuse)
        if reuse_api:
            print(f"{DIM}{STORE} API already running on :{api_port} — reusing it.{RESET}")
        elif api_port != preferred:
            print(f"{YELLOW}Port {preferred} is busy — starting the API on :{api_port}.{RESET}")
    if run_web and port_in_use(web_port):
        moved = find_free_port(web_port + 1)
        print(f"{YELLOW}Port {web_port} is busy — starting the web app on :{moved}.{RESET}")
        web_port = moved

    if (
        run_api
        and not reuse_api
        and not args.federated
        and not os.environ.get("ANTHROPIC_API_KEY")
        and not os.environ.get("ANTHROPIC_AUTH_TOKEN")
        and not env_file_has_key(DEMO_DIR / ".env")
        and not env_file_has_key(REPO_ROOT / ".env")
    ):
        print(
            f"{YELLOW}No Anthropic credentials found; chat uses the SDK's credential chain if "
            f"one is configured and otherwise returns an error event. To use a key:{RESET}\n"
            "  cp .env.example .env   # at the repo root; fill in the key and restart"
        )

    processes: list[tuple[str, subprocess.Popen]] = []
    try:
        if run_api and not reuse_api:
            ensure_python_deps(install=not args.no_install)
            api = start_api(api_port, args.federated)
            processes.append(("api", api))
            pipe_output(api, "assistant-api")
            if not wait_for(f"http://localhost:{api_port}/api/health", 90, api):
                raise RuntimeError(f"The API didn't come up on :{api_port} — see output above.")
        if run_web:
            ensure_web_deps(install=not args.no_install)
            web = start_web(web_port, api_port, args.prod)
            processes.append(("web", web))
            pipe_output(web, "assistant-web")
            if not wait_for(f"http://localhost:{web_port}", 180, web):
                raise RuntimeError(f"The web app didn't come up on :{web_port} — see output above.")

        print(f"\n{GREEN}✓ the assistant demo is up{RESET}")
        if run_web:
            print(f"  {'web':<8} http://localhost:{web_port}")
        print(f"  {'api':<8} http://localhost:{api_port}/api/health")
        if not processes:
            print(f"{DIM}Nothing new was started; everything was already running.{RESET}")
            return 0
        print(f"{DIM}Ctrl-C stops everything.{RESET}\n")
        while all(process.poll() is None for _, process in processes):
            time.sleep(1)
        for name, process in processes:
            if process.poll() is not None:
                print(f"{YELLOW}{name} exited with code {process.returncode}.{RESET}")
                return process.returncode or 1
        return 0
    except RuntimeError as error:
        print(f"{YELLOW}{error}{RESET}")
        return 1
    except KeyboardInterrupt:
        print("\nShutting down…")
        return 0
    finally:
        for _, process in processes:
            if process.poll() is None:
                with contextlib.suppress(ProcessLookupError, PermissionError):
                    os.killpg(os.getpgid(process.pid), signal.SIGTERM)
        deadline = time.monotonic() + 10
        for _, process in processes:
            try:
                process.wait(timeout=max(0.1, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                with contextlib.suppress(ProcessLookupError, PermissionError):
                    os.killpg(os.getpgid(process.pid), signal.SIGKILL)


if __name__ == "__main__":
    raise SystemExit(main())
