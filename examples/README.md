# examples

`assistant/` 是中文户外装备 Agent 体验站。`/` 展示山野动画首页，点击进入 `/chat`。运行入口为 `python scripts/run_demo.py`，Supabase 与域名配置见 [部署说明](../docs/deployment.md#中文体验站)。

## Layout

| 路径 | 职责 |
|---|---|
| `demo_common/experience.py` | 匿名用户的对话归属、请求去重、提交后完成事件、历史读取和后台记忆任务 |
| `demo_common/supabase.py` | Supabase Auth 凭证验证和异步数据库 RPC；公开与服务端密钥分离 |
| `demo_common/persistence.py` | 对话快照、完整回合、购物车和带来源顺序的长期记忆存储 |
| `demo_common/host.py`、`sessions.py`、`storefront.py` | 共享宿主、记录类型、商品路由和来源校验；旧的本地宿主仅供隔离测试与本地集成 |
| `demo_common/memory.py`、`storefront_fixtures.py` | 记忆输入模型、旧夹具加载和商品、政策搜索 |
| `web-shared/identity.ts`、`api.ts`、`session.ts`、`turn.ts` | 浏览器身份恢复、多标签页协调、对话切换、请求恢复和最终卡片展示 |
| `web-shared/Conversations.tsx`、`storefront/` | 左侧历史导航、可折叠页面框架、移动端导航和购物车抽屉 |
| `assistant/api/`、`assistant/data/` | 96 款人民币户外商品、120 个尺码变体及旧目录只读兼容 |
| `assistant/storefront-web/` | Next.js 页面、商品卡片和静态图片 |
| `package.json` | `web-shared` 与 Web 应用共享的 npm workspace |

个人数据请求同时携带 Supabase `Authorization: Bearer ...` 和选择对话的 `X-Session-Id`。客户端不能指定自己的用户 ID。商品列表与详情是公开读取；访问其他用户的对话返回未找到。

新对话保留旧历史并共享该用户的长期记忆，购物车、来源记录和工作上下文分别保存。恢复历史读取已提交的展示片段，不运行模型或工具。API 使用一个 worker；进程内工具锁和启动中断恢复尚不支持多实例部署。

`AgentApi` 的 `outdoor-v1` 对话选择范围让户外入口首次进入时新建对话，保留原匿名身份和全部历史。后续访问恢复该范围中选中的对话；内部身份存储键保持兼容。人民币购物车要求执行 `002_outdoor_cart_currency.sql`，旧美元金额不换算。

## 配置

根目录 [.env.example](../.env.example) 列出模型、Supabase、上下文预算、记忆重试、频率与额度参数。服务端在启动时读取；`NEXT_PUBLIC_API_URL` 仅用于特定前端集成，默认空字符串表示同源请求。开发代理的 `API_INTERNAL_URL` 由启动脚本设置，不进入浏览器。

`DEMO_ALLOWED_HOSTS` 添加允许的域名。生产使用 `INFO` 日志；`DEBUG` 包含模型输入和响应，也包含用户资料。匿名身份恢复依赖 HTTPS 或 localhost 的 Web Locks；正常标签页共享身份，页面可以分别选择不同对话。

## 验证

依赖已安装时，在仓库根目录运行 `python scripts/verify_all.py`，检查 Python、商品数据、浏览器逻辑和 Web 生产构建。Node 测试使用 22.15+；单独运行：

```bash
cd examples
node --import ./web-shared/tests/register.mjs --test web-shared/tests/*.test.mjs
```

实际浏览器检查使用本地身份与 API 夹具，页面来自真实的 Next.js 生产构建。`browser-smoke.mjs` 保留旧首页和固定购物车布局的断言，本次按要求不修改测试；它不能作为户外页面的通过依据。手动检查页面可先在 `examples/assistant/storefront-web` 构建并启动：

```bash
node ../../node_modules/next/dist/bin/next build
node ../../node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 18004
```

检查 `/` 的进入链接、`/chat` 的侧栏折叠、手机历史导航、购物车抽屉、Escape 关闭、焦点返回、输入框与浮动按钮的位置，以及商品卡片的币种。真实偏好提取和数据库事务另行联调。连接线上同一 Supabase 项目的本地 API 必须在停止线上 API 后才启动。

数据库事务测试需要已执行迁移的独立 Supabase 测试项目及 `psql`。配置 `SHOPPING_TEST_DATABASE_URL` 后，在仓库根目录运行：

```bash
python -m pytest examples/demo_common/tests/test_database_integration.py -q
```

测试夹具回滚，但启动恢复覆盖整个测试库，必须使用独立项目。没有连接或 `psql` 时会跳过。覆盖内容见 [存储说明](../supabase/README.md#transaction-verification)，当前结果及部署缺口见 [验证记录](../docs/agent-experience-verification.md)。
