# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

from collections import defaultdict, deque
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from demo_common.storefront_fixtures import SessionCarts
from demo_common.tests.experience_fixtures import (
    ConversationDouble,
    create_visitor,
    identity_service,
)
from demo_common.tests.fixtures import *  # noqa: F403

from .. import main as main_module
from ..mock_retail import MockRetail


@pytest.fixture(scope="session")
def main():
    return main_module


@pytest.fixture(scope="session")
def make_storefront():
    return MockRetail


@pytest.fixture
def conversation_store():
    return ConversationDouble()


@pytest.fixture
def client(main, conversation_store, monkeypatch):
    database = identity_service()
    memory = conversation_store.memory
    monkeypatch.setattr(main.database, "settings", database.settings)
    monkeypatch.setattr(main.database, "client", database.client)
    monkeypatch.setattr(main.host, "store", conversation_store)
    monkeypatch.setattr(main.host, "memory_store", memory)
    monkeypatch.setattr(main.host, "_rates", defaultdict(deque))
    monkeypatch.setattr(main.agent, "memory", replace(main.agent.memory, store=memory))
    monkeypatch.setattr(main.backend, "_cart_store", None)
    monkeypatch.setattr(main.backend, "_carts", SessionCarts())
    return TestClient(main.app, base_url="http://localhost")


@pytest.fixture
def shopper(client, main, conversation_store):
    def start(*seen: str, auth=None):
        return create_visitor(
            client, *seen, auth=auth, store=conversation_store, backend=main.backend
        )

    return start
