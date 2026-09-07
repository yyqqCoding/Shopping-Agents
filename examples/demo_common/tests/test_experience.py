"""Durable host lifecycle: commit ordering, disconnects, retries and hidden memory."""

import asyncio
import copy
import json
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from assistant.api.mock_retail import MockRetail
from commerce_common.streaming import AgentEvent
from commerce_common.testing import FakeClient, extraction_client, text_message
from commerce_common.types import MemoryCategory, MemoryFact
from demo_common.experience import (
    DisplayArchive,
    ExperienceChatRequest,
    build_experience_host,
    replay_events,
)
from demo_common.supabase import QuotaExceeded, StorageUnavailable
from demo_common.tests.experience_fixtures import (
    USER_A,
    USER_B,
    ConversationDouble,
    identity_service,
)
from shopping_agent_runtime import ShoppingAgent


@pytest.fixture
async def rig():
    database = identity_service()
    store = ConversationDouble()
    backend = MockRetail()
    client = FakeClient([text_message("可以继续挑选。")])
    agent = ShoppingAgent(backend=backend, client=client, memory_store=store.memory)
    host = build_experience_host(backend=backend, agent=agent, database=database, store=store)
    conversation = await store.create(USER_A, str(uuid4()))
    yield SimpleNamespace(
        host=host, agent=agent, client=client, store=store, id=conversation["id"], backend=backend
    )
    host._stopping = True
    tasks = list(host._tasks)
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.wait_for(asyncio.gather(*tasks, return_exceptions=True), 2)
    await database.client.aclose()


def request(message="帮我挑选咖啡机", request_id=None):
    return ExperienceChatRequest(message=message, request_id=request_id or uuid4())


async def receive(response, events=None):
    events = events if events is not None else []
    async for chunk in response.body_iterator:
        if chunk.startswith(":"):
            continue
        lines = chunk.splitlines()
        events.append(
            (lines[0].removeprefix("event: "), json.loads(lines[1].removeprefix("data: ")))
        )
    return events


async def join(host):
    await asyncio.wait_for(asyncio.gather(*list(host._tasks)), 2)


async def test_user_input_is_saved_before_generation_and_completion_waits_for_checkpoint(rig):
    reached, release = asyncio.Event(), asyncio.Event()
    original_finish = rig.store._finish

    async def delayed_finish(*args):
        reached.set()
        await release.wait()
        await original_finish(*args)

    rig.store.finish.side_effect = delayed_finish

    async def stream(messages, session, state, *, archive, working_context):
        stored = next(iter(rig.store.turns.values()))
        assert stored["raw_messages"] == archive and stored["status"] == "running"
        yield AgentEvent.text_delta("已找到两款。")
        yield AgentEvent.ui("products", {"items": [{"title": "已校验的商品"}]})
        yield AgentEvent(type="turn_complete", data={"usage": {}})

    rig.agent.stream_turn = stream
    req = request()
    response = await rig.host.durable_chat(req, USER_A, rig.id)
    assert (
        response.headers["x-accel-buffering"] == "no"
        and response.headers["cache-control"] == "no-store"
    )
    events = []
    consumer = asyncio.create_task(receive(response, events))
    await asyncio.wait_for(reached.wait(), 1)
    assert not any(kind == "turn_complete" for kind, _ in events)
    assert rig.host._active_turns == 1
    with pytest.raises(HTTPException) as busy:
        await rig.host.durable_chat(req, USER_A, rig.id)
    assert busy.value.status_code == 409
    release.set()
    await asyncio.wait_for(consumer, 1)
    assert events[-1][0] == "turn_complete"
    [turn] = rig.store.turns.values()
    assert turn["status"] == "complete" and turn["display"][1]["block"]["payload"]["items"]
    assert rig.host._active_turns == 0


async def test_a_completed_request_replays_saved_display_without_reexecuting_the_agent(rig):
    req = request()
    first = await receive(await rig.host.durable_chat(req, USER_A, rig.id))
    archived = copy.deepcopy(rig.store.turns)
    replay = await receive(await rig.host.durable_chat(req, USER_A, rig.id))
    assert first == replay and len(rig.client.calls) == 1
    assert rig.store.turns == archived
    assert not {"tool_call", "cart_update"} & {kind for kind, _ in replay}


