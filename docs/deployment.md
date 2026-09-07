# Deployment

## 中文体验站

户外体验站使用一个 HTTPS 域名承载页面和 `/api`。`/` 是山野动画首页，点击进入 `/chat`；聊天页使用左侧历史导航和右下角购物车抽屉。浏览器自动创建或恢复 Supabase 匿名身份；API 验证访问凭证后，按用户归属读写对话。没有登录页面，也不要求跨设备恢复。

侧栏底部的个人入口提供头像、昵称、使用说明和体验介绍。展示资料保存在当前浏览器，不需要新增 Supabase 表、迁移或环境变量；保存范围见 [侧栏个人入口](agent-experience-design.md#侧栏个人入口)。

本次部署从公开仓库 `https://github.com/yyqqCoding/Shopping-Agents.git` 的 `main` 分支获取代码，入口为 `https://jobb.lol`。服务器为 Ubuntu 22.04 x86_64，已有 Docker Compose；现有的 8090 服务使用独立端口，继续运行。

### Supabase

本地与服务器沿用同一个已验证的 Supabase 项目和模型配置。已有数据库迁移不重复执行；以下步骤用于首次接入项目。

1. 建立 Supabase 项目，在 Authentication 的 Sign In / Providers 中启用 Anonymous Sign-ins。将 Site URL 设置为体验站的 HTTPS 域名；本地开发可使用 `http://localhost:3004`。
2. 新项目依次执行 [001 存储迁移](../supabase/migrations/001_agent_experience.sql) 和 [002 购物车币种迁移](../supabase/migrations/002_outdoor_cart_currency.sql)，各执行一次。已有 `001` 的项目只执行 `002`，顺序见下文“户外版本升级”。迁移不清空对话或记忆，不导入 `demo-user` 偏好。
3. 在根目录 `.env` 填写 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`（或旧版 `SUPABASE_ANON_KEY`）和同项目的旧版 `SUPABASE_SERVICE_ROLE_KEY` JWT。服务端密钥只给 API，不能放入 `NEXT_PUBLIC_*` 或 Web 镜像。
4. 在 Authentication 的 Rate Limits 配置匿名注册频率。公开项目还应按容量设置网关流量限制。模型频率、并发与每日回合额度由 API 和数据库控制。

相关产品边界见 [匿名身份](https://supabase.com/docs/guides/auth/auth-anonymous) 和 [API keys](https://supabase.com/docs/guides/api/api-keys)。匿名身份凭证存于浏览器；清除本站数据后不承诺找回旧身份，服务端旧记录也不会被自动删除。

内部业务表启用 RLS，但没有浏览器读写策略。数据库函数只授予服务角色，且所有用户范围操作都检查 API 传入的已验证归属。迁移和接口说明见 [supabase](../supabase/)。

### 模型与进程

填写 [.env.example](../.env.example) 中的模型端点与凭证；`SHOPPING_MODEL` 和 `SHOPPING_MEMORY_MODEL` 都必须在该端点可调用。记忆模型同时处理长期偏好提取和长对话摘要，不能只检查聊天模型。

`SHOPPING_CONTEXT_WINDOW_TOKENS` 取聊天与摘要模型均支持的窗口。运行时按 UTF-8 字节保守估算文本输入，扣除输出和保留空间，在每次调用前检查预算。整理只改变工作上下文，已完成回合的原始消息和最终卡片保留。摘要失败时尝试仅缩小旧工具结果的请求副本；仍超限时返回中文错误。

默认每用户每分钟 12 轮、每天 100 轮，全站每天 1000 轮，同时运行 4 轮。每日额度按 UTC 记录于数据库，只计算新受理回合；重启不会重置额度。`SHOPPING_*` 参数可按展示容量调整。

后台记忆最多尝试 4 次，退避从 5 秒开始，上限 300 秒；下一轮最多等待 1.5 秒。任务领取有过期时间，未能保存处理结果的任务可重新领取。清空版本、事实来源顺序和删除标记在数据库事务中检查；旧提取和旧回合工具不能恢复被清空或覆盖的偏好。界面不显示这些状态。

### GitHub 首次部署

服务器从 GitHub 拉取已提交的源码。先确认本地新功能、迁移和 `deploy/` 配置已经推送到 `main`；本地未提交的文件不会出现在服务器上。在服务器运行：

```bash
git clone --branch main --single-branch https://github.com/yyqqCoding/Shopping-Agents.git /opt/shopping-agents
cd /opt/shopping-agents
```

将本地已验证的根目录 `.env` 单独通过 SSH 复制到服务器。下面命令在本地项目根目录的 PowerShell 执行：

```powershell
scp .env root@8.211.184.175:/opt/shopping-agents/.env
```

回到服务器，将文件权限设为 `600`，在现有内容中设置或更新以下两项：

```bash
cd /opt/shopping-agents
chmod 600 .env
nano .env
```

```dotenv
SHOPPING_DOMAIN=jobb.lol
SHOPPING_MAX_CONCURRENT_TURNS=1
```

模型与 Supabase 的值保持和本地一致；`.env` 不进入 GitHub。Linux 容器根据仓库文件安装本平台依赖，`node_modules`、`.next` 和虚拟环境均不上传。

沿用同一个 Supabase 项目时，先停止连接该项目的本地 API，再启动服务器 API。本地后端测试也要先停止线上 API；当前回合恢复机制要求每个项目同时只有一个本应用 API 实例。切换域名会改变浏览器存储来源，域名首次访问创建新的匿名身份，旧身份的记录仍留在数据库。

### HTTPS 与代理

[deploy](../deploy/) 提供 API、Web 和 Caddy 配置。域名在 Spaceship 注册，当前权威 DNS 由 Cloudflare 管理；在 Cloudflare 的该域名 DNS 页面配置：

| 类型 | 名称 | 内容 | 代理状态 |
|---|---|---|---|
| A | `@` | `8.211.184.175` | DNS only（灰色云朵） |

删除根域名指向旧网站的冲突 A、AAAA 或 CNAME 记录。当前只部署 `jobb.lol`，不用配置 `www`。云安全组允许入站 TCP 80、443；若 UFW 已启用，也允许这两个端口。Supabase Site URL 设置为 `https://jobb.lol`，匿名访问保持开启。

Caddy 管理 HTTPS，将 `/api/*` 直接转发给 API 并立即刷新 SSE 输出。API 和 Web 的内部端口不发布到公网。浏览器请求同源 `/api`，不能将生产的 `NEXT_PUBLIC_API_URL` 配为 localhost。

手动部署也必须运行一个 API worker，使用 Web 生产构建；代理关闭 SSE 缓冲和缓存，保留 Authorization、X-Session-Id 与 Host，流式读取超时需覆盖完整回合。`DEMO_ALLOWED_HOSTS` 设置域名。不要同时启动连接同一数据库的第二个 API 实例；工具锁与启动恢复依赖单实例边界。

### 一条命令部署

完成 `.env`、DNS 和首次数据库迁移后，在服务器仓库根目录运行：

```bash
bash scripts/deploy.sh
```

脚本沿用根目录 `.env`，不要求服务器另装 Python、Node.js 或数据库工具。它依次完成：

1. 检查 Docker、Compose 与配置；`config --quiet` 不输出环境中的密钥。同一工作副本不能同时运行两次部署脚本。
2. 顺序构建 API、Web 镜像，Web 构建使用 768 MiB 的 Node.js 堆上限。
3. 在临时容器中只读检查 Supabase 连接和购物车币种列，不返回用户行，不调用模型或启动第二个 API；本地没有 Caddy 镜像时先下载。
4. 停止旧 API，重建 API、Web、Caddy 容器并保持一个 API 实例。重新创建代理会加载最新的 `Caddyfile`，保留已有证书卷。
5. 等待 API 与 Web 健康检查通过，输出容器状态。切换期间聊天短暂不可用。

构建或部署前检查失败时，脚本不会停止旧服务。切换开始后失败会返回非零退出码并给出排查命令，不自动回滚。查看状态和日志：

```bash
docker compose --env-file .env -f deploy/compose.yaml ps -a
docker compose --env-file .env -f deploy/compose.yaml logs --tail=80 api web proxy
```

现有 Supabase API 密钥不能执行任意迁移 SQL，因此脚本只检查迁移，不自动执行。缺少 `002` 时按下文“户外版本升级”处理一次；以后普通代码更新直接运行脚本即可。

DNS 生效并开放端口后，Caddy 自动申请 HTTPS 证书。脚本的健康检查确认容器内 API 与页面可用；部署后访问 `https://jobb.lol/` 和 `https://jobb.lol/api/health`，再完成下文的聊天、记忆和恢复验收。

### 小内存服务器

Ubuntu x86_64 可使用现有 Docker Compose 配置。首次部署先用 `ss -lntp` 确认 80/443 可用，并用 `free -h`、`df -h /` 检查可用内存、交换空间和磁盘。构建阶段比日常运行更占内存；磁盘需能容纳镜像、依赖和构建缓存，首次部署建议至少预留 5 GiB 空间。

部署脚本已经采用顺序构建和 Web 构建堆限制。`BUILD_NODE_OPTIONS` 只限制构建时每个 Node.js 进程的 V8 老生代堆，不是整个构建的内存上限，也不改变运行容器的参数。已有交换空间可以缓冲峰值，构建可能较慢；若出现内存不足、进程被杀或严重交换，应转到内存更充足的 Linux 构建环境生成镜像，再通过 `docker save`、SSH 和 `docker load` 导入服务器，不重复挤占现有服务的内存。

`docker stats --no-stream` 可以查看运行时的容器占用。

### 更新部署

在本地完成代码修改和验证，提交并推送到 `main`。然后在服务器执行：

```bash
cd /opt/shopping-agents
git status --short
git pull --ff-only origin main && bash scripts/deploy.sh
```

服务器的代码改动应先处理清楚，再拉取更新；环境值保存在被 Git 忽略的 `.env` 中。`&&` 保证拉取失败时不会部署。脚本部署当前工作副本，不自行拉取或切换分支；已完成拉取时直接运行 `bash scripts/deploy.sh`。有新增数据库迁移时按对应版本步骤执行。

仅代码更新不会自动执行数据库迁移、删除对话或清空记忆。不重复执行已经完成的迁移。证书卷也保留，不使用 `down -v` 或数据库重置作为更新步骤。

### 户外版本升级

本版本自带 96 个户外主商品和 120 个尺码变体。商品、库存、模拟评价和政策从 Git 中的 JSON 加载，不需要在 Supabase 建商品表或再次生成数据。沿用现有模型、Supabase、域名及匿名访问配置。

从旧商品版本升级，在服务器拉取代码后运行部署脚本：

```bash
cd /opt/shopping-agents
bash scripts/deploy.sh
```

如果 `002` 已完成，脚本直接部署，无需额外操作。如果提示缺少购物车币种列，此时镜像已构建、旧服务仍在运行，先停止旧 API：

```bash
docker compose --env-file .env -f deploy/compose.yaml stop api
```

停止 API 后，在同一个 Supabase 项目的 SQL Editor 中打开并完整执行 [002_outdoor_cart_currency.sql](../supabase/migrations/002_outdoor_cart_currency.sql)，只执行一次。不要重新执行 `001`。SQL 成功后再回到服务器运行同一命令，构建可复用缓存：

```bash
bash scripts/deploy.sh
```

`002` 给已有购物车保留 USD 币种和原金额，新建购物车默认 CNY。非空购物车拒绝混合币种；移除全部旧商品后可添加人民币装备。旧商品不参与搜索，当前详情标记下架，购物车仍可查看与移除。完整历史、匿名用户、长期记忆和浏览器身份键保留；首次进入户外聊天会新建空对话，旧对话仍在左侧列表中。

没有执行 `002` 时，API 拒绝使用新版购物车，避免把人民币金额写进旧版美元结构。此时应检查迁移和 API 指向的 Supabase 项目，不通过清除浏览器数据或重建数据库处理。后续只更新代码时不再执行 `002`。

更新后访问 `https://jobb.lol/` 检查首页，进入 `/chat` 检查新商品价格为人民币，确认左侧旧历史仍可打开。已有美元购物车应仍显示原美元金额和下架提示。

### 保存与恢复

用户消息提交成功后才调用模型。完成事件在完整回合、卡片与工作快照提交后发送；保存失败时保留进程中的快照并后台重试，不重新调用模型或购物车。浏览器断开不取消服务端回合。浏览器重试沿用请求编号，重复请求读取原结果。

进程重启后，无法继续的回合标为中断，保留已提交的购物车动作，下一轮先读取当前购物车。重启前仍未提交的回复片段不能承诺恢复。数据库不可用时不切换成共享用户或虚构保存成功。

新对话不删除旧历史、购物车或记忆。旧的本地 `.memory-*.json` 保留但不导入匿名身份。不启用定时清理；数据删除与保留周期由项目明确配置，不使用数据库重置作为常规部署步骤。

### 部署验收

仓库离线验证范围见 [设计测试契约](agent-experience-design.md#测试契约)，当前结果和用户验收反馈见 [实现与验证](agent-experience-verification.md)。真实环境验收范围如下：

- 普通窗口刷新后恢复身份、对话和最终卡片；多个标签页共享身份但可选择不同对话。
- 首页点击进入聊天；桌面侧栏可折叠，手机历史与购物车弹窗可关闭，购物车按钮不遮住输入框。
- 侧栏个人菜单可打开三个入口；昵称与头像保存后刷新可恢复，修改资料不切换对话或匿名身份。
- 新商品与结算摘要使用 CNY；旧购物车金额及历史内容保持原样，下架商品可移除。
- 无痕窗口拥有独立数据，已知另一用户的对话 ID 也不能读取或修改。
- 表达稳定偏好后，在开发侧确认记忆任务完成，再新建对话验证推荐；不把当前预算或收礼对象当作长期偏好。
- 聊天与记忆模型均成功调用，SSE 持续输出；切断网络再恢复不重复写购物车。
- 重启 API 后历史与购物车可恢复，进行中的回合明确显示中断。

`/api/health` 只报告进程和配置状态，不能代替上述模型、数据库和域名验收。户外商品照片生成暂缓，当前使用原创分类插画；旧照片供历史查看。

## Model platforms

The code calls the Anthropic API by default. A deployment points the runtime at GCP
Vertex AI, AWS Bedrock, Microsoft Foundry, or an in-house gateway instead by changing
one place: the client the agent is constructed with.

## Support matrix

| Path | Anthropic API | GCP Vertex AI | AWS Bedrock | Microsoft Foundry | In-house gateway |
|---|---|---|---|---|---|
| Messages API runtime (`ShoppingAgent`) | Yes | Yes | Yes | Yes | Yes |

## Model ids

The model is a string in the config: `model` and `memory_model`. Nothing else reads the
string, so a platform move is a config change. Id grammar differs by platform; confirm
against your platform's catalog.

| Field | Repo default | Anthropic API, gateways | GCP Vertex AI | AWS Bedrock (Mantle) | AWS Bedrock (Invoke API) | Microsoft Foundry |
|---|---|---|---|---|---|---|
| `model` | `claude-sonnet-5` | `claude-sonnet-5` | `claude-sonnet-5` | `anthropic.<SERVED_MODEL>` | `<INFERENCE_PROFILE_ID>` | `claude-sonnet-5` |
| `memory_model` | `claude-haiku-4-5-20251001` | `claude-haiku-4-5-20251001` | `claude-haiku-4-5@20251001` | `anthropic.<SERVED_MODEL>` | `<INFERENCE_PROFILE_ID>` | `claude-haiku-4-5` |

- Vertex writes dated snapshots with `@`.
- Bedrock has two endpoints. Mantle speaks the Messages API and takes dateless
  `anthropic.` ids from its own lineup; the Invoke API takes inference-profile ids from your account's catalog
  (region-prefixed, dated, `-v1:0` suffixed).
- Foundry takes the name of a deployment in your resource; the values above are the
  defaults, which match the dateless first-party ids.
- Both model fields go through the same client, so both must exist on the platform it
  targets. The demo reads `SHOPPING_MODEL` and `SHOPPING_MEMORY_MODEL` from its `.env`
  for exactly this move.

## The `client` argument

`ShoppingAgent` takes an optional `client`. Without one it constructs `AsyncAnthropic`,
which reads `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, and `ANTHROPIC_BASE_URL` from
the environment; exporting them points the demo API at a gateway. With one, every call
uses it: the turn loop (`messages.stream`) and memory extraction (`messages.create`).
Any async client in the `anthropic` package fits. The parameter is annotated
`AsyncAnthropic`, so a type checker needs a `cast` for the platform classes.

```python
from pathlib import Path

from anthropic import (
    AsyncAnthropic,
    AsyncAnthropicBedrockMantle,
    AsyncAnthropicFoundry,
    AsyncAnthropicVertex,
)
from shopping_agent import ShoppingAgentConfig
from shopping_agent_runtime import ShoppingAgent

common = dict(backend=your_backend, skills_dir=Path("shopping-agent/skills"))

# GCP Vertex AI: pip install "anthropic[vertex]"; Application Default Credentials.
agent = ShoppingAgent(
    **common,
    config=ShoppingAgentConfig(memory_model="claude-haiku-4-5@20251001"),
    client=AsyncAnthropicVertex(project_id="your-project", region="global"),
)

# AWS Bedrock, Mantle endpoint: the standard AWS credential chain.
agent = ShoppingAgent(
    **common,
    config=ShoppingAgentConfig(
        model="anthropic.your-served-model", memory_model="anthropic.claude-haiku-4-5"
    ),
    client=AsyncAnthropicBedrockMantle(aws_region="us-east-1"),
)

# Microsoft Foundry: an Azure API key, or azure_ad_token_provider= for Entra ID.
agent = ShoppingAgent(
    **common,
    config=ShoppingAgentConfig(memory_model="claude-haiku-4-5"),
    client=AsyncAnthropicFoundry(resource="your-resource", api_key="your-azure-key"),
)

# In-house gateway: it must serve /v1/messages with SSE streaming.
agent = ShoppingAgent(
    **common,
    client=AsyncAnthropic(base_url="https://llm-gateway.internal.example", auth_token="your-token"),
)
```

The packages declare `anthropic>=0.91`, the release that adds `AsyncAnthropicBedrockMantle`,
the newest of the client classes above.

A gateway must speak the Anthropic Messages API: the SDK posts to
`{ANTHROPIC_BASE_URL}/v1/messages` with SSE streaming, so write the base URL without
`/v1`. An OpenAI-format endpoint (`/v1/chat/completions`) does not work; a multi-format
gateway must expose its Anthropic-compatible endpoint. `ANTHROPIC_AUTH_TOKEN` sends a
`Bearer` header and `ANTHROPIC_API_KEY` sends `x-api-key`; use whichever the gateway
expects, and leave the other blank.

## What the tests cover

No test holds cloud credentials, so no live platform conversation runs here; run one on
your platform before relying on it. To drive the agent with no credentials at all,
script the model with `commerce_common.testing.FakeClient`.
