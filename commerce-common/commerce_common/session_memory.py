# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

"""Session-memory policy and isolated exact-string note editing, ported from the reference."""

from __future__ import annotations

import asyncio
import copy
import itertools
import json
import logging
import math
import re
import time
from dataclasses import dataclass
from typing import Any

NOTE_PATH = "session-memory/summary.md"
NOTE_TEMPLATE = """# Session Title
_A short and distinctive 5-10 word descriptive title for the session. Super info dense, no filler_

# Current State
_What is actively being worked on right now? Pending tasks not yet completed. Immediate next steps._

# Task specification
_What did the user ask to build? Any design decisions or other explanatory context_

# Files and Functions
_What are the important files? In short, what do they contain and why are they relevant?_

# Workflow
_What bash commands are usually run and in what order? How to interpret their output if not obvious?_

# Errors & Corrections
_Errors encountered and how they were fixed. What did the user correct? What approaches failed and should not be tried again?_

# Codebase and System Documentation
_What are the important system components? How do they work/fit together?_

# Learnings
_What has worked well? What has not? What to avoid? Do not duplicate items from other sections_

# Key results
_If the user asked a specific output such as an answer to a question, a table, or other document, repeat the exact result here_

# Worklog
_Step by step, what was attempted, done? Very terse summary for each step_
"""
NOTE_UPDATE_PROMPT = """IMPORTANT: This message and these instructions are NOT part of the actual user conversation. Do NOT include any references to "note-taking", "session notes extraction", or these update instructions in the notes content.

Based on the user conversation above (EXCLUDING this note-taking instruction message as well as system prompt, claude.md entries, or any past session summaries), update the session notes file.

The file {{notesPath}} has already been read for you. Here are its current contents:
<current_notes_content>
{{currentNotes}}
</current_notes_content>

Your ONLY task is to use the memory_edit tool to update the notes file, then stop. You can make multiple edits (update every section as needed) - make all memory_edit tool calls in parallel in a single message. Do not call any other tools.

CRITICAL RULES FOR EDITING:
- The file must maintain its exact structure with all sections, headers, and italic descriptions intact
-- NEVER modify, delete, or add section headers (the lines starting with '#' like # Task specification)
-- NEVER modify or delete the italic _section description_ lines (these are the lines in italics immediately following each header - they start and end with underscores)
-- The italic _section descriptions_ are TEMPLATE INSTRUCTIONS that must be preserved exactly as-is - they guide what content belongs in each section
-- ONLY update the actual content that appears BELOW the italic _section descriptions_ within each existing section
-- Do NOT add any new sections, summaries, or information outside the existing structure
- Do NOT reference this note-taking process or instructions anywhere in the notes
- It's OK to skip updating a section if there are no substantial new insights to add. Do not add filler content like "No info yet", just leave sections blank/unedited if appropriate.
- Write DETAILED, INFO-DENSE content for each section - include specifics like file paths, function names, error messages, exact commands, technical details, etc.
- For "Key results", include the complete, exact output the user requested (e.g., full table, full answer, etc.)
- Do not include information that's already in the CLAUDE.md files included in the context
- Keep each section under ~2000 tokens/words - if a section is approaching this limit, condense it by cycling out less important details while preserving the most critical information
- Focus on actionable, specific information that would help someone understand or recreate the work discussed in the conversation
- IMPORTANT: Always update "Current State" to reflect the most recent work - this is critical for continuity after compaction

Use the memory_edit tool with filename: {{notesPath}}

STRUCTURE PRESERVATION REMINDER:
Each section has TWO parts that must be preserved exactly as they appear in the current file:
1. The section header (line starting with #)
2. The italic description line (the _italicized text_ immediately after the header - this is a template instruction)

You ONLY update the actual content that comes AFTER these two preserved lines. The italic description lines starting and ending with underscores are part of the template structure, NOT content to be edited or removed.

REMEMBER: Use the memory_edit tool in parallel and stop. Do not continue after the edits. Only include insights from the actual user conversation, never from these note-taking instructions. Do not delete or change section headers or italic _section descriptions_."""

logger = logging.getLogger(__name__)


def rough_tokens(text: str) -> int:
    """Reference JS Math.round(UTF-16 length / 4), for retention and section sizing."""
    return math.floor(len(text.encode("utf-16-le")) / 8 + 0.5)


def estimate_message_tokens(messages: list[dict[str, Any]]) -> int:
    """Reference compact estimator: content-only estimates, padded by 4/3."""

    def block_tokens(block: dict[str, Any]) -> int:
        kind = block.get("type")
        if kind in {"image", "document"}:
            return 2000
        if kind == "text":
            return rough_tokens(block.get("text", ""))
        if kind == "tool_result":
            content = block.get("content", "")
            return (
                rough_tokens(content)
                if isinstance(content, str)
                else sum(block_tokens(value) for value in content if isinstance(value, dict))
            )
        if kind in {"thinking", "redacted_thinking"}:
            return rough_tokens(block.get("thinking" if kind == "thinking" else "data", ""))
        if kind == "tool_use":
            return rough_tokens(
                block.get("name", "")
                + json.dumps(block.get("input", {}), ensure_ascii=False, separators=(",", ":"))
            )
        return rough_tokens(json.dumps(block, ensure_ascii=False, separators=(",", ":")))

    total = 0
    for message in messages:
        content = message.get("content", "")
        total += (
            rough_tokens(content)
            if isinstance(content, str)
            else sum(block_tokens(block) for block in content if isinstance(block, dict))
        )
    return math.ceil(total * 4 / 3)


