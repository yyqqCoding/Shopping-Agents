"""PostgreSQL-backed catalog adapter for the outdoor assistant.

The model never supplies SQL.  It supplies the same structured ``SearchFilters``
used by the fixture backend; this module turns those values into a fixed RPC call
whose implementation lives in ``supabase/migrations/003_catalog.sql``.

The class inherits the demo's cart, fulfillment, order, and preference behavior so
the catalog migration can be introduced without changing the agent contract.  In
SQL mode the catalog itself is never loaded from ``data/catalog.json``.  Product
objects returned by a query are cached only for the current process so the existing
cart gates can validate ids already shown to the visitor.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from commerce_common.search import keyword_terms
from demo_common.supabase import Supabase
from shopping_agent import Product, ProductDetails, SearchFilters, ShoppingSessionContext

from .mock_retail import MockRetail


def _terms(query: str) -> list[str]:
    """Normalize a query before it crosses the database boundary.

    ``keyword_terms`` already handles Chinese characters and Latin words.  Keeping
    this step in Python means SQL receives a small, predictable array of tokens,
    never an unbounded natural-language expression.
    """

    seen: set[str] = set()
    result: list[str] = []
    for term in keyword_terms(query):
        # SQL receives values as parameters, but ``LIKE`` still treats `%` and `_`
        # as wildcards.  Strip those pattern characters so a user phrase cannot turn
        # a narrow keyword lookup into an accidental match-all scan.
        normalized = term.strip().casefold().replace("%", "").replace("_", "")
        if normalized and normalized not in seen:
            seen.add(normalized)
            result.append(normalized)
    return result[:24]


def _json_value(value: Any) -> Any:
    """Return values accepted by ``httpx``/PostgREST while rejecting odd objects."""

    if isinstance(value, str):
        return value.replace("%", "").replace("_", "")
    if isinstance(value, int | float | bool) or value is None:
        return value
    return str(value)


class CatalogDatabase:
    """Small, typed wrapper around the catalog SQL functions."""

    def __init__(self, database: Supabase) -> None:
        self.database = database
        self.last_page: dict[str, Any] = {"has_more": False, "next_cursor": None}

    async def search(
        self,
        query: str,
        filters: SearchFilters | None,
        limit: int,
        *,
        cursor: Mapping[str, Any] | None = None,
    ) -> list[Product]:
        filters = filters or SearchFilters()
        attributes = {
            str(key): _json_value(value)
            for key, value in filters.attributes.items()
            if str(key).strip()
        }
        response = await self.database.rpc(
            "catalog_search_products",
            p_terms=_terms(query),
            p_category=filters.category,
            p_min_price=filters.min_price,
            p_max_price=filters.max_price,
            p_min_rating=filters.min_rating,
            p_in_stock=filters.in_stock,
            p_attributes=attributes,
            p_sort=filters.sort,
            p_limit=limit,
            p_cursor=dict(cursor) if cursor else None,
        )
        if not isinstance(response, dict):
            raise RuntimeError("catalog_search_products returned an invalid payload")
        self.last_page = {
            "has_more": bool(response.get("has_more")),
            "next_cursor": response.get("next_cursor"),
        }
        raw_products = response.get("products", [])
        if not isinstance(raw_products, list):
            raise RuntimeError("catalog_search_products returned invalid products")
        return [Product.model_validate(row) for row in raw_products if isinstance(row, dict)]

    async def product(self, product_id: str) -> ProductDetails | None:
        response = await self.database.rpc("catalog_get_product", p_product_id=product_id)
        if response is None:
            return None
        if not isinstance(response, dict):
            raise RuntimeError("catalog_get_product returned an invalid payload")
        return ProductDetails.model_validate(response)

    async def policies(self, query: str) -> list[dict[str, Any]]:
        response = await self.database.rpc(
            "catalog_search_policies", p_terms=_terms(query), p_limit=3
        )
        if not isinstance(response, list):
            raise RuntimeError("catalog_search_policies returned an invalid payload")
        return [row for row in response if isinstance(row, dict)]


class SqlRetail(MockRetail):
    """A storefront whose catalog reads are executed by PostgreSQL."""

    def __init__(self, database: Supabase, *, cart_store=None) -> None:
        # Do not pass the catalog directory to the parent.  This is the guard that
        # prevents a configured SQL deployment from accidentally searching fixtures.
        super().__init__(cart_store=cart_store, load_catalog_files=False)
        self._catalog_db = CatalogDatabase(database)
        self.last_page: dict[str, Any] = {"has_more": False, "next_cursor": None}
        self._product_cache: dict[str, ProductDetails] = {}
        self.store_name = "户外装备助手"
        self.currency = "CNY"

    def product(self, product_id: str) -> ProductDetails | None:
        """Return only products already fetched from SQL in this process.

        Cart gates call this synchronous helper after a search/detail call has put the
        product in provenance.  New catalog reads use the async methods below.
        """

        return self._product_cache.get(product_id)

    def listing_of(self, product_id: str) -> ProductDetails | None:
        product = self.product(product_id)
        if product and product.variant_of:
            return self._product_cache.get(product.variant_of)
        return product

    async def search_products(self, session, query, filters=None, limit=8, cursor=None):
        del session
        results = await self._catalog_db.search(query, filters, limit, cursor=cursor)
        self.last_page = dict(self._catalog_db.last_page)
        # Search returns summaries.  Keep a details-shaped copy for cart gates; the
        # database remains the source of truth and this cache is only an id allow-list.
        for product in results:
            details = ProductDetails.model_validate(product.model_dump())
            self._product_cache[product.product_id] = details
        return results

    async def get_product_details(self, session: ShoppingSessionContext, product_id: str):
        del session
        details = await self._catalog_db.product(product_id)
        if details is None:
            return None
        self._product_cache[details.product_id] = details
        for variant in details.variants:
            self._product_cache[variant.product_id] = ProductDetails.model_validate(
                variant.model_dump()
            )
        return details

    async def search_policies(self, session: ShoppingSessionContext, query: str):
        del session
        rows = await self._catalog_db.policies(query)
        # Policy rows are authored JSON payloads, but validation still prevents an
        # unexpected database shape from reaching the model.
        from shopping_agent import Policy

        return [Policy.model_validate(row) for row in rows]

    async def list_products(self, category: str | None, limit: int, offset: int):
        """Public catalog route adapter; offset is translated to a bounded SQL page.

        The chat tool uses keyset cursors.  The existing public route still exposes an
        offset for frontend compatibility, so this method bounds the offset and walks
        at most the requested page count instead of loading the whole catalog.
        """

        if offset > 2000:
            offset = 2000
        cursor: dict[str, Any] | None = None
        remaining = offset
        while remaining:
            page_size = min(8, remaining)
            await self._catalog_db.search(
                "", SearchFilters(category=category), page_size, cursor=cursor
            )
            page = self._catalog_db.last_page
            cursor = page.get("next_cursor")
            if not page.get("has_more") or cursor is None:
                return {"products": [], "has_more": False, "total": None}
            remaining -= page_size
        # The public route historically accepts a page of up to 100 rows.  Walk the
        # SQL pages internally so the browser keeps that contract; the Agent tool still
        # receives only one bounded page and an opaque cursor.
        products: list[Product] = []
        requested = min(limit, 100)
        while len(products) < requested:
            page_size = min(8, requested - len(products))
            products.extend(
                await self._catalog_db.search(
                    "", SearchFilters(category=category), page_size, cursor=cursor
                )
            )
            page = self._catalog_db.last_page
            cursor = page.get("next_cursor")
            if not page.get("has_more") or cursor is None:
                break
        page = self._catalog_db.last_page
        return {
            "products": products,
            "has_more": page.get("has_more", False),
            "total": None,
        }
