"""Optional real SQL contract; mock transport tests do not validate transactions."""

import os
import shutil
import subprocess
from pathlib import Path

import pytest


def test_postgres_transaction_contract():
    database_url = os.environ.get("SHOPPING_TEST_DATABASE_URL")
    psql = shutil.which("psql")
    if not database_url or not psql:
        pytest.skip(
            "Set SHOPPING_TEST_DATABASE_URL to a migrated disposable Supabase DB and provide psql"
        )
    script = Path(__file__).resolve().parents[3] / "supabase" / "tests" / "contract.sql"
    result = subprocess.run(
        [psql, "--no-psqlrc", "--file", str(script)],
        env={**os.environ, "PGDATABASE": database_url},
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
