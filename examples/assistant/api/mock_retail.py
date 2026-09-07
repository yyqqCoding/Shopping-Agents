# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

"""The demo's ``StorefrontBackend`` over the fixtures in ``data/``: keyword search,
per-session carts, fixture orders and policies. An adopter replaces this class with
calls to their own catalog, cart, and order systems."""

from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from demo_common.persistence import PersistentCarts
from demo_common.storefront_fixtures import (
    SessionCarts,
    cart_line,
    example_data_dir,
    find_order,
    find_product,
    keyword_score,
    load_catalog,
    load_orders,
    load_policies,
    load_users,
    option_text,
    orders_for,
    preferences_of,
    rank_products,
    search_help,
    summary_of,
    tokens,
    unavailable_detail,
    within_price_and_rating,
)
from shopping_agent import (
    Cart,
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

DATA_DIR = example_data_dir(__file__)

# Attributes stamped onto products at boot rather than authored in the catalog.
DELIVERY_ATTRIBUTE = "delivery"
LOW_STOCK_ATTRIBUTE = "low_stock"
_STAMPED_ATTRIBUTES = {DELIVERY_ATTRIBUTE, LOW_STOCK_ATTRIBUTE}

_SEARCH_WEIGHTS = {
    "title": 3.0,
    "brand": 2.0,
    "category": 2.0,
    "attributes": 1.5,
    "description": 1.0,
}
_SYNONYMS: dict[str, list[str]] = {
    "luggage": ["spinner", "carry-on", "suitcase"],
    "suitcase": ["spinner", "carry-on", "luggage"],
    "headphones": ["headphone", "earphones"],
    "computer": ["laptop", "monitor"],
    "workout": ["fitness", "exercise"],
    "exercise": ["fitness", "workout"],
    "puppy": ["dog"],
    "kitten": ["cat"],
    "kid": ["kids", "children"],
    "child": ["kids", "children"],
    "couch": ["sofa"],
    "present": ["gift"],
    "camping": ["camp", "tent", "outdoor"],
    "cook": ["cookware", "kitchen"],
    "coffee": ["espresso"],
    "sleep": ["sleeping"],
    "pack": ["backpack"],
    "hike": ["hiking"],
    "露营": ["帐篷", "营地"],
    "沙发": ["sofa"],
    "耳机": ["headphone", "earphones"],
}
_POLICY_ALIASES = {
    "tent": "帐篷",
    "tents": "帐篷",
    "camping": "露营",
    "coffee": "咖啡",
    "chair": "座椅",
    "desk": "办公桌",
    "refund": "退款",
    "refunds": "退款",
    "delivery": "配送",
    "freight": "货运",
    "damaged": "损坏",
    "gift": "礼品卡",
}
_OPTION_ALIASES = {
    "twin": "单人",
    "full": "标准双人",
    "queen": "加宽双人",
    "king": "特大号",
    "standard": "标准",
    "ivory": "象牙白",
    "slate": "岩灰色",
    "blush": "浅粉色",
    "sage": "鼠尾草绿",
    "porcelain": "瓷白",
    "sand": "沙色",
    "honey": "蜜色",
    "amber": "琥珀色",
    "chestnut": "栗色",
    "espresso": "深咖色",
}
_ATTRIBUTE_ALIASES = {
    "颜色": "color",
    "尺寸": "size",
    "尺码": "size",
    "材质": "material",
    "容量": "capacity",
    "色号": "shade",
}

# Review-aspect vocabularies per category (invented, like the reviews themselves).
_ASPECTS_BY_CATEGORY: dict[str, list[str]] = {
    "toys-games": ["耐用性", "可玩性", "年龄适配", "清理便利"],
    "kids-room": ["安装便利", "外观符合描述", "耐用性", "儿童喜爱度"],
    "pet-supplies": ["耐用性", "宠物舒适度", "清洁便利", "尺寸适配"],
    "home-kitchen": ["做工品质", "清洁便利", "使用表现", "性价比"],
    "office-electronics": ["做工品质", "安装使用", "舒适度", "稳定性"],
    "outdoor-camping": ["耐候性", "收纳体积", "安装使用", "耐用性"],
    "fitness": ["做工品质", "握持感", "尺寸适配", "性价比"],
    "travel": ["耐用性", "收纳便利", "轮组与拉杆", "容量"],
    "beauty-personal-care": ["配方温和度", "气味", "使用效果", "性价比"],
    "furniture-bedroom": ["组装便利", "舒适度", "做工品质", "外观符合描述"],
    "grocery": ["新鲜度", "口味", "包装", "性价比"],
}
_ASPECTS_FALLBACK = ["品质", "符合描述", "性价比"]
_FREIGHT_CATEGORIES = {"office-electronics", "fitness", "furniture-bedroom"}
_FREIGHT_PRICE_FLOOR = 350
# The terms of the shipping entry in policies.json, which is what the agent quotes;
# test_mock_retail checks that the entry still states each of them.
FREE_SHIPPING_OVER = 49
STANDARD_SHIPPING = FulfillmentOption(method="delivery", eta="3–5 个工作日（标准配送）", fee=5.99)
EXPRESS_SHIPPING = FulfillmentOption(method="delivery", eta="2 个工作日（加急配送）", fee=9.99)
FREIGHT_SHIPPING = FulfillmentOption(method="shipping", eta="5–7 个工作日（大件货运）", fee=29.0)
_STORE_OPENS, _STORE_CLOSES = 9, 21


class MockRetail(StorefrontBackend):
    def __init__(
        self, data_dir: Path = DATA_DIR, *, cart_store: PersistentCarts | None = None
    ) -> None:
        catalog, self.products, self.variants = load_catalog(data_dir)
        self._search_terms = {
            p["product_id"]: " ".join(p.get("search_terms", [])) for p in catalog["products"]
        }
        self._search_attributes = {
            p["product_id"]: p.get("search_attributes", {}) for p in catalog["products"]
        }
        evidence_path = data_dir / "evidence.json"
        self._evidence = (
            json.loads(evidence_path.read_text(encoding="utf-8")) if evidence_path.exists() else {}
        )
        self.store_name: str = catalog.get("store_name", "ACME")
        self._users = load_users(data_dir)
        self._orders = load_orders(data_dir)
        self._policies = load_policies(data_dir)
        self._carts = SessionCarts()
        self._cart_store = cart_store
        self._stamp_delivery_promises()
        self._stamp_low_stock(data_dir)

    def _stamp_delivery_promises(self) -> None:
        """A policy-aligned estimate that does not expire during a long-running demo."""
        for product in self.products.values():
            if not product.in_stock:
                continue
            label = "标准配送约 3–5 个工作日"
            product.attributes[DELIVERY_ATTRIBUTE] = label
            # A family's in-stock variants ship on the family's promise.
            for variant in product.variants:
                if (record := self.variants.get(variant.product_id)) and record.in_stock:
                    record.attributes[DELIVERY_ATTRIBUTE] = label

    def _stamp_low_stock(self, data_dir: Path) -> None:
        """The "only N left" attribute, taken from the stock rows in ``inventory.json``."""
        overlay_path = data_dir / "inventory.json"
        if not overlay_path.exists():
            return
        overlay = json.loads(overlay_path.read_text(encoding="utf-8"))
        default_threshold = int(overlay.get("default_threshold", 8))
        for row in overlay.get("inventory", []):
            product = self.product(row.get("product_id", ""))
            if product is None or not product.in_stock:
                continue
            stock = int(row.get("stock", 0))
            if 0 < stock <= int(row.get("threshold", default_threshold)):
                product.attributes[LOW_STOCK_ATTRIBUTE] = str(stock)

    # ------------------------------------------------------------------
    # Catalog
    # ------------------------------------------------------------------

    def listing_of(self, product_id: str) -> ProductDetails | None:
        """The listing an id belongs to: itself, or its family when it is a variant."""
        record = self.product(product_id)
        if record is not None and record.variant_of:
            return self.products.get(record.variant_of)
        return record

    def _searchable_text(self, product: ProductDetails) -> dict[str, str]:
        return {
            "title": product.title + " " + self._search_terms.get(product.product_id, ""),
            "brand": product.brand or "",
            "category": product.category or "",
            "attributes": " ".join(
                f"{k} {v}" for k, v in product.attributes.items() if k not in _STAMPED_ATTRIBUTES
            )
            + " "
            + option_text(product)
            + " "
            + " ".join(
                _OPTION_ALIASES.get(value, value)
                for values in product.options.values()
                for value in values
            ),
            "description": f"{product.short_description or ''} {product.long_description or ''}",
        }

    def _score(self, product: ProductDetails, query_tokens: list[str]) -> float:
        return keyword_score(
            self._searchable_text(product), _SEARCH_WEIGHTS, query_tokens, _SYNONYMS
        )

    def _soft_filter(self, product: Product, filters: SearchFilters) -> bool:
        if (
            filters.category
            and filters.category.lower()
            not in (
                (product.category or "") + " " + product.attributes.get("category_label", "")
            ).lower()
        ):
            return False
        if not filters.attributes:
            return True
        haystack = " ".join(
            f"{k}={v}".lower()
            for k, v in product.attributes.items()
            if k not in _STAMPED_ATTRIBUTES
        )
        haystack += f" {product.title.lower()} {option_text(product).lower()}"
        original = self._search_attributes.get(product.variant_of or product.product_id, {})
        for key, value in filters.attributes.items():
            key = _ATTRIBUTE_ALIASES.get(key, key)
            wanted = str(value).strip().casefold()
            choices = (
                [product.option_values[key]]
                if key in product.option_values
                else product.options.get(key)
            )
            if choices is not None:
                if not any(
                    wanted in {choice.casefold(), _OPTION_ALIASES.get(choice, choice).casefold()}
                    for choice in choices
                ):
                    return False
                continue
            actual = product.attributes.get(key)
            text = f"{actual} {original.get(key, '')}".lower() if actual is not None else haystack
            if wanted not in text:
                return False
        return True

    def _matches_filters(self, product: ProductDetails, filters: SearchFilters) -> bool:
        if not within_price_and_rating(product, filters) or not self._soft_filter(product, filters):
            return False
        # A family must have one variant meeting every condition together. Matching
        # the size of one sibling and the price/stock/color of another is misleading.
        if product.variants:
            return any(
                within_price_and_rating(variant, filters) and self._soft_filter(variant, filters)
                for variant in product.variants
            )
        return True

    async def search_products(
        self,
        session: ShoppingSessionContext,
        query: str,
        filters: SearchFilters | None = None,
        limit: int = 8,
    ) -> list[Product]:
        del session
        ranked = rank_products(
            self.products.values(),
            query,
            filters,
            limit,
            score=self._score,
            hard_filter=self._matches_filters,
            soft_filter=self._soft_filter,
        )
        return [summary_of(product) for product in ranked]

    def product(self, product_id: str) -> ProductDetails | None:
        return find_product(self.products, self.variants, product_id)

    async def get_product_details(
        self, session: ShoppingSessionContext, product_id: str
    ) -> ProductDetails | None:
        del session
        product = self.product(product_id)
        if product is None:
            return None
        specs = dict(product.specs)
        if intel := self.price_intelligence(product_id):
            specs["模拟价格走势（USD）"] = ", ".join(str(value) for value in intel["series"])
            specs["模拟价格说明"] = intel["verdict"]
        if reviews := self.review_aspects(product_id):
            specs["模拟评价摘要"] = "；".join(
                f"{a['name']}：{a['mentions']} 次提及，其中 {a['positive_pct']}% 为正面"
                for a in reviews["aspects"]
            )
        return product.model_copy(update={"specs": specs})

    def price_intelligence(self, product_id: str) -> dict[str, Any] | None:
        """A 90-day price series derived from the product id, ending at today's price,
        with a verdict computed from where that price sits in the series' range. Read
        by both the storefront detail panel and the agent's detail tool."""
        if product_id in self._evidence:
            return self._evidence[product_id]["price_intelligence"]
        product = self.product(product_id)
        if product is None or product.price <= 0:
            return None
        digest = hashlib.sha256(product_id.encode("utf-8")).digest()
        amplitude = product.price * (0.06 + (digest[0] / 255) * 0.08)
        phase = (digest[1] / 255) * 2 * math.pi
        drift = ((digest[2] / 255) - 0.5) * 0.5
        points = 13
        series = []
        for i in range(points):
            wobble = math.sin(phase + i * 1.1) + 0.4 * math.sin(phase * 2 + i * 2.3)
            trend = drift * (i - points + 1) / points
            series.append(round(max(product.price + amplitude * (wobble / 1.4 + trend), 0.5), 2))
        series[-1] = product.price
        low, high = min(series), max(series)
        if high - low < 0.01:
            position = "typical"
        else:
            ratio = (product.price - low) / (high - low)
            position = "low" if ratio <= 0.25 else "high" if ratio >= 0.75 else "typical"
        verdict = {
            "low": f"US${product.price:.2f} 接近模拟价格低位",
            "typical": f"US${product.price:.2f} 处于模拟价格常规区间",
            "high": f"US${product.price:.2f} 处于模拟价格高位",
        }[position]
        return {
            "days": 90,
            "series": series,
            "low": low,
            "high": high,
            "position": position,
            "verdict": f"{verdict}（90 天范围 US${low:.0f}–US${high:.0f}）",
        }

    def review_aspects(self, product_id: str) -> dict[str, Any] | None:
        """Review-aspect chips derived from the product id, with sentiment anchored to
        its rating and mention counts bounded by its review count."""
        if product_id in self._evidence:
            return self._evidence[product_id]["review_aspects"]
        product = self.listing_of(product_id)
        if product is None or not product.review_count or product.review_count < 25:
            return None
        digest = hashlib.sha256(f"aspects:{product.product_id}".encode()).digest()
        names = _ASPECTS_BY_CATEGORY.get(product.category or "", _ASPECTS_FALLBACK)
        count = 3 if len(names) < 4 or digest[0] % 2 == 0 else 4
        rating = product.rating or 4.2
        mention_share = 0.32 + (digest[1] / 255) * 0.2
        aspects = []
        for i, name in enumerate(names[:count]):
            jitter = (digest[2 + i] / 255 - 0.5) * 14
            positive_pct = round(min(97.0, max(45.0, rating * 20 - 4 + jitter - i * 3)))
            share = mention_share * (0.45 if i == 0 else 0.55 / max(count - 1, 1))
            floor = min(12, product.review_count // (count + 1))
            mentions = max(int(product.review_count * share), floor, 1)
            aspects.append({"name": name, "positive_pct": int(positive_pct), "mentions": mentions})
        return {"review_count": product.review_count, "aspects": aspects}

    # ------------------------------------------------------------------
    # Cart
    # ------------------------------------------------------------------

    async def get_cart(self, session: ShoppingSessionContext) -> Cart:
        if self._cart_store is not None:
            return await self._cart_store.get(session)
        return self._carts.cart(session.session_id)

    async def add_to_cart(
        self, session: ShoppingSessionContext, product_id: str, quantity: int
    ) -> Cart:
        product = self.product(product_id)
        if product is None or product.has_options:
            # The executor's gates hold both cases before they reach a backend; a real
            # cart service refuses them on its own terms too.
            raise KeyError(product_id)
        if not product.in_stock:
            raise Unavailable(unavailable_detail(product, self.listing_of(product_id)))
        if self._cart_store is not None:
            return await self._cart_store.change(
                session, "add", cart_line(product, quantity).model_dump(mode="json"), quantity
            )
        existing = self._carts.lines(session.session_id).get(product_id)
        quantity += existing.quantity if existing else 0
        return self._carts.put(session.session_id, product, quantity)

    async def update_cart_item(
        self, session: ShoppingSessionContext, product_id: str, quantity: int
    ) -> Cart:
        if self._cart_store is not None:
            product = self.product(product_id)
            if product is None:
                raise KeyError(product_id)
            if not product.in_stock:
                raise Unavailable(unavailable_detail(product, self.listing_of(product_id)))
            return await self._cart_store.change(
                session, "set", cart_line(product, quantity).model_dump(mode="json"), quantity
            )
        return self._carts.set_quantity(session.session_id, product_id, quantity)

    async def remove_from_cart(self, session: ShoppingSessionContext, product_id: str) -> Cart:
        if self._cart_store is not None:
            return await self._cart_store.change(session, "remove", {"product_id": product_id}, 0)
        return self._carts.remove(session.session_id, product_id)

    def reset_session(self, session_id: str) -> None:
        self._carts.reset(session_id)

    # ------------------------------------------------------------------
    # Customer, orders, help content, fulfillment
    # ------------------------------------------------------------------

    async def get_preferences(self, session: ShoppingSessionContext) -> UserPreferences:
        return preferences_of(self._users, session.user_id)

    async def get_orders(self, session: ShoppingSessionContext, limit: int = 5) -> list[Order]:
        return orders_for(self._orders, session.user_id, limit)

    async def get_order(self, session: ShoppingSessionContext, order_id: str) -> Order | None:
        return find_order(self._orders, session.user_id, order_id)

    async def search_policies(self, session: ShoppingSessionContext, query: str) -> list[Policy]:
        del session
        aliases = " ".join(
            _POLICY_ALIASES[token] for token in tokens(query) if token in _POLICY_ALIASES
        )
        return search_help(self._policies, f"{query} {aliases}")

    @staticmethod
    def _pickup_eta(now: datetime) -> str:
        """Two hours of preparation from now (or from opening), promised as the top of
        an hour inside store hours, otherwise tomorrow morning."""
        opens = now.replace(hour=_STORE_OPENS, minute=0, second=0, microsecond=0)
        ready = max(now, opens) + timedelta(hours=2)
        if ready.minute or ready.second or ready.microsecond:
            ready = ready.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
        if ready.date() != now.date() or ready.hour > _STORE_CLOSES:
            return "明天上午"
        return f"今天 {ready.hour:02d}:00 前"

    async def get_fulfillment_options(
        self, session: ShoppingSessionContext, product_ids: list[str]
    ) -> list[FulfillmentOption]:
        prefs = await self.get_preferences(session)
        location = prefs.default_location or "体验门店"
        quoted = [product for pid in product_ids if (product := self.product(pid))]
        standard = STANDARD_SHIPPING
        if sum(product.price for product in quoted) > FREE_SHIPPING_OVER:
            standard = standard.model_copy(update={"fee": 0.0})
        options = [
            standard,
            EXPRESS_SHIPPING,
            FulfillmentOption(
                method="pickup",
                eta=self._pickup_eta(session.local_now() or datetime.now()),
                fee=0.0,
                location=f"ACME {location}",
            ),
        ]
        if any(
            product.category in _FREIGHT_CATEGORIES and product.price > _FREIGHT_PRICE_FLOOR
            for product in quoted
        ):
            options.append(FREIGHT_SHIPPING)
        return options
