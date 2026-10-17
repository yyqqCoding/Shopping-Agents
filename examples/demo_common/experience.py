"""Anonymous storefront host with durable turns and silent, retryable memory jobs."""

# Local dependency annotations are evaluated when routes are installed.
import asyncio
import copy
import logging
import math
import os
import time
from collections import defaultdict, deque
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager, suppress
from typing import Annotated, Any
from uuid import UUID
from weakref import WeakValueDictionary

from fastapi import Depends, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict

from commerce_common.context import ContextBudgetExceeded, token_upper_bound
from commerce_common.memory import (
    MEMORY_WRITE_VERSION,
    MemoryWriteRejected,
    MemoryWriteVersion,
    extract_and_store,
)
from commerce_common.session_memory import NoteSnapshot, should_extract, tool_count, update_note
from commerce_common.streaming import AgentEvent, to_sse
from commerce_common.turn import session_tag, transcript_text
from shopping_agent import PageContext, ProductDetails, ShoppingSessionContext
from shopping_agent_runtime import ShoppingAgent

from .host import DemoStorefront, append_user_turn
from .local_identity import LocalIdentity
from .local_persistence import LocalConversationStore
from .memory import MemoryFactEdit, MemoryFactRef
from .memory_jobs import MemoryJobs
from .memory_routes import install_memory_routes
from .storage_errors import QuotaExceeded, RecordNotFound, StorageConflict, StorageUnavailable
from .storefront import ChatRequest, StorefrontHost, StorefrontRecord, install_catalog_routes

logger = logging.getLogger(__name__)
_SILENT_TOOLS = frozenset(
    {
        "save_memory",
        "recall_memories",
        "forget_memory",
        "get_preferences",
        "memory_list",
        "memory_read",
        "memory_search",
        "memory_write",
        "memory_edit",
        "memory_delete",
        "search_past_conversations",
    }
)


class ConversationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID


class ExperienceChatRequest(ChatRequest):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    ignore_memory: bool = False


class DisplayArchive:
    """Final, server-validated display fragments. Partial cards are never archived."""

    def __init__(self) -> None:
        self._fragments: list[dict[str, Any] | None] = []
        self._slots: dict[str, int] = {}
        self._components: dict[str, str] = {}
        self._retryable: set[str] = set()
        self._after_tool = False

    @property
    def fragments(self) -> list[dict[str, Any]]:
        return [fragment for fragment in self._fragments if fragment is not None]

    def _slot(self, event: AgentEvent) -> int:
        component = str(event.data["component"])
        slot = str(event.data.get("stream_id") or component)
        if slot not in self._slots:
            retry = next(
                (
                    key
                    for key in reversed(self._slots)
                    if key in self._retryable and self._components[key] == component
                ),
                None,
            )
            if retry is not None:
                self._slots[slot] = self._slots[retry]
                self._retryable.discard(retry)
            else:
                self._slots[slot] = len(self._fragments)
                self._fragments.append(None)
            self._components[slot] = component
        return self._slots[slot]

    def accept(self, event: AgentEvent) -> None:
        if event.type == "tool_call":
            self._after_tool = True
        elif event.type == "tool_result" and event.data.get("is_error"):
            self._retryable.add(str(event.data.get("id", "")))
        elif event.type == "ui_partial" and event.data.get("component") != "suggestions":
            # Remember placement, never unvalidated payloads. Failed or abandoned
            # slots are omitted when the final archive is read.
            self._slot(event)
            self._after_tool = False
        elif event.type == "text_delta":
            text = str(event.data.get("text", ""))
            last = self._fragments[-1] if self._fragments else None
            if last is not None and last["type"] == "text":
                previous = last["text"]
                spaced = previous[-1:].isspace() or text[:1].isspace()
                gap = "\n\n" if self._after_tool and previous and not spaced else ""
                last["text"] += gap + text
            else:
                self._fragments.append({"type": "text", "text": text})
            self._after_tool = False
        elif event.type == "ui":
            component = str(event.data["component"])
            payload = copy.deepcopy(event.data["payload"])
            if component == "suggestions":
                fragment = {"type": "suggestions", "suggestions": payload.get("suggestions", [])}
            else:
                fragment = {"type": "ui", "block": {"component": component, "payload": payload}}
            self._fragments[self._slot(event)] = fragment
            self._retryable.discard(str(event.data.get("stream_id") or component))
            self._after_tool = False
        elif event.type == "error":
            self._fragments.append({"type": "error", "text": str(event.data["message"])})


