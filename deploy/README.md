# 中文体验站部署

这组文件启动一个 API worker、Next.js 页面和 Caddy HTTPS 代理。身份、对话和记忆保存在外部 Supabase 项目；商品、库存、购物车和订单由另一台服务器上的订单服务提供，其容器定义在 [commerce/](commerce/)，由 `scripts/deploy_commerce.sh` 部署。

首次部署从 GitHub 克隆 `main`，将已验证的 `.env` 单独复制到服务器并完成数据库迁移。之后在仓库根目录运行：

```bash
git pull --ff-only origin main && bash scripts/deploy.sh
```

`scripts/deploy.sh` 校验配置、顺序构建 API 和 Web、检查 Supabase 与订单服务，再停止旧 API 并重建三个容器，等待 API 和 Web 健康检查通过。脚本使用原有 `.env`，不需要服务器安装 Python 或 Node.js。同一工作副本中的脚本运行由文件锁串行化；切换期间聊天短暂不可用。

`check_database.py` 在临时 API 容器中使用现有服务端配置，只确认 001 迁移已执行、`CATALOG_BACKEND=java` 时订单服务接受令牌，不返回用户行、不运行 API 启动恢复。检查失败会在停止旧服务前退出；Supabase API 密钥不能执行任意 SQL，迁移按 [切换到订单服务](../docs/deployment.md#切换到订单服务) 在 SQL Editor 中执行一次。

`commerce/compose.yaml` 运行 MySQL 8.4 与订单服务：MySQL 不发布端口，订单服务只绑定内网地址；`test` profile 在内存中的临时 MySQL 上运行 Java 测试。`commerce.Dockerfile` 在镜像内用 Maven 构建，运行时使用 JRE 17 与较小的堆；`mysql.cnf` 按 2 GB 服务器设置缓冲池和锁等待时间。

完整配置见 [GitHub 首次部署](../docs/deployment.md#github-首次部署)、[一条命令部署](../docs/deployment.md#一条命令部署) 和 [更新部署](../docs/deployment.md#更新部署)。

`api.Dockerfile` 使用仓库锁定的 Python 依赖。`web.Dockerfile` 从 npm workspace 构建独立运行目录。`Caddyfile` 将 `/api` 直接转发到 API，及时发送 SSE；其他请求转发到页面。浏览器不使用 localhost API 地址。

容器构建设置 `SHOPPING_STANDALONE=1`。本地 `run_demo.py --prod` 使用普通生产构建和 `next start`。

部署脚本按 [小内存服务器](../docs/deployment.md#小内存服务器) 的限制分别构建 API 和 Web，并将 Web 构建堆设为 768 MiB。两个镜像构建成功且检查通过后再替换运行容器。`web.Dockerfile` 的 `BUILD_NODE_OPTIONS` 只作用于 Web 构建，不改变运行容器的参数。

API 和 Web 端口只在容器网络中开放。Supabase 服务端密钥只传给 API。不要增加 API 副本或使用滚动重叠启动；启动恢复依赖单 worker 边界。

同一 Supabase 项目也不能同时供本地 API 和服务器 API 运行。沿用本地项目上线时，先停止本地 API；服务器上的其他 Agent 若使用独立存储和端口，可以继续运行。

更新保留数据库和证书卷。构建或迁移检查失败时旧服务继续运行；开始切换后如果启动失败，脚本报告失败并给出日志命令，不自动回滚。容器健康检查不能代替 HTTPS、匿名身份、两个模型、历史和重启恢复的验收。
