# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

"""Shared fixtures; the demo's conftest star-imports them and defines ``main`` and
``make_storefront``."""

import pytest
from fastapi.testclient import TestClient

from commerce_common.skills import SkillRegistry
from demo_common import SESSION_HEADER
from shopping_agent import ShoppingSessionContext, ShoppingSessionState
from shopping_agent.executor import ShoppingToolExecutor


def start_shopper(client: TestClient, user_id: str = "demo-user") -> dict[str, str]:
    """Returns the headers of a new storefront session for ``user_id``."""
    token = client.post("/api/session", json={"user_id": user_id}).json()["session_id"]
    return {SESSION_HEADER: token}


def session_record(main, headers: dict[str, str]):
    """Returns the host's session record behind ``headers``."""
    return main.host.sessions.require(headers[SESSION_HEADER])


@pytest.fixture
def client(main) -> TestClient:
    return TestClient(main.app, base_url="http://localhost")


@pytest.fixture
def shopper(main, client):
    """Returns ``start(*product_ids, user_id=...)``, the headers of a new session that has seen those products."""

    def start(*seen: str, user_id: str = "demo-user") -> dict[str, str]:
        headers = start_shopper(client, user_id)
        record = session_record(main, headers)
        record.state.remember_products([main.backend.product(pid) for pid in seen])
        main.host.sessions.save(record)
        return headers

    return start


@pytest.fixture
def backend(make_storefront):
    return make_storefront()


@pytest.fixture
def session() -> ShoppingSessionContext:
    return ShoppingSessionContext(session_id="s-1", user_id="demo-user")


@pytest.fixture
def other_session() -> ShoppingSessionContext:
    return ShoppingSessionContext(session_id="s-2", user_id="demo-user-2")


@pytest.fixture
def state() -> ShoppingSessionState:
    return ShoppingSessionState()


@pytest.fixture
def make_executor(main, backend, state):
    """Returns a builder for the deployment's executor over ``backend`` and ``state`` for a session."""

    def build(session: ShoppingSessionContext) -> ShoppingToolExecutor:
        return ShoppingToolExecutor(
            backend=backend,
            config=main.agent.config,
            skills=SkillRegistry([]),
            session=session,
            state=state,
            extensions=list(main.agent.extra_presentation_tools),
        )

    return build


@pytest.fixture
def executor(make_executor, session) -> ShoppingToolExecutor:
    return make_executor(session)