def visible_event(event: AgentEvent) -> bool:
    if event.data.get("tool") in _SILENT_TOOLS:
        return False
    if event.type == "tool_call" and event.data.get("tool") == "load_skill":
        return event.data.get("input", {}).get("skill_name") != "memory-personalization"
    return True


def replay_events(turn: dict[str, Any]) -> list[AgentEvent]:
    events = []
    for index, fragment in enumerate(turn["display"]):
        if fragment["type"] == "text":
            events.append(AgentEvent.text_delta(fragment["text"]))
        elif fragment["type"] == "ui":
            events.append(
                AgentEvent(
                    type="ui",
                    data=fragment["block"] | {"stream_id": f"replay-{turn['id']}-{index}"},
                )
            )
        elif fragment["type"] == "suggestions":
            events.append(AgentEvent.ui("suggestions", {"suggestions": fragment["suggestions"]}))
        elif fragment["type"] == "error":
            events.append(AgentEvent.error(fragment["text"]))
    if turn["status"] == "complete":
        events.append(AgentEvent(type="turn_complete", data=turn["completion"]))
    elif not any(event.type == "error" for event in events):
        events.append(AgentEvent.error("上一轮回复中断，已完成的操作仍然保留。"))
    return events


class ExperienceHost(StorefrontHost):
    def __init__(
        self,
        *,
        backend: DemoStorefront,
        agent: ShoppingAgent,
        identity: LocalIdentity,
        store: LocalConversationStore,
    ) -> None:
        super().__init__(
            title="ACME 中文购物助手", backend=backend, agent=agent, env_hint="", cart_extras=None
        )
        self.identity = identity
        self.store = store
        self.memory_jobs = MemoryJobs(self) if agent.topic_memory else None
        self._locks: WeakValueDictionary[str, asyncio.Lock] = WeakValueDictionary()
        self._tasks: set[asyncio.Task[Any]] = set()
        self._memory_tasks: dict[str, asyncio.Task[Any]] = {}
        self._note_tasks: dict[str, asyncio.Task[Any]] = {}
        self._note_pending: dict[str, NoteSnapshot] = {}
        self._note_started: dict[str, float] = {}
        self._claim_lock = asyncio.Lock()
        self._active_turns = 0
        self._stopping = False
        self._rates: dict[str, deque[float]] = defaultdict(deque)
        self.max_concurrent = int(os.environ.get("SHOPPING_MAX_CONCURRENT_TURNS", "4"))
        self.turns_per_minute = int(os.environ.get("SHOPPING_TURNS_PER_MINUTE", "12"))
        self.user_daily_limit = int(os.environ.get("SHOPPING_USER_DAILY_TURNS", "100"))
        self.global_daily_limit = int(os.environ.get("SHOPPING_GLOBAL_DAILY_TURNS", "1000"))
        self.memory_wait_s = float(os.environ.get("SHOPPING_MEMORY_WAIT_S", "1.5"))
        self.memory_timeout_s = float(os.environ.get("SHOPPING_MEMORY_TIMEOUT_S", "25"))
        self.note_timeout_s = float(os.environ.get("SHOPPING_SESSION_NOTE_TIMEOUT_S", "120"))
        self.memory_retries = int(os.environ.get("SHOPPING_MEMORY_RETRIES", "4"))
        if (
            min(
                self.max_concurrent,
                self.turns_per_minute,
                self.user_daily_limit,
                self.global_daily_limit,
                self.memory_retries,
            )
            < 1
        ):
            raise ValueError("Turn limits and memory retries must be positive")
        if not (
            math.isfinite(self.memory_wait_s)
            and self.memory_wait_s >= 0
            and math.isfinite(self.memory_timeout_s)
            and self.memory_timeout_s > 0
            and math.isfinite(self.note_timeout_s)
            and self.note_timeout_s > 0
        ):
            raise ValueError("Memory wait must be nonnegative and timeout positive")
        self.CurrentUser = Annotated[str, Depends(identity.current_user)]
        CurrentUser = self.CurrentUser

        async def current_session(
            user_id: CurrentUser,
            session_id: Annotated[UUID | None, Header(alias="X-Session-Id")] = None,
        ) -> AsyncIterator[StorefrontRecord]:
            if session_id is None:
                raise HTTPException(401, "请先打开一段对话。")
            async with self.exclusive(str(session_id)):
                record = await self.store.load(user_id, str(session_id))
                if record.running_turn is not None:
                    raise HTTPException(409, "这段对话仍在处理中，请稍后重试。")
                yield record
                await self.store.save(record)

        self.CurrentSession = Annotated[
            StorefrontRecord, Depends(current_session, scope="function")
        ]
        self.app.router.lifespan_context = self.lifespan
        self._install_errors()

    def context(
        self, record: StorefrontRecord, page: PageContext | None = None
    ) -> ShoppingSessionContext:
        return ShoppingSessionContext(
            session_id=record.session_id,
            user_id=record.user_id,
            page=page or PageContext(),
            timezone="Asia/Shanghai",
        )

    def _task(self, coroutine: Any) -> asyncio.Task[Any]:
        task = asyncio.create_task(coroutine)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return task

    @asynccontextmanager
    async def lifespan(self, _: Any) -> AsyncIterator[None]:
        self._stopping = False
        self.identity.files.acquire()
        poller = None
        try:
            await self.store.recover()
            if self.memory_jobs:
                await self.memory_jobs.store.recover_memory()
                await self.memory_jobs.recover()
            poller = self._task(self._memory_loop())
            if self.memory_jobs:
                self._task(self._daily_memory_loop())
            yield
        finally:
            self._stopping = True
            if poller:
                poller.cancel()
            running = list(self._tasks)
            for task in running:
                task.cancel()
            if running:
                _, pending = await asyncio.wait(running, timeout=20)
                for task in pending:
                    task.cancel()
                if pending:
                    await asyncio.gather(*pending, return_exceptions=True)
            self.identity.files.release()

    def _install_errors(self) -> None:
        async def unavailable(_: Request, __: Exception) -> JSONResponse:
            return JSONResponse(
                {"detail": "服务暂时不可用，原有身份和记录已保留，请稍后重试。"}, status_code=503
            )

        async def conflict(_: Request, __: Exception) -> JSONResponse:
            return JSONResponse(
                {"detail": "这段对话正在处理其他操作，请刷新后重试。"}, status_code=409
            )

        async def missing(_: Request, __: Exception) -> JSONResponse:
            return JSONResponse({"detail": "未找到这段记录。"}, status_code=404)

        async def quota(_: Request, __: Exception) -> JSONResponse:
            return JSONResponse(
                {"detail": "今日体验额度已用完，请明天再来。历史记录仍可查看。"}, status_code=429
            )

        self.app.add_exception_handler(StorageUnavailable, unavailable)
        self.app.add_exception_handler(StorageConflict, conflict)
        self.app.add_exception_handler(RecordNotFound, missing)
        self.app.add_exception_handler(QuotaExceeded, quota)

    def lock(self, session_id: str) -> asyncio.Lock:
        lock = self._locks.get(session_id)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[session_id] = lock
        return lock

    @asynccontextmanager
    async def exclusive(self, session_id: str) -> AsyncIterator[None]:
        lock = self.lock(session_id)
        if lock.locked():
            raise HTTPException(409, "这段对话正在回复，请稍后重试。")
        async with lock:
            yield

    def rate_limit(self, key: str, limit: int) -> None:
        now = time.monotonic()
        if len(self._rates) > 5000:
            self._rates = defaultdict(
                deque, {k: v for k, v in self._rates.items() if v and now - v[-1] < 60}
            )
        recent = self._rates[key]
        while recent and now - recent[0] >= 60:
            recent.popleft()
        if len(recent) >= limit:
            raise HTTPException(429, "操作较频繁，请稍后继续。", headers={"Retry-After": "60"})
        recent.append(now)

    async def _process_memory(self, job: dict[str, Any]) -> None:
        success = False
        try:
            if self.memory_jobs:
                await self.memory_jobs.extract(job)
                success = True
                return
            memory = self.agent.memory
            if memory.enabled and memory.store is not None:
                async with asyncio.timeout(self.memory_timeout_s):
                    await extract_and_store(
                        memory.store,
                        job["user_id"],
                        self.agent.client,
                        memory.model,
                        transcript_text(job["raw_messages"]),
                        extraction_prompt=memory.extraction_prompt,
                        fence=memory.fence,
                        write_filter=memory.write_filter,
                        source_session_id=job["conversation_id"],
                        generation=job["generation"],
                        source_order=job["source_order"],
                    )
            success = True
        except Exception as error:
            logger.warning(
                "memory job %s failed (%s)", session_tag(job["id"]), type(error).__name__
            )
        finally:
            try:
                await self.store.finish_memory(
                    job["id"],
                    job["memory_claim_id"],
                    success,
                    min(300, 5 * 2 ** min(job["memory_attempts"] - 1, 6)),
                )
            except Exception:
                logger.warning("memory job completion could not be saved")
            self._memory_tasks.pop(job["user_id"], None)

    async def _drain_memory(self, user_id: str | None) -> bool:
        async with self._claim_lock:
            task = self._memory_tasks.get(user_id) if user_id else None
            if task is None:
                job = await self.store.claim_memory(
                    user_id, self.memory_retries, self.memory_timeout_s + 60
                )
                if job is None:
                    return False
                task = self._task(self._process_memory(job))
                self._memory_tasks[job["user_id"]] = task
        await asyncio.shield(task)
        return True

    async def _memory_loop(self) -> None:
        while True:
            try:
                if self.memory_jobs:
                    if len(self._memory_tasks) < self.max_concurrent:
                        async with self._claim_lock:
                            job = await self.store.claim_memory(
                                None,
                                self.memory_retries,
                                self.agent.config.request_timeout_s * 5 + 60,
                                coalesce=True,
                            )
                            if job:
                                self._memory_tasks[job["user_id"]] = self._task(
                                    self._process_memory(job)
                                )
                                continue
                    await asyncio.sleep(2)
                    continue
                if await self._drain_memory(None):
                    continue
            except Exception:
                logger.warning("memory job store unavailable")
            await asyncio.sleep(2)

    async def _daily_memory_loop(self) -> None:
        # The reference daily-log prompt has no scheduler implementation. The host
        # supplies a day-boundary check using the same consolidation flow.
        while not self._stopping:
            try:
                for root in self.identity.files.path("users").glob("*/memory/settings.json"):
                    user = root.parent.parent.name
                    settings = await self.memory_jobs.store.settings(user)
                    if not settings.enabled or not settings.daily_mode:
                        continue
                    conversations = await self.store.list(user, 0, 1)
                    if conversations:
                        await self.memory_jobs.start_dream(user, conversations[0]["id"], daily=True)
            except asyncio.CancelledError:
                raise
            except Exception as error:
                logger.warning("daily memory check failed (%s)", type(error).__name__)
            await asyncio.sleep(30)

    async def _wait_memory(self, user_id: str) -> None:
        try:
            async with asyncio.timeout(self.memory_wait_s):
                while await self._drain_memory(user_id):
                    pass
        except (TimeoutError, StorageUnavailable):
            pass

    def _note_eligible(self, snapshot: NoteSnapshot, note: dict[str, Any] | None) -> bool:
        config = self.agent.config
        return should_extract(
            snapshot.tokens,
            initialized=bool(note) or snapshot.initialized,
            last_tokens=note.get("context_tokens", 0) if note else 0,
            tools_since=snapshot.tool_cursor - (note.get("tool_cursor", 0) if note else 0),
            has_tools=snapshot.has_tools,
            init_tokens=config.session_note_init_tokens,
            growth_tokens=config.session_note_growth_tokens,
            tool_threshold=config.session_note_tool_calls,
        )

    def _queue_session_note(self, user_id: str, session_id: str, snapshot: NoteSnapshot) -> None:
        if self._stopping:
            return
        if session_id in self._note_tasks:
            self._note_pending[session_id] = snapshot
        else:
            self._note_started[session_id] = time.monotonic()
            self._note_tasks[session_id] = self._task(
                self._update_session_note(user_id, session_id, snapshot)
            )

    async def _update_session_note(
        self, user_id: str, session_id: str, snapshot: NoteSnapshot
    ) -> None:
        try:
            source = await self.store.session_note_source_async(
                user_id, session_id, snapshot.boundary_id
            )
            note = source["note"]
            if not source["messages"] or not self._note_eligible(snapshot, note):
                return
            content = await update_note(
                self.agent.client,
                snapshot,
                note["content"] if note else "",
                timeout=self.note_timeout_s,
                input_budget=self.agent.config.context_window_tokens - self.agent.config.max_tokens,
                session_id=session_id,
            )
            committed = await self.store.commit_session_note(
                user_id,
                session_id,
                source_revision=note["revision"] if note else 0,
                covered_through_message_id=snapshot.boundary_id,
                covered_turns=source["covered_turns"],
                content=content,
                context_tokens=snapshot.tokens,
                tool_cursor=snapshot.tool_cursor,
            )
            logger.info(
                "session note commit session=%s committed=%s context_tokens=%d tool_cursor=%d",
                session_tag(session_id),
                committed,
                snapshot.tokens,
                snapshot.tool_cursor,
            )
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.warning(
                "session note update failed session=%s error=%s",
                session_tag(session_id),
                type(error).__name__,
            )
        finally:
            self._note_tasks.pop(session_id, None)
            self._note_started.pop(session_id, None)
            pending = self._note_pending.pop(session_id, None)
            if pending:
                self._queue_session_note(user_id, session_id, pending)

    async def _begin(
        self,
        request: ExperienceChatRequest,
        record: StorefrontRecord,
        raw_user: dict[str, Any],
    ) -> dict[str, Any]:
        return await self.store.begin(
            record,
            str(request.request_id),
            request.message,
            (request.page.model_dump(mode="json") if request.page else {})
            | {"ignore_memory": request.ignore_memory},
            raw_user,
            user_daily_limit=self.user_daily_limit,
            global_daily_limit=self.global_daily_limit,
        )

    async def _recover_unstarted(
        self,
        request: ExperienceChatRequest,
        record: StorefrontRecord,
        raw: list[dict[str, Any]],
        lock: asyncio.Lock,
    ) -> None:
        """Resolve an ambiguous begin, without ever starting a model or tool call."""
        try:
            while not self._stopping:
                try:
                    # The same id serializes on the conversation row, so even a slow
                    # first transaction must settle before this recovery can proceed.
                    turn = await self._begin(request, record, raw[0])
                    if turn["status"] != "running":
                        return
                    record.version = turn["version"]
                    await self.store.finish(
                        record,
                        turn["id"],
                        raw,
                        [{"type": "error", "text": "消息已保留，但本轮回复未能启动，请重新提问。"}],
                        {},
                        "interrupted",
                    )
                    return
                except StorageUnavailable:
                    await asyncio.sleep(5)
        except Exception as error:
            logger.warning("unstarted turn recovery failed (%s)", type(error).__name__)
        finally:
            lock.release()
            self._active_turns -= 1

    async def durable_chat(
        self,
        request: ExperienceChatRequest,
        user_id: str,
        session_id: str,
    ) -> StreamingResponse:
        if token_upper_bound(request.page.model_dump() if request.page else {}) > 8000:
            raise HTTPException(413, "页面信息过长。")
        self.rate_limit(f"chat:{user_id}", self.turns_per_minute)
        lock = self.lock(session_id)
        if lock.locked():
            raise HTTPException(409, "这段对话正在回复，请稍后重试。")
        if self._active_turns >= self.max_concurrent:
            raise HTTPException(429, "当前使用人数较多，请稍后重试。", headers={"Retry-After": "5"})
        await lock.acquire()
        self._active_turns += 1
        recovering = False
        try:
            record = await self.store.load(user_id, session_id)
            if record.running_turn is not None:
                raise HTTPException(409, "上一轮仍在处理中，请稍后刷新历史。")
            append_user_turn(record, request.message, "App events")
            raw = [copy.deepcopy(record.messages[-1])]
            try:
                turn = await self._begin(request, record, raw[0])
            except (StorageUnavailable, asyncio.CancelledError):
                recovering = True
                self._task(self._recover_unstarted(request, record, raw, lock))
                raise
            if turn["replay"] and turn["status"] != "running":

                async def replay() -> AsyncIterator[str]:
                    for event in replay_events(turn):
                        yield to_sse(event)

                lock.release()
                self._active_turns -= 1
                return self._response(replay())
            record.version = turn["version"]
        except BaseException:
            if not recovering:
                lock.release()
                self._active_turns -= 1
            raise

        queue: asyncio.Queue[AgentEvent | None] = asyncio.Queue()
        connected = True

        def emit(event: AgentEvent | None) -> None:
            if connected:
                queue.put_nowait(event)

        self._task(self._run_turn(request, record, turn, raw, lock, emit))

        async def stream() -> AsyncIterator[str]:
            nonlocal connected
            try:
                # Flush response headers through fetch/proxies before the first model
                # event or the 15s heartbeat. Comments never enter the transcript.
                yield ": connected\n\n"
                while True:
                    try:
                        event = await asyncio.wait_for(queue.get(), timeout=15)
                    except TimeoutError:
                        yield ": keep-alive\n\n"
                        continue
                    if event is None:
                        return
                    yield to_sse(event)
            finally:
                connected = False
                # Generation owns its task and lock; disconnecting cannot replay writes.
                while not queue.empty():
                    queue.get_nowait()

        return self._response(stream())

    @staticmethod
    def _response(events: AsyncIterator[str]) -> StreamingResponse:
        return StreamingResponse(
            events,
            media_type="text/event-stream",
            headers={"Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no"},
        )

    async def _run_turn(
        self,
        request: ExperienceChatRequest,
        record: StorefrontRecord,
        turn: dict[str, Any],
        raw: list[dict[str, Any]],
        lock: asyncio.Lock,
        emit: Callable[[AgentEvent | None], None],
    ) -> None:
        display = DisplayArchive()
        completion: dict[str, Any] = {}
        status = "error"
        version_token = MEMORY_WRITE_VERSION.set(
            MemoryWriteVersion(record.user_id, turn["generation"], turn["source_order"])
        )
        silent_calls: set[str] = set()
        saved_raw = 1

        async def persist_raw() -> None:
            nonlocal saved_raw
            while saved_raw < len(raw):
                await self.store.append_turn_raw(
                    record.user_id,
                    record.session_id,
                    record.version + 1,
                    saved_raw - 1,
                    raw[saved_raw],
                )
                saved_raw += 1

        try:
            if not self.memory_jobs:
                await self._wait_memory(record.user_id)
            context = record.working_context
            while len(context.message_ids) < len(record.messages) - 1:
                context.message_ids.append(None)
            context.message_ids = context.message_ids[: len(record.messages) - 1]
            context.message_ids.append(f"{record.version}:0")
            context.tool_cursor = max(context.tool_cursor, tool_count(record.messages))

            async def sampled(prefix: dict[str, Any], tokens: int, has_tools: bool) -> None:
                await persist_raw()
                boundary = context.message_ids[-1] if context.message_ids else None
                if not boundary:
                    return
                if tokens >= self.agent.config.session_note_init_tokens:
                    context.note_initialized = True
                note = await asyncio.to_thread(
                    self.store.read_session_note, record.user_id, record.session_id
                )
                context.load_note(note)
                snapshot = NoteSnapshot(
                    boundary,
                    copy.deepcopy(prefix),
                    tokens,
                    context.tool_cursor,
                    has_tools,
                    context.note_initialized,
                )
                if self._note_eligible(snapshot, note):
                    self._queue_session_note(record.user_id, record.session_id, snapshot)

            async def refresh_note(wait: bool) -> None:
                task = self._note_tasks.get(record.session_id)
                if (
                    wait
                    and task
                    and time.monotonic() - self._note_started.get(record.session_id, 0) < 60
                ):
                    with suppress(TimeoutError):
                        await asyncio.wait_for(asyncio.shield(task), timeout=15)
                note = await asyncio.to_thread(
                    self.store.read_session_note, record.user_id, record.session_id
                )
                context.load_note(note)

            async for event in self.agent.stream_turn(
                record.messages,
                self.context(record, request.page),
                record.state,
                archive=raw,
                working_context=record.working_context,
                save_large_result=lambda tool_id, content: self.store.save_tool_result(
                    record.user_id, record.session_id, tool_id, content
                ),
                memory_ignored=request.ignore_memory,
                allocate_message_id=lambda: f"{record.version + 1}:{len(raw) - 1}",
                on_round_complete=sampled,
                refresh_session_note=refresh_note,
            ):
                if event.type == "turn_complete":
                    completion = event.data | {
                        "request_id": str(request.request_id),
                        "sequence": turn["sequence"],
                    }
                    status = "complete"
                elif visible_event(event) and str(event.data.get("id", "")) not in silent_calls:
                    display.accept(event)
                    emit(event)
                elif event.type == "tool_call" and event.data.get("id"):
                    silent_calls.add(str(event.data["id"]))
                await persist_raw()
            if status != "complete":
                raise RuntimeError("Agent stream ended without completion")
        except asyncio.CancelledError:
            status = "interrupted"
            event = AgentEvent.error("回复中断，请稍后打开历史继续。")
            display.accept(event)
            emit(event)
        except Exception as error:
            status = "error"
            logger.warning("turn %s failed (%s)", session_tag(turn["id"]), type(error).__name__)
            message = (
                str(error)
                if isinstance(error, ContextBudgetExceeded)
                else "回复暂时失败，请稍后继续。已完成的操作仍然保留。"
            )
            event = AgentEvent.error(message)
            display.accept(event)
            emit(event)
        finally:
            with suppress(Exception):
                await persist_raw()
            try:
                attempt = 0
                while True:
                    try:
                        await self.store.finish(
                            record,
                            turn["id"],
                            raw,
                            display.fragments,
                            completion,
                            status,
                            memory_prefix=self.agent.topic_memory.prefixes.get(record.session_id)
                            if self.memory_jobs
                            else None,
                        )
                        if status == "complete":
                            if self.memory_jobs:
                                changes = self.agent.topic_memory.direct_writes.pop(
                                    record.session_id, []
                                )
                                if changes:
                                    await self.memory_jobs.notify(record.user_id, "saved", changes)
                            emit(AgentEvent(type="turn_complete", data=completion))
                        break
                    except StorageUnavailable:
                        if self._stopping:
                            raise
                        attempt += 1
                        if attempt == 3:
                            logger.warning(
                                "turn %s awaiting checkpoint storage", session_tag(turn["id"])
                            )
                            emit(
                                AgentEvent.error(
                                    "本轮记录正在等待保存，请稍后刷新历史，避免重复操作。"
                                )
                            )
                            emit(None)
                        # Retain the checkpoint and conversation lock while storage
                        # recovers. Retrying this commit never invokes tools or a model.
                        await asyncio.sleep(min(30, 0.5 * 2 ** min(attempt, 6)))
            except Exception:
                logger.warning("turn %s checkpoint could not be committed", session_tag(turn["id"]))
                emit(AgentEvent.error("本轮记录尚未确认保存，请稍后刷新历史，避免重复操作。"))
            finally:
                emit(None)
                lock.release()
                self._active_turns -= 1
                MEMORY_WRITE_VERSION.reset(version_token)