async def test_browser_disconnect_does_not_cancel_or_repeat_the_turn(rig):
    release = asyncio.Event()

    async def stream(messages, session, state, *, archive, working_context):
        yield AgentEvent.text_delta("正在处理。")
        await release.wait()
        reply = {"role": "assistant", "content": "已完成"}
        messages.append(reply)
        archive.append(copy.deepcopy(reply))
        yield AgentEvent.text_delta("已完成。")
        yield AgentEvent(type="turn_complete", data={})

    rig.agent.stream_turn = stream
    req = request()
    response = await rig.host.durable_chat(req, USER_A, rig.id)
    await anext(response.body_iterator)
    await response.body_iterator.aclose()
    assert rig.host._active_turns == 1
    release.set()
    await join(rig.host)
    [turn] = rig.store.turns.values()
    assert turn["status"] == "complete" and len(turn["raw_messages"]) == 2
    assert turn["display"][0]["text"] == "正在处理。已完成。"


@pytest.mark.parametrize(
    "failure", [StorageUnavailable("lost begin response"), asyncio.CancelledError()]
)
async def test_ambiguous_begin_is_reconciled_with_the_same_request_without_running_tools(
    rig, failure
):
    attempts = 0

    async def ambiguous(*args, **kwargs):
        nonlocal attempts
        attempts += 1
        result = await rig.store._begin(*args, **kwargs)
        if attempts == 1:
            raise failure
        return result

    rig.store.begin.side_effect = ambiguous
    with pytest.raises(type(failure)):
        await rig.host.durable_chat(request(), USER_A, rig.id)
    await join(rig.host)
    [turn] = rig.store.turns.values()
    assert attempts == 2 and turn["status"] == "interrupted"
    assert turn["raw_messages"][0]["role"] == "user"
    assert len(rig.client.calls) == 0 and rig.host._active_turns == 0
    assert rig.store.begin.call_args_list[0] == rig.store.begin.call_args_list[1]


async def test_checkpoint_outage_keeps_lock_and_retries_only_storage(rig, monkeypatch):
    actual_sleep = asyncio.sleep

    async def fast_sleep(_):
        await actual_sleep(0)

    monkeypatch.setattr("demo_common.experience.asyncio.sleep", fast_sleep)
    release, waiting = asyncio.Event(), asyncio.Event()
    attempts = 0

    async def unavailable_finish(*args):
        nonlocal attempts
        attempts += 1
        if attempts <= 3:
            raise StorageUnavailable()
        waiting.set()
        await release.wait()
        await rig.store._finish(*args)

    rig.store.finish.side_effect = unavailable_finish
    response = await rig.host.durable_chat(request(), USER_A, rig.id)
    events = await asyncio.wait_for(receive(response), 1)
    await asyncio.wait_for(waiting.wait(), 1)
    assert "turn_complete" not in {kind for kind, _ in events}
    assert (
        rig.host._active_turns == 1 and next(iter(rig.store.turns.values()))["status"] == "running"
    )
    with pytest.raises(HTTPException):
        await rig.host.durable_chat(request("继续"), USER_A, rig.id)
    release.set()
    await join(rig.host)
    assert len(rig.client.calls) == 1 and rig.host._active_turns == 0
    assert next(iter(rig.store.turns.values()))["status"] == "complete"


async def test_exception_after_model_completion_is_saved_as_error(rig):
    async def stream(*args, **kwargs):
        yield AgentEvent(type="turn_complete", data={})
        raise RuntimeError("late generator failure")

    rig.agent.stream_turn = stream
    events = await receive(await rig.host.durable_chat(request(), USER_A, rig.id))
    assert "turn_complete" not in {kind for kind, _ in events}
    assert next(iter(rig.store.turns.values()))["status"] == "error"


async def test_memory_tools_and_their_skill_result_never_reach_the_shopper(rig):
    async def stream(*args, **kwargs):
        for tool, value in (
            ("save_memory", {}),
            ("recall_memories", {}),
            ("forget_memory", {}),
            ("load_skill", {"skill_name": "memory-personalization"}),
        ):
            yield AgentEvent(type="tool_call", data={"tool": tool, "id": tool, "input": value})
            yield AgentEvent(
                type="tool_result", data={"tool": tool, "id": tool, "summary": "secret-memory"}
            )
        yield AgentEvent.text_delta("推荐这两件。")
        yield AgentEvent(type="turn_complete", data={})

    rig.agent.stream_turn = stream
    events = await receive(await rig.host.durable_chat(request(), USER_A, rig.id))
    assert [kind for kind, _ in events] == ["text_delta", "turn_complete"]
    assert next(iter(rig.store.turns.values()))["display"] == [
        {"type": "text", "text": "推荐这两件。"}
    ]


