#!/usr/bin/env bash
# Build and start the commerce service and MySQL on the commerce server.
#   bash scripts/deploy_commerce.sh                    build, import, start
#   bash scripts/deploy_commerce.sh --reset-inventory  also delete every order and restore the authored stock
#   bash scripts/deploy_commerce.sh --test             run the MySQL test suite in throwaway containers
set -Eeuo pipefail

reset=false
test_only=false
for argument in "$@"; do
  case "$argument" in
    --reset-inventory) reset=true ;;
    --test) test_only=true ;;
    -h|--help)
      sed -n '2,5p' "$0"
      exit 0
      ;;
    *)
      echo "未知参数：$argument" >&2
      exit 2
      ;;
  esac
done

cd "$(dirname "${BASH_SOURCE[0]}")/.."

for required_command in docker git flock; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "缺少命令：$required_command。请在已安装 Docker Compose 的 Linux 服务器运行。" >&2
    exit 1
  fi
done
if [[ ! -r deploy/commerce/.env ]]; then
  echo "缺少 deploy/commerce/.env；请复制 deploy/commerce/.env.example 并填写。" >&2
  exit 1
fi

exec 9>"$(git rev-parse --git-path commerce-deploy.lock)"
if ! flock -n 9; then
  echo "当前仓库已有部署脚本运行，请等待它完成。" >&2
  exit 1
fi

compose=(docker compose --env-file deploy/commerce/.env -f deploy/commerce/compose.yaml)
"${compose[@]}" config --quiet

if [[ $test_only == true ]]; then
  echo "在临时 MySQL 上运行并发、回滚、幂等与分页测试"
  status=0
  "${compose[@]}" --profile test run --rm commerce-test || status=$?
  "${compose[@]}" --profile test rm -fsv mysql-test >/dev/null
  exit "$status"
fi

echo "[1/4] 构建订单服务镜像，现有服务继续运行"
"${compose[@]}" build commerce

echo "[2/4] 启动 MySQL"
"${compose[@]}" up -d --wait mysql

echo "[3/4] 建表并导入商品目录（已有库存不覆盖）"
import_args=(--spring.profiles.active=import)
if [[ $reset == true ]]; then
  echo "      --reset-inventory：删除全部订单并恢复初始库存"
  import_args+=(--commerce.import.reset-inventory=true)
fi
"${compose[@]}" run --rm --no-deps commerce "${import_args[@]}"

echo "[4/4] 启动订单服务并等待健康检查"
"${compose[@]}" up -d --no-build --wait --wait-timeout 180 commerce
"${compose[@]}" ps

echo "订单服务已就绪。在 Agent 服务器上执行："
echo "  curl -s http://<本机内网 IP>:8080/health"
