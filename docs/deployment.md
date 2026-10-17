# 中文体验站部署

体验站在一个 HTTPS 域名下提供页面和 `/api`。Agent 服务器运行一个 Python API worker、Next.js 页面和 Caddy；订单服务器运行 Java 服务和 MySQL，保存商品、库存、购物车和订单。API 将匿名身份、对话与记忆保存在本地持久卷。浏览器失去本地访问凭证后无法恢复原匿名身份。

本次本地存储切换从空目录开始，不导入旧 Supabase 身份、对话或记忆，也不自动删除旧数据库。原始对话为 JSONL，会话笔记和长期记忆为 Markdown，机器状态为 JSON。布局、压缩和恢复规则见 [本地记忆设计](local-memory-design.md)。

## 本地运行

安装 Python 3.11+ 与 Node.js 22.15+。在仓库根目录运行 `bash scripts/install.sh`，复制 [.env.example](../.env.example) 为 `.env`，填写模型端点和凭证。设置 `CATALOG_BACKEND=json` 可使用内置商品夹具；此模式的购物车在进程内存中，重启后不保留。运行 `bash scripts/demo.sh` 后打开 `http://localhost:3004`。

`SHOPPING_DATA_DIR` 默认是仓库根目录下的 `.shopping-data`。同一目录只允许一个 API 进程写入；启动时获取独占锁。备份和恢复应覆盖整个目录。不要将目录放到网页静态资源路径，也不要提交到 Git。

## 模型与窗口

API 使用 Anthropic Messages API 协议。`ANTHROPIC_BASE_URL` 如需设置，应填写不带 `/v1` 的网关前缀；使用 `ANTHROPIC_API_KEY` 或 `ANTHROPIC_AUTH_TOKEN`。`SHOPPING_MODEL` 用于聊天、会话笔记、普通压缩及长期记忆分支。笔记与压缩优先继承主请求的模型、system、tools、thinking 和消息前缀，压缩失败时使用同一主模型的独立流式摘要。`SHOPPING_MEMORY_MODEL` 服务旧事实提取适配器。`SHOPPING_MEMORY_SELECTOR_MODEL` 指定独立的相关记忆选择模型，空值使用主模型。网关必须支持 `/v1/messages`、SSE 和选择器使用的 JSON-schema 输出；笔记与长期记忆分支使用普通响应。

`/memory` 提供主题 Markdown 与索引编辑、记忆模式、整理与审阅、任务取消和 Agent 快照。`SHOPPING_MEMORY_EXTRACT`、`SHOPPING_MEMORY_PREFETCH`、`SHOPPING_MEMORY_DREAM` 是新用户初始设置；用户修改后以本地 `settings.json` 为准。后台提取默认开启，自动预取默认关闭而使用索引模式，自动 Dream 默认开启并保留 24 小时及 5 个其他会话的门槛。日记模式按用户时区检查跨日整理，默认 `Asia/Shanghai`；这是对参考源码缺失调度的宿主接线。团队记忆不启用。具体流程见 [长期记忆设计](long-term-memory-design.md)。

`SHOPPING_CONTEXT_WINDOW_TOKENS` 必须对应实际服务模型的窗口。`SHOPPING_MODEL_MAX_OUTPUT_TOKENS` 是模型的输出能力，普通窗口的自动压缩阈值为窗口减 `min(输出能力, 20000)`，再减至少 13000 安全缓冲，与普通回复的 `max_tokens` 分离；小窗口使用受限预留以保持预算有效。默认 131072 窗口、20000 输出预留对应 98072 输入阈值。使用有效 usage 加新增消息估算，模型、系统、工具或前缀变化时失效；缺失 usage 使用保守估算。`SHOPPING_USAGE_INPUT_INCLUDES_CACHE=false` 遵循输入与缓存计数互斥的 API 语义，网关明确把缓存包含在 input 时才设为 true。

会话笔记默认首次 10000 tokens、增长 5000 tokens，并满足 3 次工具调用或无工具的自然停顿时触发；逐轮检查，后台每会话串行。`SHOPPING_SESSION_NOTE_*` 控制阈值和 10000-token／5 条文本消息／40000-token 的原文保留范围。未覆盖的新消息不会因 40000 上限被删除。普通摘要不再按固定最近四轮裁剪，`SHOPPING_CONTEXT_RECENT_TURNS` 仅保留兼容读取。笔记与摘要超时建议分别设置 `SHOPPING_SESSION_NOTE_TIMEOUT_S=120`、`SHOPPING_CONTEXT_SUMMARY_TIMEOUT_S=120`，已有 `.env` 的值不会自动更新。

时间触发的旧工具结果清理默认关闭；`SHOPPING_TIME_BASED_MICROCOMPACT=true` 开启后，默认间隔至少 60 分钟并保留最近 5 个结果。未验证的服务端缓存编辑请求不发送。原始 JSONL 不因压缩而删除；完整笔记可通过受控归档工具读取。配置与行为见 [本地记忆设计](local-memory-design.md)。

## 订单服务

生产部署使用 `CATALOG_BACKEND=java`、`COMMERCE_SERVICE_URL` 和 `COMMERCE_SERVICE_TOKEN`。在订单服务器复制 `deploy/commerce/.env.example` 为 `deploy/commerce/.env`，填写 MySQL 与服务令牌，然后运行 `bash scripts/deploy_commerce.sh`。脚本构建 Java 镜像、启动 MySQL、建表导入目录并等待服务健康；重复运行不会覆盖现有库存。`--reset-inventory` 会删除订单并恢复初始库存，只在明确需要重置时使用。Agent 服务器通过内网地址访问订单服务的 8080 端口，令牌需与订单服务器相同。数据设计见 [commerce-service-design.md](commerce-service-design.md)。`POST /api/orders` 由顾客点击结算卡片触发，模型本身不提交订单。

## 容器部署

将域名解析到 Agent 服务器并开放 TCP 80、443。在 Agent 服务器准备根目录 `.env`，填写 `SHOPPING_DOMAIN`、模型配置及订单服务内网地址和令牌，然后执行 `bash scripts/deploy.sh`。脚本先构建 API 和 Web 镜像，在临时容器里只读检查本地卷权限及订单服务，再停止旧 API 并切换容器，等待健康检查；Caddy 自动获取 HTTPS 证书。API 数据卷在 `deploy/compose.yaml` 中挂载为 `shopping_data:/var/lib/shopping-agent`。容器镜像只运行一个 API worker；不要扩容或滚动重叠启动同一卷上的 worker。

更新代码后重新运行脚本。不要使用 `docker compose down -v`，否则会删除持久卷。按卷整体备份，恢复时在 API 停止后还原目录和文件权限。`/api/health` 只报告进程配置，不能代替聊天、模型或订单服务验证。

## 上线验收

从新浏览器创建匿名身份和对话，发送一条消息确认 SSE 文本与 UI 事件持续到达。刷新页面后确认历史仍可读；重启 API 后确认同一身份能继续对话。验证不同浏览器的记录互不可读、相同请求 ID 可重放而不重复写入、记忆编辑和删除有效、订单服务的库存和购物车状态准确。长对话还应核对压缩后用户最新条件、会话笔记覆盖边界和回查工具结果。
