"""Read-only deployment preflight, run inside the API image without starting the app.

It checks the Supabase credentials and schema the API needs and, when the catalog is
served by the commerce service, that the service answers with the shared token.
"""

from __future__ import annotations

import os
import sys

import httpx

from demo_common.supabase import SupabaseSettings


def fail(message: str) -> int:
    print(message, file=sys.stderr)
    return 1


def check_supabase(client: httpx.Client, settings: SupabaseSettings) -> str | None:
    try:
        response = client.get(
            f"{settings.url}/rest/v1/experience_conversations",
            headers={
                "apikey": settings.service_key,
                "Authorization": f"Bearer {settings.service_key}",
            },
            # Proves 001 is applied without returning user rows.
            params={"select": "id", "limit": "0"},
        )
    except (httpx.HTTPError, httpx.InvalidURL, ValueError):
        return "无法连接 Supabase。请检查服务器网络和 SUPABASE_URL，然后重试部署。"
    try:
        payload = response.json()
    except ValueError:
        payload = None
    if response.is_success:
        return (
            None if payload == [] else "Supabase 返回了非预期结果；请检查连接的项目与 REST 接口。"
        )
    # Report only known error codes/statuses, never remote bodies or credentials.
    code = payload.get("code") if isinstance(payload, dict) else None
    if code in {"42P01", "PGRST205"}:
        return "缺少体验存储表。请先按 docs/deployment.md 执行 001 迁移。"
    if response.status_code in {401, 403}:
        return "Supabase 拒绝访问。请确认 .env 使用同项目的 service_role JWT 且迁移已授权。"
    return f"Supabase 检查失败（HTTP {response.status_code}），请检查服务状态后重试。"


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
        return (
            "无法连接订单服务。请确认它已部署、COMMERCE_SERVICE_URL 使用内网地址，"
            "且订单服务器安全组放行本机内网 IP 的 8080 端口。"
        )
    if response.status_code == 401:
        return "订单服务拒绝了令牌。两台服务器的 COMMERCE_SERVICE_TOKEN 必须相同。"
    if not response.is_success:
        return f"订单服务检查失败（HTTP {response.status_code}），请查看其日志。"
    return None


def main() -> int:
    settings = SupabaseSettings.from_env()
    if not settings.configured:
        return fail(
            "Supabase 配置缺失或公开密钥类型错误。请检查 .env 中的 SUPABASE_URL、"
            "SUPABASE_PUBLISHABLE_KEY（或 SUPABASE_ANON_KEY）和 SUPABASE_SERVICE_ROLE_KEY。"
        )
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        return fail("缺少模型凭证。请在 .env 配置 ANTHROPIC_API_KEY 或 ANTHROPIC_AUTH_TOKEN。")
    with httpx.Client(timeout=15.0, follow_redirects=False) as client:
        if problem := check_supabase(client, settings):
            return fail(problem)
        backend = os.environ.get("CATALOG_BACKEND", "").strip().lower()
        if backend not in {"", "json", "java"}:
            return fail(f"CATALOG_BACKEND={backend} 已不再支持；请设为 java（订单服务）或 json。")
        uses_service = backend == "java" or (
            not backend and bool(os.environ.get("COMMERCE_SERVICE_URL"))
        )
        if uses_service and (problem := check_commerce(client)):
            return fail(problem)
    print("Supabase 与订单服务检查通过。未读取用户记录或调用模型。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