def build_experience_host(
    *,
    backend: DemoStorefront,
    agent: ShoppingAgent,
    identity: LocalIdentity,
    product_detail: Callable[[ProductDetails], dict[str, Any]] | None = None,
    store: LocalConversationStore,
) -> ExperienceHost:
    host = ExperienceHost(backend=backend, agent=agent, identity=identity, store=store)
    app = host.app
    CurrentUser = host.CurrentUser
    CurrentSession = host.CurrentSession
    install_catalog_routes(app, backend, product_detail=product_detail)
    if host.memory_jobs:
        install_memory_routes(host)

    @app.get("/api/config")
    async def configuration() -> dict:
        return {"storage_configured": True}

    @app.post("/api/identity")
    async def create_identity(request: Request) -> dict:
        host.rate_limit(f"identity:{request.client.host if request.client else 'unknown'}", 120)
        return await asyncio.to_thread(identity.create)

    @app.post("/api/conversations")
    @app.post("/api/session", include_in_schema=False)
    async def create_conversation(body: ConversationRequest, user_id: CurrentUser) -> dict:
        host.rate_limit(f"create:{user_id}", 12)
        conversation = await host.store.create(user_id, str(body.request_id))
        return {"conversation": conversation, "session_id": conversation["id"]}

    @app.get("/api/conversations")
    async def list_conversations(
        user_id: CurrentUser,
        offset: int = Query(0, ge=0),
        limit: int = Query(30, ge=1, le=100),
    ) -> dict:
        rows = await host.store.list(user_id, offset, limit + 1)
        return {"conversations": rows[:limit], "has_more": len(rows) > limit}

    @app.get("/api/conversations/{conversation_id}/turns")
    async def history(
        conversation_id: UUID,
        user_id: CurrentUser,
        before: int | None = Query(None, ge=1),
        limit: int = Query(30, ge=1, le=99),
    ) -> dict:
        turns = await host.store.history(user_id, str(conversation_id), before, limit + 1)
        return {"turns": turns[-limit:], "has_more": len(turns) > limit}

    @app.post("/api/chat")
    async def chat(
        body: ExperienceChatRequest,
        user_id: CurrentUser,
        session_id: Annotated[UUID, Header(alias="X-Session-Id")],
    ) -> StreamingResponse:
        return await host.durable_chat(body, user_id, str(session_id))

    @app.get("/api/conversations/{conversation_id}/turns/{request_id}")
    async def get_turn(conversation_id: UUID, request_id: UUID, user_id: CurrentUser) -> dict:
        return await host.store.get_turn(user_id, str(conversation_id), str(request_id))

    @app.get("/api/cart")
    async def cart(record: CurrentSession) -> dict:
        return await host.cart_payload(record)

    @app.get("/api/orders")
    async def orders(record: CurrentSession) -> dict:
        return {
            "orders": [
                order.model_dump(mode="json")
                for order in await backend.get_orders(host.context(record))
            ]
        }

    @app.get("/api/memory")
    async def memory(record: CurrentSession) -> dict:
        return {
            "facts": [
                fact.model_dump(mode="json")
                for fact in await host.memory_store.get_facts(record.user_id)
            ]
        }

    @app.patch("/api/memory")
    async def edit_memory(body: MemoryFactEdit, record: CurrentSession) -> dict:
        facts = {fact.key: fact for fact in await host.memory_store.get_facts(record.user_id)}
        if body.key not in facts:
            raise HTTPException(404, "未找到这条记录。")
        try:
            fact = agent.memory.validate(
                body.key,
                body.value,
                facts[body.key].category.value,
                source_session_id=session_tag(record.session_id),
            )
        except (MemoryWriteRejected, ValueError):
            raise HTTPException(400, "这条内容不适合保存。") from None
        await host.memory_store.upsert_facts(record.user_id, [fact])
        return {"fact": fact.model_dump(mode="json")}

    @app.delete("/api/memory")
    async def delete_memory(body: MemoryFactRef, record: CurrentSession) -> dict:
        return {"ok": await host.memory_store.delete_fact(record.user_id, body.key)}

    @app.delete("/api/memory/all")
    async def clear_memory(record: CurrentSession) -> dict:
        await host.memory_store.clear(record.user_id)
        return {"ok": True}

    @app.get("/api/health")
    async def health() -> dict:
        # Configuration only: the catalog service is not called here (deploy/check_database.py
        # checks it before a deployment switches over).
        return {
            "ok": True,
            "storage_configured": True,
            "store": backend.store_name,
            "catalog_backend": backend.catalog_backend,
            "skills": agent.skills.names,
        }

    return host
