"""The ``StorefrontBackend`` over the Java commerce service.

``commerce-service/`` owns the catalog, live stock, carts and orders in MySQL; this
adapter maps each backend method onto one of its ``/internal/v1`` routes. The agent core,
its tools and its prompt are the same bytes as over ``MockRetail``. The service is
reached on a private network with a shared bearer token; the customer's id travels in
``X-User-Id`` and the conversation id in ``X-Conversation-Id``, which the service also
writes into its SQL log lines.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from typing import Any
from urllib.parse import quote

import httpx

from commerce_common.search import keyword_terms
from shopping_agent import (
    Cart,
    CheckoutHandoff,
    FulfillmentOption,
    Order,
    Policy,
    Product,
    ProductDetails,
    SearchFilters,
    ShoppingSessionContext,
    StorefrontBackend,
    Unavailable,
    UserPreferences,
)

from .mock_retail import with_evidence

# Codes the service answers with (commerce-service ErrorCode).
UNAVAILABLE = "UNAVAILABLE"
NOT_FOUND = "NOT_FOUND"


class CommerceError(Exception):
    """A refusal or failure from the commerce service; ``detail`` is its Chinese sentence."""

    def __init__(self, status: int, code: str, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.code = code
        self.detail = detail


def search_terms(query: str) -> list[str]:
    """The query as keywords (Chinese bigrams and Latin words), at most 24."""
    terms = [term.replace("%", "").replace("_", "") for term in keyword_terms(query)]
    return [term for term in dict.fromkeys(terms) if term][:24]


class JavaRetail(StorefrontBackend):
    store_name = "户外装备助手"
    currency = "CNY"

    def __init__(
        self, base_url: str, token: str, *, client: httpx.AsyncClient | None = None
    ) -> None:
        if not base_url or not token:
            raise ValueError("COMMERCE_SERVICE_URL and COMMERCE_SERVICE_TOKEN are required")
        self._base = base_url.rstrip("/") + "/internal/v1"
        self._token = token
        self._client = client or httpx.AsyncClient(timeout=5.0)
        # The executor reads the page of the search it just ran from here.
        self.last_page: dict[str, Any] = {"has_more": False, "next_cursor": None}
        # Evidence from detail reads, for the web detail panel (price_intelligence and
        # review_aspects below); the service remains the source.
        self._evidence: dict[str, dict[str, Any]] = {}

    @classmethod
    def from_env(cls) -> JavaRetail:
        return cls(
            os.environ.get("COMMERCE_SERVICE_URL", "").strip(),
            os.environ.get("COMMERCE_SERVICE_TOKEN", "").strip(),
        )

    async def _call(
        self,
        method: str,
        path: str,
        session: ShoppingSessionContext | None = None,
        *,
        json: Any = None,
        params: Mapping[str, Any] | None = None,
        idempotency_key: str | None = None,
    ) -> Any:
        headers = {"Authorization": f"Bearer {self._token}"}
        if session is not None:
            headers["X-User-Id"] = session.user_id
            headers["X-Conversation-Id"] = session.session_id
        if idempotency_key is not None:
            headers["Idempotency-Key"] = idempotency_key
        response = await self._client.request(
            method, self._base + path, headers=headers, json=json, params=params
        )
        if response.is_success:
            return response.json()
        try:
            problem = response.json()
        except ValueError:
            problem = {}
        raise CommerceError(
            response.status_code,
            str(problem.get("code") or "INTERNAL"),
            str(problem.get("detail") or "订单服务暂时不可用"),
        )

    # -- Catalog ------------------------------------------------------------------

    async def search_products(
        self,
        session: ShoppingSessionContext,
        query: str,
        filters: SearchFilters | None = None,
        limit: int = 8,
        cursor: Mapping[str, Any] | None = None,
    ) -> list[Product]:
        filters = filters or SearchFilters()
        page = await self._call(
            "POST",
            "/catalog/search",
            session,
            json={
                "terms": search_terms(query),
                "category": filters.category,
                "min_price": filters.min_price,
                "max_price": filters.max_price,
                "min_rating": filters.min_rating,
                "in_stock": filters.in_stock,
                "attributes": filters.attributes,
                "sort": filters.sort,
                "limit": limit,
                "cursor": dict(cursor) if cursor else None,
            },
        )
        self.last_page = {
            "has_more": bool(page["has_more"]),
            "next_cursor": page.get("next_cursor"),
        }
        return [Product.model_validate(product) for product in page["products"]]

    async def get_product_details(
        self, session: ShoppingSessionContext | None, product_id: str
    ) -> ProductDetails | None:
        try:
            record = await self._call(
                "GET", f"/catalog/products/{quote(product_id, safe='')}", session
            )
        except CommerceError as error:
            if error.code == NOT_FOUND:
                return None
            raise
        evidence = record.pop("evidence", None) or {}
        self._evidence[product_id] = evidence
        return with_evidence(
            ProductDetails.model_validate(record),
            evidence.get("price_intelligence"),
            evidence.get("review_aspects"),
        )

    def price_intelligence(self, product_id: str) -> dict[str, Any] | None:
        return self._evidence.get(product_id, {}).get("price_intelligence")

    def review_aspects(self, product_id: str) -> dict[str, Any] | None:
        return self._evidence.get(product_id, {}).get("review_aspects")

    async def list_products(self, category: str | None, limit: int, offset: int) -> dict[str, Any]:
        """The public equipment listing with live stock."""
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if category:
            params["category"] = category
        page = await self._call("GET", "/catalog/products", params=params)
        return {
            "products": [Product.model_validate(product) for product in page["products"]],
            "has_more": page["has_more"],
            "total": page["total"],
        }

    # -- Cart ---------------------------------------------------------------------

    def _cart_path(self, session: ShoppingSessionContext) -> str:
        return f"/carts/{session.session_id}"

    async def _cart_write(
        self, method: str, path: str, session: ShoppingSessionContext, json: Any = None
    ) -> Cart:
        try:
            return Cart.model_validate(await self._call(method, path, session, json=json))
        except CommerceError as error:
            if error.code == UNAVAILABLE:
                raise Unavailable(error.detail) from None
            raise

    async def get_cart(self, session: ShoppingSessionContext) -> Cart:
        return Cart.model_validate(await self._call("GET", self._cart_path(session), session))

    async def add_to_cart(
        self, session: ShoppingSessionContext, product_id: str, quantity: int
    ) -> Cart:
        return await self._cart_write(
            "POST",
            f"{self._cart_path(session)}/items",
            session,
            {"sku_id": product_id, "quantity": quantity},
        )

    async def update_cart_item(
        self, session: ShoppingSessionContext, product_id: str, quantity: int
    ) -> Cart:
        return await self._cart_write(
            "PUT",
            f"{self._cart_path(session)}/items/{quote(product_id, safe='')}",
            session,
            {"quantity": quantity},
        )

    async def remove_from_cart(self, session: ShoppingSessionContext, product_id: str) -> Cart:
        return await self._cart_write(
            "DELETE", f"{self._cart_path(session)}/items/{quote(product_id, safe='')}", session
        )

    async def checkout_handoff(
        self, session: ShoppingSessionContext, cart: Cart
    ) -> list[CheckoutHandoff]:
        del session
        if any(item.unavailable_reason for item in cart.items):
            raise Unavailable("购物车中有下架或缺货商品，请先移除或替换后再查看结算摘要。")
        return []

    def reset_session(self, session_id: str) -> None:
        """Carts belong to their conversation in the service; nothing is held here."""
        del session_id

    # -- Orders -------------------------------------------------------------------

    async def submit_order(
        self,
        session: ShoppingSessionContext,
        lines: list[tuple[str, int]],
        request_id: str,
    ) -> Order:
        """Orders the conversation's cart and takes its stock, all or nothing. Called by
        the host when the customer presses the checkout card's button; no tool calls it.
        ``lines`` are the (id, quantity) pairs the card showed."""
        order = await self._call(
            "POST",
            "/orders",
            session,
            json={
                "conversation_id": session.session_id,
                "lines": [{"sku_id": sku, "quantity": quantity} for sku, quantity in lines],
            },
            idempotency_key=request_id,
        )
        return Order.model_validate(order)

    async def get_orders(self, session: ShoppingSessionContext, limit: int = 5) -> list[Order]:
        rows = await self._call("GET", "/orders", session, params={"limit": limit})
        return [Order.model_validate(row) for row in rows]

    async def get_order(self, session: ShoppingSessionContext, order_id: str) -> Order | None:
        try:
            row = await self._call("GET", f"/orders/{quote(order_id, safe='')}", session)
        except CommerceError as error:
            if error.code == NOT_FOUND:
                return None
            raise
        return Order.model_validate(row)

    # -- Customer context, policies, fulfillment ----------------------------------

    async def get_preferences(self, session: ShoppingSessionContext) -> UserPreferences:
        return UserPreferences(user_id=session.user_id, display_name="访客")

    async def search_policies(self, session: ShoppingSessionContext, query: str) -> list[Policy]:
        rows = await self._call(
            "POST", "/policies/search", session, json={"terms": search_terms(query)}
        )
        return [Policy.model_validate(row) for row in rows]

    async def get_fulfillment_options(
        self, session: ShoppingSessionContext, product_ids: list[str]
    ) -> list[FulfillmentOption]:
        try:
            rows = await self._call(
                "POST",
                "/fulfillment/quote",
                session,
                json={"conversation_id": session.session_id, "product_ids": product_ids},
            )
        except CommerceError as error:
            if error.code == UNAVAILABLE:
                raise Unavailable(error.detail) from None
            raise
        return [FulfillmentOption.model_validate(row) for row in rows]
