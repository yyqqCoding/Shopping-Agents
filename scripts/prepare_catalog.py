"""Generate the frozen outdoor catalog and evidence; --check validates deployable data.

The authored source is outdoor_catalog.py. No model or image service is called.
Legacy catalog files are read-only compatibility records and are never regenerated.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

from outdoor_catalog import CATEGORIES, catalog, policies

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "examples" / "assistant" / "data"
PUBLIC = ROOT / "examples" / "assistant" / "storefront-web" / "public"

ASPECTS = {
    "outdoor-shelter": ["空间与通风", "收纳重量", "搭建便利"],
    "outdoor-sleep": ["睡眠舒适", "收纳体积", "重量"],
    "outdoor-packs": ["背负舒适", "容量分区", "自重"],
    "outdoor-apparel": ["穿着版型", "分层搭配", "收纳重量"],
    "outdoor-footwear": ["尺码与楦型", "行走脚感", "透气表现"],
    "outdoor-lighting": ["照明或输出", "续航", "携带便利"],
    "outdoor-cooking": ["容量适配", "清洗便利", "收纳重量"],
    "outdoor-accessories": ["场景适配", "收纳便利", "做工"],
}


def write_json(path: Path, data: object) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )


def evidence(product: dict) -> dict:
    price = product["price"]
    digest = hashlib.sha256(product["product_id"].encode()).digest()
    amplitude = price * (0.06 + digest[0] / 255 * 0.08)
    series = [round(max(0.5, price + amplitude * math.sin(digest[1] + i)), 2) for i in range(13)]
    series[-1] = price
    low, high = min(series), max(series)
    ratio = (price - low) / (high - low) if high > low else 0.5
    position = "low" if ratio <= 0.25 else "high" if ratio >= 0.75 else "typical"
    label = {"low": "低位", "high": "高位", "typical": "常规区间"}[position]
    count = product["review_count"]
    aspects = [
        {
            "name": name,
            "positive_pct": max(45, min(97, round(product["rating"] * 20 - i * 4))),
            "mentions": max(1, int(count * share)),
        }
        for i, (name, share) in enumerate(
            zip(ASPECTS[product["category"]], [0.25, 0.16, 0.12], strict=True)
        )
    ]
    return {
        "source": "离线生成的虚构展示数据",
        "price_intelligence": {
            "days": 90,
            "series": series,
            "low": low,
            "high": high,
            "position": position,
            "verdict": f"当前 ¥{price:.2f}，处于模拟价格走势的{label}",
        },
        "review_aspects": {"review_count": count, "aspects": aspects},
        "review_samples": product["review_highlights"],
    }


def prepare() -> None:
    data = catalog()
    frozen = {}
    prompts = []
    for family in data["products"]:
        for product in [family, *family.get("variants", [])]:
            filled = family | product
            pid = filled["product_id"]
            path = f"/products/generated/{pid}.webp"
            # A missing photograph has no URL: the page uses the category illustration.
            if (PUBLIC / path.lstrip("/")).is_file():
                product["image_url"] = path
            frozen[pid] = evidence(filled)
            prompts.append(
                {
                    "product_id": pid,
                    "output": path,
                    "prompt": f"原创无品牌户外商品图：{filled['title']}。规格：{json.dumps(filled['specs'], ensure_ascii=False)}。中性浅色背景，柔和自然光，不增加未列出的配件，无文字、商标或水印。",
                }
            )
    write_json(DATA / "catalog.json", data)
    write_json(DATA / "evidence.json", frozen)
    write_json(DATA / "policies.json", policies())
    write_json(DATA / "image-prompts.json", prompts)
    write_json(
        DATA / "inventory.json",
        {
            "default_threshold": 8,
            "inventory": [
                {"product_id": product["product_id"], "stock": 4 if index % 11 == 0 else 36}
                for index, product in enumerate(data["products"])
                if product["in_stock"]
            ],
        },
    )
    print(
        f"Generated {len(data['products'])} outdoor products and {len(frozen) - len(data['products'])} variants in CNY."
    )


def check() -> None:
    # Use the application's actual loaders and Pydantic schemas.
    import sys

    sys.path.insert(0, str(ROOT / "examples"))
    from demo_common.storefront_fixtures import load_catalog

    raw, products, variants = load_catalog(DATA)
    if len(products) != 96 or set(p.category for p in products.values()) != set(CATEGORIES):
        raise ValueError("Outdoor catalog must contain 96 products across eight categories")
    legacy = json.loads((DATA / "legacy" / "catalog.json").read_text(encoding="utf-8"))
    if {p["product_id"] for p in legacy["products"]} & set(products):
        raise ValueError("Outdoor product ids must not replace legacy products")
    authored = [
        entry for family in raw["products"] for entry in (family, *family.get("variants", []))
    ]
    if len({p["product_id"] for p in authored}) != len(authored):
        raise ValueError("Duplicate product ids")
    frozen = json.loads((DATA / "evidence.json").read_text(encoding="utf-8"))
    if set(frozen) != set(products) | set(variants):
        raise ValueError("Evidence references do not match the catalog")
    missing = []
    for product in [*products.values(), *variants.values()]:
        if product.brand or product.currency != "CNY" or not product.product_id.startswith("OD-"):
            raise ValueError(f"Invalid outdoor product identity: {product.product_id}")
        if not product.long_description or len(product.specs) < 4:
            raise ValueError(f"Incomplete details: {product.product_id}")
        if not any("\u3400" <= char <= "\u9fff" for char in product.title):
            raise ValueError(f"Missing Chinese title: {product.product_id}")
        intel = frozen[product.product_id]["price_intelligence"]
        series = intel["series"]
        if (
            len(series) != 13
            or series[-1] != product.price
            or not all(math.isfinite(value) and value > 0 for value in series)
        ):
            raise ValueError(f"Invalid price evidence: {product.product_id}")
        if intel["low"] != min(series) or intel["high"] != max(series):
            raise ValueError(f"Invalid price range: {product.product_id}")
        reviews = frozen[product.product_id]["review_aspects"]
        if reviews["review_count"] != (product.review_count or 0) or any(
            not 0 <= aspect["positive_pct"] <= 100
            or not 0 <= aspect["mentions"] <= reviews["review_count"]
            for aspect in reviews["aspects"]
        ):
            raise ValueError(f"Invalid review evidence: {product.product_id}")
        if product.image_url and not (PUBLIC / product.image_url.lstrip("/")).is_file():
            raise ValueError(f"Broken image: {product.product_id}")
        if not product.image_url:
            missing.append(product.product_id)
        if product.variants:
            selections = {tuple(sorted(v.option_values.items())) for v in product.variants}
            if len(selections) != len(product.variants):
                raise ValueError(f"Duplicate variant options: {product.product_id}")
            available = [v for v in product.variants if v.in_stock]
            if product.price != min(v.price for v in available or product.variants):
                raise ValueError(f"Family price mismatch: {product.product_id}")
    print(
        f"Validated {len(products)} products and {len(variants)} variants; {len(missing)} products use category illustrations."
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    arguments = parser.parse_args()
    if arguments.check:
        check()
    else:
        prepare()