async def test_two_conversations_share_only_their_visitors_preferences(rig):
    await rig.store.memory.upsert_facts(
        USER_A, [MemoryFact(key="material", value="偏好棉质", category=MemoryCategory.PREFERENCE)]
    )
    first = rig.store.rows[rig.id]
    first.working_context.summary = "给朋友买礼物，预算 800"
    first.state.remember_products([rig.backend.product("AR-1001")])
    await rig.backend.add_to_cart(rig.host.context(first), "AR-1001", 1)
    other = (await rig.store.create(USER_A, str(uuid4())))["id"]
    third = (await rig.store.create(USER_B, str(uuid4())))["id"]
    second = await rig.store.load(USER_A, other)
    assert (
        second.messages == []
        and not second.working_context.summary
        and not second.state.seen_products
    )
    assert (await rig.backend.get_cart(rig.host.context(second))).items == []
    assert (await rig.agent.memory.tier_one(USER_A))[0].value == "偏好棉质"
    assert await rig.agent.memory.tier_one(USER_B) == []
    assert (await rig.store.load(USER_B, third)).messages == []
    await receive(await rig.host.durable_chat(request("这次想选羊毛"), USER_A, other))
    call = rig.client.calls[0]
    assert "偏好棉质" in str(call["system"]) and "这次想选羊毛" in str(call["messages"])
    assert "给朋友买礼物" not in str(call)


async def test_daily_quota_rejection_releases_host_slot_before_any_model_call(rig):
    rig.store.begin.side_effect = QuotaExceeded()
    with pytest.raises(QuotaExceeded):
        await rig.host.durable_chat(request(), USER_A, rig.id)
    assert rig.host._active_turns == 0 and not rig.store.turns and not rig.client.calls


def memory_job(**values):
    return {
        "id": str(uuid4()),
        "user_id": USER_A,
        "conversation_id": str(uuid4()),
        "raw_messages": [{"role": "user", "content": "我一直偏好棉质"}],
        "generation": 0,
        "source_order": 1,
        "memory_attempts": 1,
        "memory_claim_id": str(uuid4()),
    } | values


async def test_failed_memory_extraction_can_retry_without_affecting_another_user(rig):
    calls = 0

    async def fail_once(_):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise TimeoutError()

    rig.agent.client = extraction_client(
        [{"key": "material", "value": "偏好棉质"}], before_call=fail_once
    )
    job = memory_job()
    await rig.host._process_memory(job)
    assert rig.store.finish_memory.call_args.args[2] is False
    assert await rig.store.memory.get_facts(USER_A) == []
    await rig.host._process_memory(job | {"memory_attempts": 2})
    assert rig.store.finish_memory.call_args.args[2] is True
    assert (await rig.store.memory.get_facts(USER_A))[0].value == "偏好棉质"
    assert await rig.store.memory.get_facts(USER_B) == []


async def test_memory_wait_is_bounded_and_does_not_cancel_background_extraction(rig):
    release, started = asyncio.Event(), asyncio.Event()

    async def delayed(_):
        started.set()
        await release.wait()

    rig.agent.client = extraction_client(
        [{"key": "material", "value": "偏好棉质"}], before_call=delayed
    )
    rig.store.claim_memory.side_effect = [memory_job(), None]
    rig.host.memory_wait_s = 0.01
    await rig.host._wait_memory(USER_A)
    assert started.is_set() and USER_A in rig.host._memory_tasks
    assert not rig.host._memory_tasks[USER_A].done()
    release.set()
    await join(rig.host)
    assert (await rig.store.memory.get_facts(USER_A))[0].key == "material"


def test_display_archive_omits_partial_cards_and_preserves_final_card_order_on_retry():
    display = DisplayArchive()
    display.accept(AgentEvent.text_delta("先看这些。"))
    display.accept(
        AgentEvent(
            type="ui_partial",
            data={"component": "products", "stream_id": "first", "payload": {"unvalidated": True}},
        )
    )
    display.accept(AgentEvent.text_delta("再比较价格。"))
    display.accept(AgentEvent(type="tool_result", data={"id": "first", "is_error": True}))
    display.accept(
        AgentEvent(
            type="ui",
            data={"component": "products", "stream_id": "retry", "payload": {"items": ["checked"]}},
        )
    )
    display.accept(
        AgentEvent(
            type="ui_partial", data={"component": "plan", "stream_id": "abandoned", "payload": {}}
        )
    )
    assert [part["type"] for part in display.fragments] == ["text", "ui", "text"]
    assert display.fragments[1]["block"]["payload"] == {"items": ["checked"]}


def test_replay_retains_two_separate_cards_without_actions():
    turn = {
        "id": "one",
        "display": [
            {"type": "ui", "block": {"component": "products", "payload": {"id": i}}} for i in (1, 2)
        ],
        "status": "complete",
        "completion": {},
    }
    events = replay_events(turn)
    assert len({e.data["stream_id"] for e in events if e.type == "ui"}) == 2
    assert [e.type for e in events] == ["ui", "ui", "turn_complete"]
