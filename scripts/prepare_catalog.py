"""Freeze fictional Chinese product content, evidence and image-generation requests.

Run after editing content-zh.json. This command does not call an image API. --check
validates the frozen catalog, variant references and existing image references.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "examples" / "assistant" / "data"
PUBLIC = ROOT / "examples" / "assistant" / "storefront-web" / "public"
BRANDS = dict(
    zip(
        [
            "Basecamp",
            "Beauty",
            "Daily",
            "Everyday",
            "Fit",
            "Glow",
            "Home",
            "Journey",
            "Kids",
            "Makers",
            "Pantry",
            "Paws",
            "Playroom",
            "Rest",
            "Select",
            "Signature",
            "Sleep",
            "Studio",
        ],
        [
            "营地",
            "美妍",
            "日护",
            "日常",
            "律动",
            "焕彩",
            "居家",
            "远行",
            "童居",
            "造物",
            "食光",
            "爪印",
            "童趣",
            "舒眠",
            "优选",
            "匠选",
            "安睡",
            "工作室",
        ],
        strict=True,
    )
)
CATEGORIES = {
    "home-kitchen": "家居厨房",
    "office-electronics": "办公数码",
    "outdoor-camping": "户外露营",
    "fitness": "运动健身",
    "toys-games": "玩具游戏",
    "pet-supplies": "宠物用品",
    "beauty-personal-care": "美妆个护",
    "travel": "旅行出行",
    "kids-room": "儿童房",
    "furniture-bedroom": "卧室家具",
    "grocery": "食品食材",
}
COLORS = {"matte black": "哑光黑", "stainless": "不锈钢本色", "dusk blue": "暮蓝色"}


def write_json(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


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
    count = product.get("review_count") or 0
    rating = product.get("rating") or 4.0
    aspects = (
        [
            {
                "name": name,
                "positive_pct": max(45, min(97, round(rating * 20 - i * 4))),
                "mentions": max(1, int(count * share)),
            }
            for i, (name, share) in enumerate(
                zip(["使用体验", "做工质感", "收纳维护"], [0.25, 0.16, 0.12], strict=True)
            )
        ]
        if count
        else []
    )
    return {
        "source": "离线生成的虚构展示数据",
        "price_intelligence": {
            "days": 90,
            "series": series,
            "low": low,
            "high": high,
            "position": position,
            "verdict": f"当前 US${price:.2f}，处于模拟价格走势的{label}",
        },
        "review_aspects": {"review_count": count, "aspects": aspects},
        "review_samples": product.get("review_highlights", []),
    }


def prepare() -> None:
    catalog = json.loads((DATA / "catalog.json").read_text(encoding="utf-8"))
    content = json.loads((DATA / "content-zh.json").read_text(encoding="utf-8"))
    frozen_evidence = {}
    prompts = []
    for product in catalog["products"]:
        pid = product["product_id"]
        title, description, dimensions, material, care, limits = content[pid]
        product.setdefault("search_terms", [product["title"], product.get("short_description", "")])
        product.setdefault("search_attributes", dict(product.get("attributes", {})))
        product["title"] = "ACME " + title
        line = product.get("brand", "ACME").removeprefix("ACME ")
        product["brand"] = "ACME " + BRANDS.get(line, line)
        product["short_description"] = description
        product["long_description"] = (
            f"{description}\n尺寸与规格：{dimensions}。主要材质或配方：{material}。日常维护：{care}。选择前请留意：{limits}。"
        )
        product["specs"] = {
            "尺寸与规格": dimensions,
            "材质或配方": material,
            "维护方式": care,
            "使用限制": limits,
        }
        if color := product.get("attributes", {}).get("color"):
            product["specs"]["颜色"] = COLORS.get(color, color)
        product["attributes"]["highlight_1"] = dimensions
        product["attributes"]["highlight_2"] = material
        product["attributes"]["category_label"] = CATEGORIES[product["category"]]
        # This listing has no stock-bearing size variants. Do not advertise five sizes
        # while all selections lead to the same purchasable id.
        if pid == "AR-1506":
            product["attributes"]["sizes"] = "M"
            product["search_attributes"]["sizes"] = "M"
        product["review_highlights"] = [
            f"模拟评价：{description.split('。')[0]}。",
            f"模拟评价：选择时需要留意，{limits}。",
            f"模拟评价：日常打理建议是{care}。",
        ]
        image_path = f"/products/generated/{pid}.webp"
        if (PUBLIC / image_path.lstrip("/")).is_file():
            product["image_url"] = image_path
        frozen_evidence[pid] = evidence(product)
        for variant in product.get("variants", []):
            merged = product | variant
            if pid == "AR-1606":
                variant_image = (
                    f"/products/generated/AR-1606-{variant['option_values']['color']}.webp"
                )
                if (PUBLIC / variant_image.lstrip("/")).is_file():
                    variant["image_url"] = variant_image
            frozen_evidence[variant["product_id"]] = evidence(merged)
        prompts.append(
            {
                "product_id": pid,
                "output": image_path,
                "mode": "generate",
                "prompt": (
                    "Use case: product-mockup. Create a studio catalog photograph of a fictional ACME product. "
                    f"Product: {title}. Accurate description: {description} Dimensions: {dimensions}. Materials: {material}. "
                    f"Color: {COLORS.get(product.get('attributes', {}).get('color', ''), 'neutral natural material colors')}. "
                    "Square composition, single complete item or specified set, warm off-white seamless background, "
                    "soft light from upper left, subtle grounded shadow, three-quarter view, realistic materials. "
                    "The product fills 75 percent of the frame with clear margins. No people, no unrelated props, "
                    "no added accessories, no captions, no watermark, no real brand logos. Keep all products original."
                ),
            }
        )
    for color, label in {
        "ivory": "象牙白",
        "slate": "岩灰色",
        "blush": "浅粉色",
        "sage": "鼠尾草绿",
    }.items():
        prompts.append(
            {
                "product_id": f"AR-1606-{color}",
                "mode": "edit",
                "reference": "/products/generated/AR-1606.webp",
                "output": f"/products/generated/AR-1606-{color}.webp",
                "prompt": f"Change only the silk pillowcase color to {label}. Preserve the exact product shape, fabric texture, lighting, camera, background and composition. No text or logos.",
            }
        )
    write_json(DATA / "catalog.json", catalog)
    write_json(DATA / "evidence.json", frozen_evidence)
    write_json(DATA / "image-prompts.json", prompts)


def check() -> None:
    # Use the application's actual loaders and Pydantic schemas.
    import sys

    sys.path.insert(0, str(ROOT / "examples"))
    from demo_common.storefront_fixtures import load_catalog

    raw, products, variants = load_catalog(DATA)
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
        f"Validated {len(products)} products and {len(variants)} variants; {len(missing)} image references remain unfilled."
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    arguments = parser.parse_args()
    if arguments.check:
        check()
    else:
        prepare()
