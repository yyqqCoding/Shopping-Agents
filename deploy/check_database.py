"""Read-only deployment preflight, run inside the API image without starting the app."""

from __future__ import annotations

import os
import sys

import httpx

from demo_common.supabase import SupabaseSettings


def fail(message: str) -> int:
    print(message, file=sys.stderr)
    return 1


def main() -> int:
    settings = SupabaseSettings.from_env()
    if not settings.configured:
        return fail(
            "Supabase 配置缺失或公开密钥类型错误。请检查 .env 中的 SUPABASE_URL、"
            "SUPABASE_PUBLISHABLE_KEY（或 SUPABASE_ANON_KEY）和 SUPABASE_SERVICE_ROLE_KEY。"
        )
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        return fail("缺少模型凭证。请在 .env 配置 ANTHROPIC_API_KEY 或 ANTHROPIC_AUTH_TOKEN。")

    try:
        with httpx.Client(timeout=15.0, follow_redirects=False) as client:
            response = client.get(
                f"{settings.url}/rest/v1/experience_carts",
                headers={
                    "apikey": settings.service_key,
                    "Authorization": f"Bearer {settings.service_key}",
                },
                # 002 applies atomically. Check its column without returning user rows.
                params={"select": "currency", "limit": "0"},
            )
    except (httpx.HTTPError, httpx.InvalidURL, ValueError):
        return fail("无法连接 Supabase。请检查服务器网络和 SUPABASE_URL，然后重试部署。")

    try:
        payload = response.json()
    except ValueError:
        payload = None
    if response.is_success:
        if payload != []:
            return fail("Supabase 返回了非预期结果；请检查连接的项目与 REST 接口。")
        print("Supabase 连接与购物车币种列检查通过。未读取用户记录或调用模型。")
        return 0

    # Report only known error codes/statuses, never remote bodies or credentials.
    code = payload.get("code") if isinstance(payload, dict) else None
    if code in {"42P01", "PGRST205"}:
        return fail(
            "缺少体验存储表。请先按 docs/deployment.md 完成 001、002 迁移；"
            "已有项目不要重复执行已完成的迁移。"
        )
    if code in {"42703", "PGRST204"}:
        return fail(
            "缺少购物车币种列，需要 supabase/migrations/002_outdoor_cart_currency.sql。\n"
            "镜像已构建；请按 docs/deployment.md 的「户外版本升级」停止旧 API，"
            "在 Supabase SQL Editor 完整执行 002 一次，然后重新运行 bash scripts/deploy.sh。"
        )
    if response.status_code in {401, 403}:
        return fail("Supabase 拒绝访问。请确认 .env 使用同项目的 service_role JWT 且迁移已授权。")
    return fail(f"Supabase 检查失败（HTTP {response.status_code}），请检查服务状态后重试。")


if __name__ == "__main__":
    sys.exit(main())
