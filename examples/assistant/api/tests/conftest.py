# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

import pytest

from demo_common.tests.fixtures import *  # noqa: F403

from .. import main as main_module
from ..mock_retail import MockRetail


@pytest.fixture(scope="session")
def main():
    return main_module


@pytest.fixture(scope="session")
def make_storefront():
    return MockRetail
