# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

"""A scripted live conversation against the assistant demo API, in-process or against a
running server, asserting that each turn calls the expected tools and emits the expected
events.

    python scripts/smoke_chat.py                          # in-process
    python scripts/smoke_chat.py --url http://localhost:8004

Needs Anthropic credentials (the demo's .env); each run costs a few cents.
"""

from __future__ import annotations

import argparse
import asyncio
import importlib
import json
import sys
import time
from pathlib import Path
from typing import Any

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "examples"))

SESSION_HEADER = "X-Session-Id"

TURNS: list[dict[str, Any]] = [
    {
        "message": (
            "I'm taking my partner and our 6-year-old camping for the first time next month. "
            "We need a tent — nothing too heavy to deal with, ideally under $250."
        ),
        "expect_tools": {"search_products"},
        "expect_events": {"ui", "turn_complete"},
    },
    {
        "message": "Compare the top two options for me — mostly care about space and ease of setup.",
        "expect_tools": set(),
        "expect_events": {"ui", "turn_complete"},
    },
    {
        "message": "The family one sounds right. Add it to my cart, and remind me what returns look like just in case.",
        "expect_tools": {"add_to_cart"},
        "expect_events": {"cart_update", "turn_complete"},
    },
]


async def start_session(client: httpx.AsyncClient, user_id: str = "demo-user") -> dict[str, str]:
    """Mint a token and return the header every later request carries."""
    response = await client.post("/api/session", json={"user_id": user_id})
    response.raise_for_status()
    return {SESSION_HEADER: response.json()["session_id"]}


async def run_turn(
    client: httpx.AsyncClient, headers: dict[str, str], message: str
) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    async with client.stream(
        "POST", "/api/chat", json={"message": message}, headers=headers, timeout=180.0
    ) as response:
        response.raise_for_status()
        current_event: str | None = None
        async for line in response.aiter_lines():
            if line.startswith("event: "):
                current_event = line.removeprefix("event: ").strip()
            elif line.startswith("data: ") and current_event:
                events.append(
                    {"type": current_event, "data": json.loads(line.removeprefix("data: "))}
                )
    return events


def summarize(events: list[dict[str, Any]]) -> str:
    text = "".join(e["data"].get("text", "") for e in events if e["type"] == "text_delta")
    tools = [e["data"]["tool"] for e in events if e["type"] == "tool_call"]
    uis = [e["data"]["component"] for e in events if e["type"] == "ui"]
    usage = next((e["data"].get("usage", {}) for e in events if e["type"] == "turn_complete"), {})
    return (
        f"    tools: {tools or '-'}\n"
        f"    ui:    {uis or '-'}\n"
        f"    text:  {len(text)} chars | tokens in/out: "
        f"{usage.get('input_tokens', '?')}/{usage.get('output_tokens', '?')} "
        f"(cache read {usage.get('cache_read_input_tokens', '?')})"
    )


def check(events: list[dict[str, Any]], turn: dict[str, Any]) -> list[str]:
    failures = []
    seen_tools = {e["data"]["tool"] for e in events if e["type"] == "tool_call"}
    seen_types = {e["type"] for e in events}
    for tool in turn.get("expect_tools", set()):
        if tool not in seen_tools:
            failures.append(f"expected a {tool} call, saw {sorted(seen_tools) or 'none'}")
    for event_type in turn.get("expect_events", set()):
        if event_type not in seen_types:
            failures.append(f"expected a {event_type} event, saw {sorted(seen_types)}")
    if any(e["type"] == "error" for e in events):
        failures.append("turn emitted an error event")
    return failures


async def run_smoke(args: argparse.Namespace, app_module: Any | None) -> int:
    if app_module is None:
        client = httpx.AsyncClient(base_url=args.url)
    else:
        # The demo API answers only to loopback host names.
        client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app_module.app), base_url="http://localhost"
        )
    ok = True
    async with client:
        headers = await start_session(client)
        for index, turn in enumerate(TURNS, start=1):
            print(f"\n[{index}/{len(TURNS)}] user: {turn['message'][:80]}...")
            started = time.perf_counter()
            events = await run_turn(client, headers, turn["message"])
            print(f"    {len(events)} events in {time.perf_counter() - started:.1f}s")
            print(summarize(events))
            failures = check(events, turn)
            for failure in failures:
                print(f"    FAIL: {failure}")
            ok = ok and not failures
    print("\nSMOKE", "PASSED" if ok else "FAILED")
    return 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--url", help="base URL of a running demo API; in-process when omitted")
    args = parser.parse_args()
    # The in-process app is imported before the event loop starts: the demo's main seeds
    # memory with asyncio.run() at import time.
    app_module = None if args.url else importlib.import_module("assistant.api.main")
    return asyncio.run(run_smoke(args, app_module))


if __name__ == "__main__":
    sys.exit(main())
