"""Supabase's deployment boundary: verified anonymous identities and async database RPCs."""

from __future__ import annotations

import asyncio
import base64
import json
import os
from dataclasses import dataclass
from typing import Annotated, Any
from uuid import UUID

import httpx
from fastapi import Header, HTTPException


@dataclass(frozen=True)
class SupabaseSettings:
    url: str
    public_key: str
    service_key: str

    @classmethod
    def from_env(cls) -> SupabaseSettings:
        return cls(
            os.environ.get("SUPABASE_URL", "").rstrip("/"),
            os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
            or os.environ.get("SUPABASE_ANON_KEY", ""),
            os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""),
        )

    @property
    def configured(self) -> bool:
        if not (self.url and self.public_key and self.service_key):
            return False
        if self.public_key == self.service_key or self.public_key.startswith("sb_secret_"):
            return False
        # This is a credential-exposure guard on trusted deployment configuration,
        # never identity verification. Anonymous access tokens are verified by Auth.
        parts = self.public_key.split(".")
        if len(parts) == 3:
            try:
                payload = json.loads(
                    base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4))
                )
                if isinstance(payload, dict) and payload.get("role") == "service_role":
                    return False
            except (ValueError, TypeError):
                return False
        return True


class StorageUnavailable(RuntimeError):
    """A remote failure; callers must not substitute another user's local state."""


class StorageConflict(RuntimeError):
    """A stale version, active turn, or reused request id with different input."""


class RecordNotFound(LookupError):
    """The record does not exist or belongs to another visitor."""


class QuotaExceeded(RuntimeError):
    """The persisted daily model-call allowance is exhausted."""


class Supabase:
    def __init__(self, settings: SupabaseSettings, client: httpx.AsyncClient | None = None):
        self.settings = settings
        self.client = client or httpx.AsyncClient(timeout=15.0)

    def require_configuration(self) -> None:
        if not self.settings.configured:
            raise StorageUnavailable("Supabase is not configured")

    async def rpc(self, name: str, **parameters: Any) -> Any:
        self.require_configuration()
        try:
            response = await self.client.post(
                f"{self.settings.url}/rest/v1/rpc/{name}",
                headers={
                    "apikey": self.settings.service_key,
                    "Authorization": f"Bearer {self.settings.service_key}",
                },
                json=parameters,
            )
        except httpx.HTTPError as error:
            raise StorageUnavailable("Database request failed") from error
        if not response.is_success:
            # Postgres exceptions carry only codes across the public boundary. Do not
            # expose response bodies, row contents, or credential-bearing requests.
            try:
                payload = response.json()
                code = payload.get("code") if isinstance(payload, dict) else None
            except ValueError:
                code = None
            if code == "P0002":
                raise RecordNotFound(name)
            if code in {"40001", "23505", "55000"}:
                raise StorageConflict(name)
            if code == "PT429":
                raise QuotaExceeded(name)
            raise StorageUnavailable(f"Database operation failed ({response.status_code})")
        try:
            return response.json()
        except ValueError as error:
            raise StorageUnavailable("Invalid database response") from error

    async def rpc_idempotent(self, name: str, **parameters: Any) -> Any:
        """Retry only RPCs whose request/operation id makes a lost response safe."""
        for attempt in range(3):
            try:
                return await self.rpc(name, **parameters)
            except StorageUnavailable:
                if attempt == 2:
                    raise
                await asyncio.sleep(0.25 * 2**attempt)
        raise AssertionError("Unreachable RPC retry")

    async def current_user(self, authorization: Annotated[str | None, Header()] = None) -> str:
        self.require_configuration()
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "访问凭证缺失，请重新打开页面。")
        token = authorization[7:].strip()
        if not token or len(token) > 8192:
            raise HTTPException(401, "访问凭证无效。")
        try:
            # Auth validates expiry, signature, issuer and revoked/deleted users. No
            # unverified JWT claims or caller-supplied user ids enter the database.
            response = await self.client.get(
                f"{self.settings.url}/auth/v1/user",
                headers={"apikey": self.settings.public_key, "Authorization": authorization},
            )
        except httpx.HTTPError as error:
            raise StorageUnavailable("Identity service unavailable") from error
        if response.status_code in {401, 403}:
            raise HTTPException(401, "访问凭证已失效，请刷新页面后重试。")
        if not response.is_success:
            raise StorageUnavailable("Identity service unavailable")
        try:
            payload = response.json()
            if not isinstance(payload, dict) or not isinstance(payload.get("id"), str):
                raise ValueError("Identity id must be a string")
            return str(UUID(payload["id"]))
        except (KeyError, TypeError, ValueError) as error:
            raise StorageUnavailable("Invalid identity response") from error
