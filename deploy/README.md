# 中文体验站部署

这组文件启动一个 API worker、Next.js 页面和 Caddy HTTPS 代理。用户数据保存在外部 Supabase 项目，商品数据与现有图片随镜像发布。

首次部署从 GitHub 克隆 `main`，将已验证的 `.env` 单独复制到服务器。后续在服务器运行 `git pull --ff-only origin main`，重新构建并启动容器。完整命令见 [GitHub 首次部署](../docs/deployment.md#github-首次部署) 和 [更新部署](../docs/deployment.md#更新部署)。

`api.Dockerfile` 使用仓库锁定的 Python 依赖。`web.Dockerfile` 从 npm workspace 构建独立运行目录。`Caddyfile` 将 `/api` 直接转发到 API，及时发送 SSE；其他请求转发到页面。浏览器不使用 localhost API 地址。

容器构建设置 `SHOPPING_STANDALONE=1`。本地 `run_demo.py --prod` 使用普通生产构建和 `next start`。

内存较少的服务器按 [顺序构建步骤](../docs/deployment.md#小内存服务器) 分别构建 API 和 Web。两个镜像构建成功后再替换运行容器。`web.Dockerfile` 的 `BUILD_NODE_OPTIONS` 只作用于 Web 构建，可设置 Node.js 堆上限；不改变运行容器的参数。

API 和 Web 端口只在容器网络中开放。Supabase 服务端密钥只传给 API。不要增加 API 副本或使用滚动重叠启动；启动恢复依赖单 worker 边界。

同一 Supabase 项目也不能同时供本地 API 和服务器 API 运行。沿用本地项目上线时，先停止本地 API；服务器上的其他 Agent 若使用独立存储和端口，可以继续运行。

更新保留数据库和证书卷。配置完成后，按部署说明验证匿名身份、两个模型、历史和服务重启后的恢复。
