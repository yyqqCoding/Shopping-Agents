#!/usr/bin/env bash
# Deploy the checked-out code using the existing root .env.
set -Eeuo pipefail

if [[ $# -ne 0 ]]; then
  echo "用法：bash scripts/deploy.sh"
  echo "先拉取代码，再运行此脚本。配置与迁移说明见 docs/deployment.md。"
  if [[ $# -eq 1 && ( $1 == --help || $1 == -h ) ]]; then
    exit 0
  fi
  exit 2
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."

stage="检查部署环境"
services_changed=0
on_exit() {
  local status=$?
  if [[ $status -eq 0 ]]; then
    return
  fi
  printf '\n部署在「%s」阶段停止，退出码：%s。\n' "$stage" "$status" >&2
  if [[ $services_changed -eq 0 ]]; then
    echo "尚未停止或替换现有服务。修复提示的问题后，重新运行本脚本。" >&2
  else
    echo "服务切换已开始，请查看容器状态和日志；脚本不会自动回滚。" >&2
    echo "docker compose --env-file .env -f deploy/compose.yaml ps -a" >&2
    echo "docker compose --env-file .env -f deploy/compose.yaml logs --tail=80 api web proxy" >&2
  fi
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for required_command in docker git flock; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "缺少命令：$required_command。请在已安装 Docker Compose 的 Linux 服务器运行。" >&2
    exit 1
  fi
done
if [[ ! -r .env ]]; then
  echo "缺少可读取的根目录 .env；请先复制已验证的配置，见 docs/deployment.md。" >&2
  exit 1
fi

# Keep simultaneous deploys from interleaving builds and replacing the same API.
exec 9>"$(git rev-parse --git-path shopping-deploy.lock)"
if ! flock -n 9; then
  echo "当前仓库已有部署脚本运行，请等待它完成。" >&2
  exit 1
fi

compose=(docker compose --env-file .env -f deploy/compose.yaml)
echo "[1/5] 检查 Docker 与部署配置"
docker compose version
docker info >/dev/null
# Never source .env or print the expanded configuration: it contains credentials.
"${compose[@]}" config --quiet

stage="构建 API 镜像"
echo "[2/5] 构建 API 镜像，现有服务继续运行"
"${compose[@]}" build api

stage="构建 Web 镜像"
echo "[3/5] 构建 Web 镜像，Node.js 构建堆上限为 768 MiB"
"${compose[@]}" build --build-arg BUILD_NODE_OPTIONS=--max-old-space-size=768 web

stage="检查 Supabase 配置与购物车迁移"
echo "[4/5] 只读检查数据库，不启动第二个 API 进程"
# Run only the checker, without API lifespan/recovery or dependent services.
"${compose[@]}" run --rm --no-deps -T --entrypoint python --workdir /app/examples api - \
  < deploy/check_database.py
# Fetch Caddy before stopping the API, only if its image is missing locally.
"${compose[@]}" pull --policy missing proxy

stage="切换服务与检查健康状态"
echo "[5/5] 停止旧 API，更新服务并等待 API 与 Web 就绪"
services_changed=1
"${compose[@]}" stop api
# Recreate the proxy too so a changed bind-mounted Caddyfile is loaded.
"${compose[@]}" up -d --no-build --force-recreate --scale api=1 --wait --wait-timeout 180
"${compose[@]}" ps

echo "部署完成，API 与 Web 健康检查已通过。请访问域名确认 HTTPS 和对话功能。"