def tool_count(messages: list[dict[str, Any]]) -> int:
    return sum(
        block.get("type") == "tool_use"
        for message in messages
        if message.get("role") == "assistant"
        for block in message.get("content", [])
        if isinstance(block, dict)
    )


def should_extract(
    tokens: int,
    *,
    initialized: bool,
    last_tokens: int,
    tools_since: int,
    has_tools: bool,
    init_tokens: int = 10000,
    growth_tokens: int = 5000,
    tool_threshold: int = 3,
) -> bool:
    return (
        (initialized or tokens >= init_tokens)
        and tokens - last_tokens >= growth_tokens
        and (tools_since >= tool_threshold or not has_tools)
    )


@dataclass(frozen=True)
class NoteSnapshot:
    boundary_id: str
    prefix: dict[str, Any]
    tokens: int
    tool_cursor: int
    has_tools: bool
    initialized: bool = False


def note_is_empty(content: str) -> bool:
    return not content.strip() or content.strip() == NOTE_TEMPLATE.strip()


def truncate_note(content: str) -> str:
    """Reference section cap: 2000 * 4 UTF-16 code units, at line boundaries."""
    output: list[str] = []
    section: list[str] = []
    size = 0
    truncated = False
    for line in content.splitlines():
        if line.startswith("# "):
            if truncated:
                section.append("[section truncated; read session-memory/summary.md for full notes]")
            output.extend(section)
            section, size, truncated = [line], 0, False
        elif not truncated and size + len(line.encode("utf-16-le")) // 2 + 1 <= 8000:
            section.append(line)
            size += len(line.encode("utf-16-le")) // 2 + 1
        else:
            truncated = True
    if truncated:
        section.append("[section truncated; read session-memory/summary.md for full notes]")
    return "\n".join(output + section)


async def update_note(
    client: Any,
    snapshot: NoteSnapshot,
    current: str,
    *,
    timeout: float,
    input_budget: int,
    session_id: str,
) -> str:
    """The inherited tool list stays identical; only this branch may edit NOTE_PATH."""
    from .turn import assistant_message, log_model_call, tool_arguments

    staged = current or NOTE_TEMPLATE
    saved = copy.deepcopy(snapshot.prefix)
    saved["tool_choice"] = {"type": "auto"}
    if "memory_edit" not in {tool.get("name") for tool in saved.get("tools", [])}:
        raise ValueError("The inherited tool list has no exact-string note editor")
    messages = saved.pop("messages")
    base_count = len(messages)
    reminders = []
    for section in staged.split("\n# "):
        if rough_tokens(section) > 2000:
            reminders.append(f"Condense oversized section: {section.splitlines()[0]}")
    if rough_tokens(staged) > 12000:
        reminders.append(
            "CRITICAL: condense notes below 12000 tokens; prioritize Current State and Errors & Corrections."
        )
    variables = {"notesPath": NOTE_PATH, "currentNotes": staged}
    prompt = re.sub(
        r"\{\{(\w+)\}\}", lambda match: variables.get(match[1], match[0]), NOTE_UPDATE_PROMPT
    )
    prompt += (
        "\nWrite factual content in Chinese. Namespace must be omitted or auto. Other tools and paths are denied.\n"
        + "\n".join(reminders)
    )
    messages.append({"role": "user", "content": prompt})
    edited = False
    async with asyncio.timeout(timeout):
        for iteration in itertools.count():
            extra_bytes = len(json.dumps(messages[base_count:], ensure_ascii=False).encode())
            if snapshot.tokens + extra_bytes > input_budget:
                raise ValueError("Session-note fork exceeds the configured window")
            request = saved | {"messages": messages}
            started = time.monotonic()
            response = await client.messages.create(**request)
            log_model_call(
                logger,
                request,
                response,
                started,
                session_id,
                operation="session_note",
                round=iteration,
                inherited=True,
            )
            if getattr(response, "stop_reason", None) == "max_tokens":
                raise ValueError("Session-note response was truncated")
            if reply := assistant_message(response):
                messages.append(reply)
            calls = [block for block in response.content if block.type == "tool_use"]
            if not calls:
                if not edited or note_is_empty(staged):
                    raise ValueError("Session-note branch did not edit its file")
                return staged
            results = []
            for call in calls:
                args = tool_arguments(call) or {}
                error = None
                if (
                    call.name != "memory_edit"
                    or args.get("filename") != NOTE_PATH
                    or args.get("namespace") not in (None, "", "auto")
                ):
                    error = "Permission denied: only memory_edit with filename=session-memory/summary.md and namespace omitted or auto is allowed."
                else:
                    old, new = args.get("old_string"), args.get("new_string")
                    if (
                        not isinstance(old, str)
                        or not old
                        or not isinstance(new, str)
                        or staged.count(old) != 1
                    ):
                        error = "Edit requires one unique, nonempty exact old_string."
                    else:
                        candidate = staged.replace(old, new, 1)
                        if len(candidate.encode()) > 250000:
                            error = "Session note exceeds the bounded file size."
                        else:
                            staged, edited = candidate, True
                if error:
                    logger.info("session note edit rejected tool=%s reason=%s", call.name, error)
                results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": call.id,
                        "content": error or "Session note edited.",
                        "is_error": bool(error),
                    }
                )
            messages.append({"role": "user", "content": results})
