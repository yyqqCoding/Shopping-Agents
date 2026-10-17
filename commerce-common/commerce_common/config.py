# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

"""The config fields every agent config carries, in the section order the role config
continues: identity, models, budgets, capabilities, memory, caps. Fields marked (prompt)
render into the static prompt or the tool list, so they are constant within a deployment;
the rest steer the runtime only and never change prompt bytes.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .fencing import MAX_FENCED_CHARS

DEFAULT_MEMORY_MODEL = "claude-haiku-4-5-20251001"

ThinkingEffort = Literal["low", "medium", "high", "xhigh", "max"]


class BaseAgentConfig(BaseModel):
    # A misspelled or retired field name fails at construction instead of being ignored.
    model_config = ConfigDict(extra="forbid")

    # -- Identity (prompt) --------------------------------------------------------------
    brand_name: str = "the store"
    assistant_name: str = "the assistant"
    brand_voice: str = "plain and specific"

    # -- Models: the turn loop runs on `model`, which each role's config names, and
    # post-turn extraction on `memory_model`. The turn loop sends adaptive thinking at
    # `thinking_effort`, or thinking disabled when it is None; either way `max_tokens`
    # bounds the thinking and the reply together.
    model: str
    memory_model: str = DEFAULT_MEMORY_MODEL
    thinking_effort: ThinkingEffort | None = None

    # -- Budgets. The iteration cap is a runaway guard: a multi-part request has to finish
    # well inside it, because once the cap forces a tool-less round the model tends to
    # describe steps it never performed.
    max_tokens: int = 2048
    max_tool_iterations: int = 8
    request_timeout_s: float = 120.0

    # -- Latency. Eager dispatch starts a tool call when its content block closes, while
    # the model is still writing the round; the rolling cache turns the prior rounds'
    # messages and tool results into cache reads; eager partial frames emit a
    # ``ui_partial`` frame on every visible payload change instead of structural ones
    # only; close on presentation ends the turn after a round of clean presentation
    # calls that includes present_suggestions, instead of asking the model for a closing
    # line (the Agent SDK runtime ends it with a hook; the hosted path keeps its own
    # loop). Each turns off on its own, so a latency problem can be bisected.
    eager_tool_dispatch: bool = True
    rolling_conversation_cache: bool = True
    eager_partial_frames: bool = False
    close_on_presentation: bool = True

    # -- Capabilities. Web search adds a tool (prompt); the memory tools stay registered
    # either way and `enable_memory` switches their behavior on every path.
    enable_web_search: bool = False
    enable_memory: bool = True

    # -- Memory: facts injected per request (every constraint, then the most recent),
    # extra write-filter regexes on top of the identifier defaults (flags inline), and
    # the age past which a fact is neither injected nor recalled (None keeps facts).
    memory_tier_one_cap: int = Field(default=8, ge=0)
    memory_blocked_patterns: tuple[str, ...] = ()
    memory_retention_days: int | None = Field(default=None, ge=1)
    memory_selector_model: str | None = None
    memory_dream_max_turns: int = Field(default=30, ge=5, le=100)

    # -- Caps: the backend's per-request context payload (replaced by a note when over),
    # search results per call (the model's limit is clamped to it), characters per fenced
    # tool result, and the prompt size at which a turn ends by clearing the oldest tool
    # results from the stored conversation (0 never clears). The default is the platform's
    # own tool-result-clearing default, a tenth of the models' window: cost and latency
    # grow with every round long before the window is the limit.
    max_context_chars: int = Field(default=2000, ge=0)
    max_search_results: int = Field(default=8, ge=1, le=25)
    # The deployment can keep a smaller first page while retaining the hard maximum
    # above for an explicit "show more" request.
    search_page_size: int = Field(default=8, ge=1, le=25)
    # A result cap alone still allows a model to issue many near-duplicate searches.
    # These per-turn budgets keep broad browsing finite while allowing a coordinated
    # plan to search several distinct equipment categories.
    max_search_calls_per_turn: int = Field(default=4, ge=1, le=16)
    max_search_results_per_turn: int = Field(default=24, ge=1, le=100)
    max_fenced_chars: int = MAX_FENCED_CHARS
    compact_history_above_tokens: int = Field(default=100_000, ge=0)
    context_window_tokens: int = Field(default=131072, ge=8192)
    context_reserve_tokens: int = Field(default=4096, ge=1024)
    context_recent_turns: int = Field(default=4, ge=1, le=20)
    context_summary_timeout_s: float = Field(default=120.0, gt=0)
    model_max_output_tokens: int = Field(default=20000, ge=1)
    usage_input_includes_cache: bool = False
    session_note_init_tokens: int = Field(default=10000, ge=1)
    session_note_growth_tokens: int = Field(default=5000, ge=1)
    session_note_tool_calls: int = Field(default=3, ge=1)
    session_note_keep_min_tokens: int = Field(default=10000, ge=1)
    session_note_keep_min_text_messages: int = Field(default=5, ge=1)
    session_note_keep_max_tokens: int = Field(default=40000, ge=1)
    time_based_microcompact: bool = False
    microcompact_gap_minutes: float = Field(default=60, gt=0)
    microcompact_keep_recent: int = Field(default=5, ge=1)

    @model_validator(mode="after")
    def validate_context_policy(self) -> BaseAgentConfig:
        if self.session_note_keep_min_tokens > self.session_note_keep_max_tokens:
            raise ValueError("Session-note retention minimum exceeds its maximum")
        if self.max_tokens > self.context_window_tokens:
            raise ValueError("Reply output exceeds the configured context window")
        if self.max_tokens > self.model_max_output_tokens:
            raise ValueError("Reply output exceeds the configured model output capacity")
        self.context_input_budget()
        return self

    def context_input_budget(self) -> int:
        """Reserve output plus a 13k safety margin, scaled for small windows."""
        reserve = max(self.context_reserve_tokens, min(13_000, self.context_window_tokens // 4))
        output_reserve = min(self.model_max_output_tokens, 20_000)
        if self.context_window_tokens < 32768:
            output_reserve = min(output_reserve, self.context_window_tokens // 4)
        output_reserve = max(output_reserve, self.max_tokens)
        budget = self.context_window_tokens - output_reserve - reserve
        if budget <= 0:
            raise ValueError("Context window is smaller than output and safety reserves")
        return budget

    def absent_tools(self) -> frozenset[str]:
        """Names the role's `build_tools` leaves out for systems the deployment switches
        off; the executor refuses them too. A role config lists its own."""
        return frozenset()

    def thinking_request_fields(self) -> dict[str, Any]:
        """The request fields that carry `thinking_effort`, for every model call the
        agent makes on `model`."""
        if self.thinking_effort is None:
            return {"thinking": {"type": "disabled"}}
        return {
            "thinking": {"type": "adaptive"},
            "output_config": {"effort": self.thinking_effort},
        }
