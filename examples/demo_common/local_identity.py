"""Anonymous local bearer credentials; the digest is the only stored secret."""

from __future__ import annotations

import asyncio
import hashlib
import os
import secrets
from typing import Annotated
from uuid import uuid4

from fastapi import Header, HTTPException

from .local_files import LocalFiles


class LocalIdentity:
    def __init__(self, files: LocalFiles):
        self.files = files

    def create(self) -> dict:
        token = secrets.token_urlsafe(48)
        user_id = str(uuid4())
        digest = hashlib.sha256(token.encode()).hexdigest()
        self.files.atomic_json(
            self.files.path("identities", f"{digest}.json"), {"user_id": user_id}
        )
        return {"access_token": token, "user": {"id": user_id}}

    async def current_user(self, authorization: Annotated[str | None, Header()] = None) -> str:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "访问凭证缺失，请重新打开页面。")
        token = authorization[7:].strip()
        if not token or len(token) > 256:
            raise HTTPException(401, "访问凭证无效。")
        digest = hashlib.sha256(token.encode()).hexdigest()
        document = await asyncio.to_thread(
            self.files.read_json, self.files.path("identities", f"{digest}.json")
        )
        if not isinstance(document, dict) or not document.get("user_id"):
            raise HTTPException(401, "访问凭证已失效。")
        return str(document["user_id"])

    @staticmethod
    def data_dir() -> str:
        return os.environ.get("SHOPPING_DATA_DIR", "").strip() or ".shopping-data"
