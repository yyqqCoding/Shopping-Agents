# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

"""Host code the demo API is built from: the app and its middleware, the session store,
the storefront routes, and (in ``storefront_fixtures``) the helpers the mock backend
calls. The assistant's ``api/`` package constructs its backend, agent, and config,
mounts these, and adds only its own routes. This module exports what the demo and its
tests import; the fixture helpers are imported from their own modules."""

from .host import REPO_ROOT, load_demo_env, spawn_background
from .memory import MemorySeeder
from .sessions import (
    SESSION_HEADER,
    SessionConflictError,
    SessionRecord,
    SessionStore,
    UnknownSessionError,
    session_dependency,
)
from .storefront import CartAddRequest, StorefrontHost, build_storefront_host

__all__ = [
    "REPO_ROOT",
    "SESSION_HEADER",
    "CartAddRequest",
    "MemorySeeder",
    "SessionConflictError",
    "SessionRecord",
    "SessionStore",
    "StorefrontHost",
    "UnknownSessionError",
    "build_storefront_host",
    "load_demo_env",
    "session_dependency",
    "spawn_background",
]
