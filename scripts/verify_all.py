# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

"""The verification loop: lint, format, catalog validation, pytest, Node tests,
the web build, and (with --live) a scripted conversation against the API.

    python scripts/verify_all.py            # everything that runs without API access
    python scripts/verify_all.py --live     # adds the live smoke conversation
    python scripts/verify_all.py --skip-web # no node available

Steps run cheapest first, using --python or this script's interpreter. The loop exits
non-zero if any step failed. Dependencies must already be installed; the live step
uses the ambient credentials.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = REPO_ROOT / "examples"
NEXT = EXAMPLES / "node_modules" / "next" / "dist" / "bin" / "next"


class Step:
    def __init__(
        self, name: str, cmd: list[str], *, cwd: Path | None = None, env: dict | None = None
    ):
        self.name = name
        self.cmd = cmd
        self.cwd = cwd or REPO_ROOT
        self.env = env
        self.passed: bool | None = None
        self.duration: float = 0.0
        self.tail: str = ""

    def run(self) -> bool:
        started = time.perf_counter()
        merged_env = {**os.environ, "PYTHONIOENCODING": "utf-8", **(self.env or {})}
        result = subprocess.run(
            self.cmd,
            cwd=self.cwd,
            env=merged_env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        self.duration = time.perf_counter() - started
        self.passed = result.returncode == 0
        output = (result.stdout + result.stderr).strip()
        self.tail = "\n".join(output.splitlines()[-12:])
        return self.passed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--live", action="store_true", help="include steps that call the Anthropic API"
    )
    parser.add_argument("--skip-web", action="store_true", help="skip Node tests and the web build")
    parser.add_argument("--python", default=sys.executable, help="Python interpreter for checks")
    args = parser.parse_args()

    steps: list[Step] = [
        Step("lint (ruff check)", [args.python, "-m", "ruff", "check", "."]),
        Step("format (ruff format --check)", [args.python, "-m", "ruff", "format", "--check", "."]),
        Step("catalog validation", [args.python, "scripts/prepare_catalog.py", "--check"]),
        Step("tests (pytest)", [args.python, "-m", "pytest", "-q"]),
    ]

    if not args.skip_web:
        node = shutil.which("node")
        if not node or not NEXT.exists():
            print(
                "Web checks need Node.js and installed workspace dependencies; use --skip-web to omit."
            )
            return 1
        steps.append(
            Step(
                "browser identity and history (node test)",
                [
                    node,
                    "--import",
                    "./web-shared/tests/register.mjs",
                    "--test",
                    *map(str, sorted((EXAMPLES / "web-shared" / "tests").glob("*.test.mjs"))),
                ],
                cwd=EXAMPLES,
            )
        )
        steps.append(
            Step(
                "assistant storefront-web (next build)",
                [node, str(NEXT), "build"],
                cwd=EXAMPLES / "assistant" / "storefront-web",
                env={
                    "NEXT_TELEMETRY_DISABLED": "1",
                    "NEXT_IGNORE_INCORRECT_LOCKFILE": "1",
                    "SHOPPING_STANDALONE": "1",
                },
            )
        )

    if args.live:
        steps.append(Step("live smoke conversation", [args.python, "scripts/smoke_chat.py"]))

    print(f"verify_all: {len(steps)} steps\n")
    failures = []
    for step in steps:
        sys.stdout.write(f"  {step.name:<48} ... ")
        sys.stdout.flush()
        ok = step.run()
        print(f"{'PASS' if ok else 'FAIL'}  ({step.duration:.1f}s)")
        if not ok:
            failures.append(step)

    print()
    if failures:
        print(f"verify_all: {len(failures)} step(s) FAILED\n")
        for step in failures:
            print(f"--- {step.name} (last lines) ---")
            print(step.tail)
            print()
        return 1
    print("verify_all: all steps passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
