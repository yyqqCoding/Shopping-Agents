# Deployment

## 中文体验站

户外体验站使用一个 HTTPS 域名承载页面和 `/api`，部署在两台服务器上：Agent 服务器运行 Caddy、页面和 Python API；订单服务器运行 Java 订单服务和 MySQL，保存商品、库存、购物车和订单。`/` 是山野动画首页，点击进入 `/chat`；聊天页使用左侧历史导航和右下角购物车抽屉。浏览器自动创建或恢复 Supabase 匿名身份；API 验证访问凭证后，按用户归属读写对话。没有登录页面，也不要求跨设备恢复。

侧栏底部的个人入口提供头像、昵称、使用说明和体验介绍。展示资料保存在当前浏览器，不需要新增 Supabase 表、迁移或环境变量；保存范围见 [侧栏个人入口](agent-experience-design.md#侧栏个人入口)。

本次部署从公开仓库 `https://github.com/yyqqCoding/Shopping-Agents.git` 的 `main` 分支获取代码，入口为 `https://jobb.lol`。服务器为 Ubuntu 22.04 x86_64，已有 Docker Compose；现有的 8090 服务使用独立端口，继续运行。

### Supabase

本地与服务器沿用同一个已验证的 Supabase 项目和模型配置。已有数据库迁移不重复执行；以下步骤用于首次接入项目。

1. 建立 Supabase 项目，在 Authentication 的 Sign In / Providers 中启用 Anonymous Sign-ins。将 Site URL 设置为体验站的 HTTPS 域名；本地开发可使用 `http://localhost:3004`。
2. 新项目依次执行 [001 存储迁移](../supabase/migrations/001_agent_experience.sql) 和 [005 移除目录与购物车表](../supabase/migrations/005_drop_catalog_and_carts.sql)，各执行一次。已有项目按 [切换到订单服务](#切换到订单服务) 在切换完成后执行 `005`。迁移不清空对话或记忆，不导入 `demo-user` 偏好。
3. 在服务器仓库根目录 `.env` 填写 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`（或旧版 `SUPABASE_ANON_KEY`）和同项目的旧版 `SUPABASE_SERVICE_ROLE_KEY` JWT。服务端密钥只给 API，不能放入 `NEXT_PUBLIC_*` 或 Web 镜像。
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

服务器不需要本地 Python、Node.js、虚拟环境或本地导入。登录服务器后直接创建并编辑配置文件：

```bash
cd /opt/shopping-agents
chmod 600 .env
nano .env
```

```dotenv
SHOPPING_DOMAIN=jobb.lol
SHOPPING_MAX_CONCURRENT_TURNS=1
CATALOG_BACKEND=java
COMMERCE_SERVICE_URL=http://172.24.65.233:8080
COMMERCE_SERVICE_TOKEN=与订单服务器相同的令牌
SHOPPING_SEARCH_PAGE_SIZE=6
```

把模型和 Supabase 的值填入服务器 `.env`；`.env` 不进入 GitHub。Linux 容器根据仓库文件安装本平台依赖，`node_modules`、`.next` 和虚拟环境均不上传。

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

完成服务器 `.env`、DNS 和首次数据库迁移后，在服务器仓库根目录运行：

```bash
bash scripts/deploy.sh
```

脚本沿用根目录 `.env`，不要求服务器另装 Python、Node.js 或数据库工具。它依次完成：

1. 检查 Docker、Compose 与配置；`config --quiet` 不输出环境中的密钥。同一工作副本不能同时运行两次部署脚本。
2. 顺序构建 API、Web 镜像，Web 构建使用 768 MiB 的 Node.js 堆上限。
3. 在临时容器中只读检查 Supabase 连接与 001 迁移；`CATALOG_BACKEND=java` 时再用令牌访问订单服务。不返回用户行，不调用模型或启动第二个 API；本地没有 Caddy 镜像时先下载。
4. 停止旧 API，重建 API、Web、Caddy 容器并保持一个 API 实例。重新创建代理会加载最新的 `Caddyfile`，保留已有证书卷。
5. 等待 API 与 Web 健康检查通过，输出容器状态。切换期间聊天短暂不可用。

构建或部署前检查失败时，脚本不会停止旧服务。切换开始后失败会返回非零退出码并给出排查命令，不自动回滚。查看状态和日志：

```bash
docker compose --env-file .env -f deploy/compose.yaml ps -a
docker compose --env-file .env -f deploy/compose.yaml logs --tail=80 api web proxy
```

现有 Supabase API 密钥不能执行任意迁移 SQL，因此脚本只检查迁移，不自动执行。订单服务不可达时脚本在切换前停止，旧服务继续运行。

API 状态为 `Restarting` 时，`logs api` 末尾的回溯就是启动错误，常见原因是 `.env` 某个取值无效；各变量的允许值见 [.env.example](../.env.example) 的注释。改正后重新运行 `bash scripts/deploy.sh`。

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

### 订单服务

订单服务器单独部署 [commerce-service](../commerce-service/) 与 MySQL，设计见 [Java 订单服务设计](commerce-service-design.md)。两台服务器位于同一地域的不同 VPC，通过 VPC 对等连接走内网：

| | 内网 IP | VPC | 交换机网段 | 路由表新增条目 |
|---|---|---|---|---|
| Agent 服务器 | `172.30.61.56` | `vpc-6wetoh8qe5lyrfvtqzucc` | `172.30.48.0/20` | `172.24.64.0/20` → 对等连接 |
| 订单服务器 | `172.24.65.233` | `vpc-6wefrcwv0jj3amvxac9g5` | `172.24.64.0/20` | `172.30.48.0/20` → 对等连接 |

1. 在专有网络控制台创建两个 VPC 之间的对等连接，按上表给两侧路由表添加条目。
2. 订单服务器安全组入方向只放行 `172.30.61.56/32` 的 TCP 8080。MySQL 不发布端口。
3. 订单服务器安装 Docker Engine 与 Compose 插件，克隆仓库，复制 [deploy/commerce/.env.example](../deploy/commerce/.env.example) 为 `deploy/commerce/.env` 并填写密码与令牌（`openssl rand -hex 32`）。
4. 在订单服务器仓库根目录运行：

```bash
bash scripts/deploy_commerce.sh --test   # 临时 MySQL 上的并发、回滚、幂等与分页测试
bash scripts/deploy_commerce.sh          # 构建、建表、导入商品并启动
```

导入只更新商品内容，已有库存不覆盖。`bash scripts/deploy_commerce.sh --reset-inventory` 删除全部订单并恢复 `inventory.json` 的初始库存，用于库存售空后的演示恢复。服务的 Compose 网络固定为 `192.168.240.0/24`，不与 Agent 服务器的交换机网段重叠。

在 Agent 服务器执行 `curl -s http://172.24.65.233:8080/health`，返回 `{"ok":true}` 即内网可达。订单服务的 DEBUG 日志按对话 ID 记录每条 SQL 及参数：

```bash
docker compose --env-file deploy/commerce/.env -f deploy/commerce/compose.yaml logs --tail=200 commerce
```

### 切换到订单服务

已运行的站点按以下顺序切换；订单服务就绪之前，Agent 继续使用原配置运行。

1. 按上节部署订单服务并通过测试与内网检查。
2. Agent 服务器拉取代码，在 `.env` 设置 `CATALOG_BACKEND=java`、`COMMERCE_SERVICE_URL` 与 `COMMERCE_SERVICE_TOKEN`，运行 `bash scripts/deploy.sh`。完成后 `https://jobb.lol/api/health` 返回 `"catalog_backend":"java"`，`https://jobb.lol/api/products?limit=1` 返回订单服务中的商品。
3. 部署成功后，在 Supabase SQL Editor 完整执行一次 [005_drop_catalog_and_carts.sql](../supabase/migrations/005_drop_catalog_and_carts.sql)。它删除 `catalog_*` 表与函数和对话购物车表，旧购物车数据不迁移；对话、回合与记忆保留。

切换后访问 `/equipment` 检查价格与库存，在对话中完成搜索、加购、结算，点击结算卡片的“提交订单”，再在订单服务器确认库存减少、订单写入。

### 保存与恢复

用户消息提交成功后才调用模型。完成事件在完整回合、卡片与工作快照提交后发送；保存失败时保留进程中的快照并后台重试，不重新调用模型或购物车。浏览器断开不取消服务端回合。浏览器重试沿用请求编号，重复请求读取原结果。

进程重启后，无法继续的回合标为中断，保留订单服务已提交的购物车动作，下一轮先读取当前购物车。重启前仍未提交的回复片段不能承诺恢复。数据库不可用时不切换成共享用户或虚构保存成功。

新对话不删除旧历史、购物车或记忆。旧的本地 `.memory-*.json` 保留但不导入匿名身份。不启用定时清理；数据删除与保留周期由项目明确配置，不使用数据库重置作为常规部署步骤。

### 部署验收

仓库离线验证范围见 [设计测试契约](agent-experience-design.md#测试契约)，当前结果和用户验收反馈见 [实现与验证](agent-experience-verification.md)。真实环境验收范围如下：

- 普通窗口刷新后恢复身份、对话和最终卡片；多个标签页共享身份但可选择不同对话。
- 首页点击进入聊天；桌面侧栏可折叠，手机历史与购物车弹窗可关闭，购物车按钮不遮住输入框。
- 侧栏个人菜单可打开三个入口；昵称与头像保存后刷新可恢复，修改资料不切换对话或匿名身份。
- 商品、购物车与结算摘要使用 CNY；装备页显示订单服务的实时库存，下架商品只能查看和从购物车移除。
- 结算卡片提交后订单写入 MySQL、库存按数量减少、购物车清空，下一轮助手知道订单号；库存不足或购物车已变化时整单不提交并显示原因。
- 无痕窗口拥有独立数据，已知另一用户的对话 ID 也不能读取或修改。
- 表达稳定偏好后，在开发侧确认记忆任务完成，再新建对话验证推荐；不把当前预算或收礼对象当作长期偏好。
- 聊天与记忆模型均成功调用，SSE 持续输出；切断网络再恢复不重复写购物车。
- 重启 API 后历史与购物车可恢复，进行中的回合明确显示中断；订单服务重启后购物车与订单不丢失。

`/api/health` 只报告进程和配置状态（商店名、`catalog_backend`、技能），不调用 Supabase 或订单服务，不能代替上述模型、数据库和域名验收。

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
