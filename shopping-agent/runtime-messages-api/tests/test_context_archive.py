"""The runtime's archival boundary and request budget across model rounds."""

import copy
from unittest.mock import AsyncMock

import pytest

from commerce_common.context import ContextBudgetExceeded, WorkingContext
from commerce_common.testing import (
    FakeClient,
    create_response,
    text_block,
    text_message,
    tool_use_message,
)
from commerce_common.turn import CLEARED_RESULT
from shopping_agent import ShoppingAgentConfig
from shopping_agent_runtime import ShoppingAgent


def old_exchange(index: int, length: int) -> list[dict]:
    return [
        {"role": "user", "content": f"条件 {index}，预算 800 美元"},
        {
            "role": "assistant",
            "content": [
                {"type": "tool_use", "name": "search_products", "id": f"old-{index}", "input": {}}
            ],
        },
        {
            "role": "user",
            "content": [
                {"type": "tool_result", "tool_use_id": f"old-{index}", "content": "x" * length}
            ],
        },
        {"role": "assistant", "content": [{"type": "text", "text": "已比较候选商品。"}]},
    ]


async def test_post_turn_compaction_does_not_rewrite_any_raw_archive(backend, session, state):
    client = FakeClient([text_message("继续比较。")])
    agent = ShoppingAgent(
        backend=backend, client=client, config=ShoppingAgentConfig(compact_history_above_tokens=1)
    )
    history = [message for index in range(6) for message in old_exchange(index, 1000)]
    archive_before = copy.deepcopy(history)
    messages = copy.deepcopy(history) + [{"role": "user", "content": "继续"}]
    raw_turn = [copy.deepcopy(messages[-1])]
    events = [
        event
        async for event in agent.stream_turn(
            messages, session, state, archive=raw_turn, working_context=WorkingContext()
        )
    ]
    assert CLEARED_RESULT in str(messages)
    assert history == archive_before and CLEARED_RESULT not in str(history)
    assert len(raw_turn) == 2 and raw_turn[-1]["role"] == "assistant"
    assert events[-1].type == "turn_complete"


async def test_cancelled_stream_archives_actual_tool_result_and_keeps_protocol_paired(
    backend, session, state
):
    client = FakeClient([tool_use_message("search_products", {"query": "tent"})])
    agent = ShoppingAgent(backend=backend, client=client)
    messages = [{"role": "user", "content": "找帐篷"}]
    raw = copy.deepcopy(messages)
    stream = agent.stream_turn(
        messages, session, state, archive=raw, working_context=WorkingContext()
    )
    async for event in stream:
        if event.type == "tool_result":
            break
    await stream.aclose()
    assert raw == messages
    assert raw[-1]["content"][0]["type"] == "tool_result"
    assert not raw[-1]["content"][0]["is_error"]
    assert "p-100" in raw[-1]["content"][0]["content"]
    assert raw[-2]["content"][0]["id"] == raw[-1]["content"][0]["tool_use_id"]


async def test_summary_without_a_host_checkpoint_cannot_silently_shorten_caller_history(
    backend, session
):
    client = FakeClient([text_message("继续。")])
    client.messages.create = AsyncMock(
        return_value=create_response(text_block("预算 800 美元，已比较多个商品。"))
    )
    agent = ShoppingAgent(
        backend=backend,
        client=client,
        config=ShoppingAgentConfig(compact_history_above_tokens=0, context_recent_turns=1),
    )
    messages = [message for index in range(6) for message in old_exchange(index, 30000)]
    messages.append({"role": "user", "content": "继续比较"})
    old = copy.deepcopy(messages)
    [event async for event in agent.stream_turn(messages, session)]
    assert messages[: len(old)] == old and len(messages) == len(old) + 1
    client.messages.create.assert_awaited_once()
    assert len(client.calls[0]["messages"]) < len(old)


async def test_context_budget_is_checked_before_the_chat_model_receives_oversized_input(
    backend, session
):
    client = FakeClient([])
    agent = ShoppingAgent(backend=backend, client=client)
    messages = [{"role": "user", "content": "大" * 100000}]
    with pytest.raises(ContextBudgetExceeded):
        [
            event
            async for event in agent.stream_turn(
                messages, session, working_context=WorkingContext()
            )
        ]
    assert client.calls == []
