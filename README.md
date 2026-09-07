# Shopping Agents

基于 Messages API 的购物 Agent，提供商品检索、参数比较、装备搭配、购物车和长期偏好记忆。项目包含可复用的 Agent 核心，以及中文「户外装备助手」体验站。

体验站包含滚动首页、装备目录、商品详情和聊天工作区，使用 96 款原创无品牌商品及 120 个尺码变体，配有生成图片。商品与参数均为虚构体验数据，结算不创建订单、不扣款。

## 本地运行

需要 Python 3.11+、Node.js 22.15+，以及模型服务与 Supabase 配置。在仓库根目录执行（Linux / macOS）：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
npm ci --prefix examples
```

按 [.env.example](.env.example) 填写模型和 Supabase 参数。首次配置需启用 Supabase 匿名登录，并依次执行 [001](supabase/migrations/001_agent_experience.sql) 和 [002](supabase/migrations/002_outdoor_cart_currency.sql) 迁移；已执行的迁移无需重复。具体步骤见 [部署说明](docs/deployment.md#中文体验站)。

```bash
python scripts/run_demo.py --no-install
```

打开 [localhost:3004](http://localhost:3004)，API 使用端口 `8004`。页面入口：

- `/`：滚动首页与出行场景。
- `/equipment`：装备目录；`/equipment/[id]`：商品详情。
- `/chat`：选品对话、历史记录和购物车。

公开商品可直接浏览。聊天使用匿名身份，无需登录页面；同一访问者共享长期偏好，各对话分别保存历史和购物车。

## 服务器部署

服务器需要 Docker Compose、根目录 `.env` 和已完成迁移的数据库。首次部署见 [服务器配置](docs/deployment.md#github-首次部署)。更新时在仓库根目录执行：

```bash
git pull --ff-only origin main
bash scripts/deploy.sh
```

部署脚本构建镜像并替换服务，页面与 `/api` 共用 HTTPS 域名。项目不使用 GitHub Actions 流水线。

## 代码与接口

| 路径 | 职责 |
|---|---|
| [commerce-common/](commerce-common/) | 配置、上下文、记忆、事件与展示基础能力 |
| [shopping-agent/core/](shopping-agent/core/) | Agent 类型、提示词、工具、安全门与 `StorefrontBackend` 接口 |
| [shopping-agent/runtime-messages-api/](shopping-agent/runtime-messages-api/) | `ShoppingAgent` 与 Messages API 会话循环 |
| [shopping-agent/skills/](shopping-agent/skills/) | 选品、比较、搭配等流程技能 |
| [examples/assistant/](examples/assistant/) | 户外体验站 API、商品数据与 Next.js 前端 |
| [examples/demo_common/](examples/demo_common/) · [examples/web-shared/](examples/web-shared/) | 共享身份、持久化与前端组件 |
| [deploy/](deploy/) · [supabase/](supabase/) | 容器、HTTPS 代理与数据库迁移 |

接入自己的商品与业务系统时，实现 [StorefrontBackend](shopping-agent/core/shopping_agent/backend.py)，通过 `ShoppingAgent` 运行会话；流程扩展使用 `SKILL.md`，领域界面使用 `PresentationExtension`。

详细说明：[后端接入](docs/backends.md) · [安全机制](docs/safety.md) · [体验站](examples/assistant/README.md) · [界面设计](examples/assistant/storefront-web/DESIGN.md)。可选本地验证命令见 [examples](examples/README.md#验证)。

## 许可

Copyright 2026 Anthropic PBC. [Apache License 2.0](LICENSE)。图片、字体及第三方技能的许可说明保留在各自目录。
