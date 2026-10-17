# 体验站部署

`compose.yaml` 启动一个 Python API worker、Next.js 页面和 Caddy HTTPS 代理。API 的匿名凭证、对话和记忆保存在 `shopping_data` 持久卷的 `/var/lib/shopping-agent`；商品、库存、购物车和订单由 [commerce/](commerce/) 的订单服务管理。

在根目录 `.env` 填写模型凭证、模型 ID、域名及订单服务地址和令牌。执行 `bash scripts/deploy.sh`。脚本构建镜像，在不启动第二个 API worker 的条件下检查数据卷和订单服务，然后停止旧 API 并切换容器。

不要对体验站执行 `docker compose down -v`，该命令会删除本地身份、会话和记忆。备份应包含整个 `shopping_data` 卷。应用的文件锁禁止两个 API worker 同时写入同一数据目录；部署和运行均保持单 worker。

API 和 Web 端口只在容器网络中开放。`/api/health` 只检查进程配置；上线后还需实际验证匿名身份创建、聊天 SSE、记忆和重启后会话恢复。具体参数和验收步骤见 [部署说明](../docs/deployment.md)。
