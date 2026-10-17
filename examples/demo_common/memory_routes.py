"""Authenticated topic-memory management, consolidation and snapshot endpoints."""

# FastAPI resolves the dependency aliases when these routes are installed.
from typing import Any, Literal

from fastapi import HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field


class FileWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    filename: str = Field(min_length=1, max_length=200)
    content: str = Field(max_length=250000)
    revision: str | None = None
    namespace: str = "auto"


class SnapshotAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    namespace: str
    action: Literal["check", "save", "initialize", "replace", "keep"] = "check"


class ReviewApproval(BaseModel):
    proposal_ids: list[str] = Field(max_length=100)


def install_memory_routes(host: Any) -> None:
    app = host.app
    User = host.CurrentUser
    Session = host.CurrentSession
    jobs = host.memory_jobs
    store = jobs.store

    async def invalid(_: Request, error: ValueError) -> JSONResponse:
        return JSONResponse({"detail": str(error)}, status_code=400)

    app.add_exception_handler(ValueError, invalid)

    @app.get("/api/memory/state")
    async def state(user: User, namespace: str = "auto") -> dict:
        settings = await store.settings(user)
        store.directory(user, namespace)
        return {
            "files": await store.catalog(user, namespace, limit=1000),
            "index": await store.read(user, "MEMORY.md", namespace),
            "settings": settings.model_dump(),
            "snapshot": await store.snapshot(user, namespace)
            if namespace.startswith("agent/")
            else None,
            **await jobs.status(user),
        }

    @app.get("/api/memory/file")
    async def read_file(
        user: User, filename: str, namespace: str = "auto", offset: int = Query(0, ge=0)
    ) -> dict:
        return await store.read(
            user, filename, namespace, offset=offset, lines=10000, byte_limit=250000
        )

    @app.put("/api/memory/file")
    async def write_file(body: FileWrite, user: User) -> dict:
        host.rate_limit(f"memory-write:{user}", 30)
        result = await store.write(
            user,
            body.filename,
            body.content,
            body.namespace,
            expected=body.revision,
            check_revision=True,
        )
        await jobs.notify(user, "edited", [result])
        return result

    @app.delete("/api/memory/file")
    async def delete_file(user: User, filename: str, namespace: str = "auto") -> dict:
        deleted = await store.remove(user, filename, namespace)
        await jobs.notify(user, "deleted", [{"filename": filename, "namespace": namespace}])
        return {"ok": deleted}

    @app.patch("/api/memory/settings")
    async def settings(body: dict[str, Any], user: User) -> dict:
        result = await store.settings(user, body)
        return result.model_dump()

    @app.post("/api/memory/dream")
    async def dream(record: Session) -> dict:
        host.rate_limit(f"dream:{record.user_id}", 4)
        task = await jobs.start_dream(record.user_id, record.session_id, manual=True)
        if task is None:
            raise HTTPException(409, "记忆已关闭，或整理任务正在运行。")
        return task

    @app.get("/api/memory/tasks")
    async def tasks(user: User, summary: bool = False) -> dict:
        return await jobs.status(user, summary=summary)

    @app.delete("/api/memory/tasks/{task_id}")
    async def cancel(task_id: str, user: User) -> dict:
        if not await jobs.cancel(user, task_id):
            raise HTTPException(404, "未找到整理任务。")
        return {"ok": True}

    @app.post("/api/memory/review")
    async def review(record: Session) -> dict:
        host.rate_limit(f"review:{record.user_id}", 4)
        return await jobs.review(record.user_id, record.session_id)

    @app.post("/api/memory/review/{review_id}/apply")
    async def apply_review(review_id: str, body: ReviewApproval, user: User) -> dict:
        return await jobs.apply_review(user, review_id, body.proposal_ids)

    @app.post("/api/memory/snapshot")
    async def snapshot(body: SnapshotAction, user: User) -> dict:
        return await store.snapshot(user, body.namespace, body.action)
