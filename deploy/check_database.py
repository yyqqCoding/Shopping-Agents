"""Read-only preflight for local storage configuration and the commerce service."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import httpx


def fail(message: str) -> int:
    print(message, file=sys.stderr)
    return 1


def check_commerce(client: httpx.Client) -> str | None:
    base = os.environ.get("COMMERCE_SERVICE_URL", "").strip().rstrip("/")
    token = os.environ.get("COMMERCE_SERVICE_TOKEN", "").strip()
    if not base or not token:
        return "CATALOG_BACKEND=java 需要 COMMERCE_SERVICE_URL 和 COMMERCE_SERVICE_TOKEN。"
    try:
        response = client.get(
            f"{base}/internal/v1/catalog/products",
            headers={"Authorization": f"Bearer {token}"},
            params={"limit": "1"},
        )
    except (httpx.HTTPError, httpx.InvalidURL, ValueError):
        return "无法连接订单服务。请检查内网地址与令牌。"
    if response.status_code == 401:
        return "订单服务拒绝了令牌。两台服务器的 COMMERCE_SERVICE_TOKEN 必须相同。"
    if not response.is_success:
        return f"订单服务检查失败（HTTP {response.status_code}）。"
    return None


def main() -> int:
    directory = Path(os.environ.get("SHOPPING_DATA_DIR", "").strip() or ".shopping-data")
    if not directory.is_dir() or not os.access(directory, os.R_OK | os.W_OK):
        return fail("本地数据目录不可读写。请检查 SHOPPING_DATA_DIR 持久卷及 API 用户权限。")
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        return fail("缺少模型凭证。请在 .env 配置 ANTHROPIC_API_KEY 或 ANTHROPIC_AUTH_TOKEN。")
    backend = os.environ.get("CATALOG_BACKEND", "").strip().lower()
    if backend not in {"", "json", "java"}:
        return fail(f"CATALOG_BACKEND={backend} 已不再支持；请设为 java 或 json。")
    uses_service = backend == "java" or (
        not backend and bool(os.environ.get("COMMERCE_SERVICE_URL"))
    )
    if uses_service:
        with httpx.Client(timeout=15.0, follow_redirects=False) as client:
            if problem := check_commerce(client):
                return fail(problem)
    print("本地数据卷与订单服务检查通过。未读取用户记录或调用模型。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
