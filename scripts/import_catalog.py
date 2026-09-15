"""Import the authored outdoor fixtures into the catalog tables.

Usage (after applying ``supabase/migrations/003_catalog.sql``)::

    python scripts/import_catalog.py

The script is deliberately an explicit import step.  The API never reads the JSON
fixtures at runtime when ``CATALOG_BACKEND=sql``.  Upserts are performed with the
Supabase service key and preserve product ids, so the command can be repeated when
the authored catalog changes.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

# Running this file directly puts ``scripts/`` on sys.path, while the demo package
# lives under ``examples/``.  Add that package root explicitly for the documented
# command; the application itself does not need this path adjustment.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "examples"))

from demo_common.storefront_fixtures import load_catalog  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "examples" / "assistant" / "data"

# Keep the documented command short: read the same root configuration as the demo.
# Explicit shell variables still win because python-dotenv does not override them.
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "examples" / "assistant" / ".env")


def _search_text(product: dict[str, Any]) -> str:
    """Build one searchable document from authored title, terms and attributes."""

    pieces = [
        product.get("title", ""),
        product.get("category", ""),
        product.get("short_description", ""),
        " ".join(str(item) for item in product.get("search_terms", [])),
        " ".join(f"{key} {value}" for key, value in product.get("attributes", {}).items()),
    ]
    return " ".join(piece for piece in pieces if piece).strip()


def _product_row(product: Any, *, order: int, retired: bool = False) -> dict[str, Any]:
    payload = product.model_dump(mode="json", exclude={"variants"})
    return {
        "product_id": product.product_id,
        "title": product.title,
        "category": product.category,
        "price": product.price,
        "currency": product.currency,
        "rating": product.rating,
        "review_count": product.review_count,
        "in_stock": product.in_stock,
        "retired": retired or product.attributes.get("retired") == "true",
        "display_order": order,
        "search_text": _search_text(payload),
        "attributes": product.attributes,
        "payload": payload,
    }


def _variant_row(product: Any, *, retired: bool = False) -> dict[str, Any]:
    payload = product.model_dump(mode="json")
    return {
        "product_id": product.product_id,
        "variant_of": product.variant_of,
        "title": product.title,
        "price": product.price,
        "currency": product.currency,
        "in_stock": product.in_stock,
        "retired": retired or product.attributes.get("retired") == "true",
        "search_text": _search_text(payload),
        "attributes": product.attributes,
        "payload": payload,
    }


def _policy_rows(data_dir: Path) -> list[dict[str, Any]]:
    raw = json.loads((data_dir / "policies.json").read_text(encoding="utf-8"))
    rows = []
    for policy in raw.get("policies", []):
        rows.append(
            {
                **policy,
                "search_text": " ".join(
                    str(policy.get(key, ""))
                    for key in ("policy_id", "title", "category", "content")
                ),
                "payload": policy,
            }
        )
    return rows


def _evidence_rows(data_dir: Path) -> list[dict[str, Any]]:
    evidence_path = data_dir / "evidence.json"
    if not evidence_path.exists():
        return []
    raw = json.loads(evidence_path.read_text(encoding="utf-8"))
    return [{"product_id": product_id, "payload": payload} for product_id, payload in raw.items()]


def _stamp_current_catalog(
    products: dict[str, Any], variants: dict[str, Any], data_dir: Path
) -> None:
    """Apply the same server-authored delivery and low-stock facts as the fixture backend."""

    for product in products.values():
        if product.in_stock:
            product.attributes["delivery"] = "标准配送约 3–5 个工作日"
    for variant in variants.values():
        if variant.in_stock:
            variant.attributes["delivery"] = "标准配送约 3–5 个工作日"

    inventory_path = data_dir / "inventory.json"
    if not inventory_path.exists():
        return
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    threshold = int(inventory.get("default_threshold", 8))
    for row in inventory.get("inventory", []):
        product = products.get(row.get("product_id")) or variants.get(row.get("product_id"))
        stock = int(row.get("stock", 0))
        if (
            product is not None
            and product.in_stock
            and 0 < stock <= int(row.get("threshold", threshold))
        ):
            product.attributes["low_stock"] = str(stock)


def _upsert(
    client: httpx.Client, base: str, key: str, table: str, rows: list[dict[str, Any]]
) -> None:
    if not rows:
        return
    response = client.post(
        f"{base}/rest/v1/{table}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        json=rows,
    )
    response.raise_for_status()


def main() -> None:
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

    raw, products, variants = load_catalog(DATA_DIR)
    del raw
    _stamp_current_catalog(products, variants, DATA_DIR)
    rows = [_product_row(product, order=index) for index, product in enumerate(products.values())]
    variant_rows = [_variant_row(variant) for variant in variants.values()]
    # Historical ids remain queryable for old conversations but are excluded from
    # normal search by ``retired``.  Import them into the same tables so detail pages
    # and cart cleanup can still resolve their original ids.
    legacy_dir = DATA_DIR / "legacy"
    if (legacy_dir / "catalog.json").exists():
        _, legacy_products, legacy_variants = load_catalog(legacy_dir)
        for product in [*legacy_products.values(), *legacy_variants.values()]:
            product.in_stock = False
            product.title = product.title.removeprefix("ACME ")
            product.brand = None
            product.attributes["retired"] = "true"
            product.attributes["availability_note"] = "已下架，仅供历史查看"
        start = len(rows)
        rows.extend(
            [
                _product_row(product, order=start + index, retired=True)
                for index, product in enumerate(legacy_products.values())
            ]
        )
        variant_rows.extend(
            [_variant_row(variant, retired=True) for variant in legacy_variants.values()]
        )
    with httpx.Client(timeout=30.0) as client:
        _upsert(client, base, key, "catalog_products", rows)
        _upsert(client, base, key, "catalog_variants", variant_rows)
        _upsert(client, base, key, "catalog_policies", _policy_rows(DATA_DIR))
        evidence_rows = _evidence_rows(DATA_DIR)
        if (legacy_dir / "evidence.json").exists():
            evidence_rows.extend(_evidence_rows(legacy_dir))
        _upsert(client, base, key, "catalog_evidence", evidence_rows)
    print(f"Imported {len(rows)} products, {len(variant_rows)} variants and policies.")


if __name__ == "__main__":
    main()
