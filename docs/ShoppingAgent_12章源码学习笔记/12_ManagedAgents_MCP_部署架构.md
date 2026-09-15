> 学习对象：Anthropic `commerce-agents` 仓库中的 `shopping-agent`  
> 基于：2026-09-04 阅读的 `main` 分支  
> 学习方式：源码定位 → 核心对象 → 调用链 → 具体例子 → 设计动机 → 可迁移经验  
>
> 仓库：<https://github.com/anthropics/commerce-agents>


# 第 12 章：Managed Agents、MCP 与部署架构

最后一章回答几个最容易混淆的问题：

> **Commerce Agents 是不是 MCP？**  
> **Managed Agent 部署后 Tool 怎么调用？**  
> **MCP 与 StorefrontBackend 是什么关系？**  
> **为什么换成托管 Runtime 后 Provenance/Gate 仍然有效？**

核心资料：

- Repo README  
  <https://github.com/anthropics/commerce-agents>
- Managed Agents  
  <https://github.com/anthropics/commerce-agents/tree/main/shopping-agent/managed-agents>
- Safety  
  <https://github.com/anthropics/commerce-agents/blob/main/docs/safety.md>
- Backends  
  <https://github.com/anthropics/commerce-agents/blob/main/docs/backends.md>
- Deployment  
  <https://github.com/anthropics/commerce-agents/blob/main/docs/deployment.md>

---

# 1. 先纠正：Commerce Agents 本身不是 MCP

Repo 是：

```text
Agent Reference Implementation
```

它包含：

```text
Prompt
Skills
Tools
Executor
Backend Interface
Gates
Memory
Presentation
多个 Runtime
```

而 MCP 是：

```text
一种 Tool / Server Protocol
```

因此：

```text
Agent
≠
MCP
```

---

# 2. 三种运行路径

官方核心目标之一就是：

```text
同一个 Shopping Agent Definition
```

可以运行在：

```text
1. Messages API Runtime

2. Claude Agent SDK Runtime

3. Managed Agents
```

---

# 3. Managed 模式的总体结构

概念图：

```text
Your Web / App
      │
      ▼
Managed Agent Session
      │
      ▼
Claude
      │
      ├── Skills
      │
      └── MCP Tool Calls
              │
              ▼
Storefront MCP Server
              │
              ▼
ShoppingToolExecutor
              │
        ┌─────┴─────┐
        │           │
      Gates       Memory
        │
        ▼
StorefrontBackend
        │
        ▼
Business Systems
```

---

# 4. Managed Agent 为什么需要 MCP Server？

Messages API 中：

```text
Runtime 与 Executor
都在你自己的 Python 进程
```

Managed Agent 在托管运行环境中。

需要一种标准方式：

```text
远程调用你的业务 Tools
```

因此：

```text
Storefront MCP Server
```

成为 Tool Boundary。

---

# 5. MCP Server 并不是另写一套业务逻辑

非常关键。

MCP Tool 收到：

```text
search_products
add_to_cart
...
```

后面仍尽量走：

```text
ShoppingToolExecutor
```

所以：

```text
Provenance Gate
Options Gate
Cart Caps
Memory Validation
Presentation Enrichment
```

仍然在。

---

# 6. 为什么安全一定要写在 Core Executor / Gate？

现在原因最清楚。

如果 Provenance 只写在：

```text
Messages API stream_turn()
```

那么：

```text
Agent SDK
Managed MCP
```

可能绕过。

而它放在：

```text
ShoppingToolExecutor
→ gates.py
```

那么三条路径都复用。

原则：

```text
Critical safety
应该尽可能靠近 Action
而不是靠近某个 Runtime
```

---

# 7. MCP 与 Backend 不是一回事

两种常见结构。

## 结构 A：Managed Agent 使用本项目 Storefront MCP

```text
Managed Agent
↓
Storefront MCP Server
↓
Shopping Executor
↓
StorefrontBackend
↓
你的业务系统
```

---

## 结构 B：你的业务系统本身已有第三方 MCP

```text
Shopping Executor
↓
StorefrontBackend
↓
Server-side MCP Client
↓
Shopify / platform MCP
```

因此：

```text
MCP
= transport / tool protocol

StorefrontBackend
= shopping domain integration contract
```

---

# 8. 为什么不把底层 Shopify MCP 直接全部暴露给 Agent？

因为 Shopping Agent 需要自己的统一业务语义：

```text
Product / Variant
Cart
Order
Policy
Provenance
Caps
Presentation
```

如果直接给：

```text
Shopify 原生 50 个 Tool
```

Agent：

```text
强耦合平台
Tool Routing 更难
安全规则要重写
更换供应商困难
```

Backend Adapter 的意义就没了。

---

# 9. Identity 在 MCP 路径仍然不能让模型传

错误：

```text
Tool:
get_order(user_id=..., token=...)
```

正确：

```text
Managed Session
↓
可信 Principal
↓
MCP Server / Backend
```

Tool 参数只描述：

```text
业务动作
```

而不是：

```text
“我是谁”
```

身份必须从可信 Session / Credential Chain 来。

---

# 10. Service Authentication 与 User Identity 是两层

Managed Agent 调 MCP：

```text
谁有资格访问这个 MCP Server？
```

这是：

```text
service-to-service authentication
```

而具体调用代表：

```text
哪个 Customer？
```

这是：

```text
session principal
```

两者不要混。

也都不要让模型自由填写。

---

# 11. MCP Server 默认网络暴露要克制

Safety 文档强调参考 MCP server：

```text
默认应绑定 loopback / 受保护网络
```

除非前面明确有：

```text
Authenticated Gateway
```

原因：

```text
能操作 Cart / Account 的 Tool Server
绝对不能裸露公网
```

---

# 12. Least Privilege Tool Exposure

Managed Agent Manifest 不应该：

```text
允许所有 MCP Tool
```

而应该：

```text
只挂 Shopping Agent 真正需要的 Tool
```

例如当前部署：

```text
enable_orders=False
```

那 Managed Tool Surface 也应该对应变小。

这和前面 `absent_tools()` 是同一个原则：

```text
不存在的能力
根本不要暴露
```

---

# 13. Skills 在 Managed 模式中仍然是同一份业务 SOP

例如：

```text
planning-goals/SKILL.md
```

不因为托管部署就重新写。

Manifest / Runtime 负责把 Skills 挂载给 Agent。

这再次证明：

```text
Skill 是 Agent Definition
不是 Runtime Implementation
```

---

# 14. StorefrontBackend 仍然存在

Managed Agent 并没有把：

```text
Backend abstraction
```

取消。

MCP Server 的 Handler 仍然可以：

```text
ShoppingToolExecutor
↓
StorefrontBackend
```

后面：

```text
Java
REST
DB
another MCP
```

随你实现。

---

# 15. 部署到 Anthropic / Vertex / Bedrock 等模型环境

Messages Runtime 接受自定义 Client。

因此平台变化主要是：

```text
Client Construction
Model ID
Credential Chain
```

而不是修改：

```text
Skill
Gate
Backend
Tool Schema
```

这就是依赖注入。

---

# 16. 一个生产部署可以长这样

```text
Browser
↓
Your Frontend
↓
Authenticated App Backend
↓
Agent Session
│
├─ principal
├─ conversation id
└─ runtime state
↓
Agent Runtime
↓
Tool Boundary
↓
Shopping Executor / Gates
↓
Backend Adapter
↓
Internal APIs
↓
Database / ERP / Commerce Platform
```

旁边：

```text
Memory Store
Audit Logs
Tracing
Metrics
Secret Manager
```

---

# 17. Reference Repo 不等于完整生产系统

官方项目是：

```text
Reference Blueprint
```

真正上线还要补：

```text
Authentication
Authorization
Rate Limit
Audit
Secrets Management
DB Transactions
Retry / Idempotency
Observability
Compliance
Data Retention
Eval
Incident Handling
```

不要把：

```text
“Agent 有 Gate”
```

等同于：

```text
“生产安全全部完成”
```

---

# 18. 哪种 Runtime 适合什么？

## Messages API

适合：

```text
要完全掌控 Agent Loop
要高级 Streaming UI
要自定义 Cache / Trace
已有成熟 Web Backend
```

---

## Agent SDK

适合：

```text
希望少写 Loop
更快获得 Agent Runtime
CLI / developer agent 场景
```

---

## Managed Agent

适合：

```text
希望 Agent Runtime 托管
用标准 MCP 接业务
减少自己管理运行基础设施
```

---

# 19. 三者最大的共同点

```text
Prompt
Skills
Tool Contracts
Executor
Backend
Gates
Memory Primitives
```

尽可能不变。

所以 Repo 真正展示的不是：

```text
“如何写三个 Agent”
```

而是：

> **如何定义一个 Agent，然后把它部署在不同 Runtime。**

---

# 20. 12 章汇总架构

```text
                         USER
                          │
                          ▼
                     Host / App
                          │
          ┌───────────────┼────────────────┐
          │               │                │
    Messages API      Agent SDK        Managed
          │               │                │
          └───────────────┼────────────────┘
                          ▼
                 Shopping Agent Core
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
    Prompt              Skills             Tools
       │                  │                  │
       └──────────────────┼──────────────────┘
                          ▼
                       Executor
                          │
         ┌────────────────┼────────────────┐
         │                │                │
    Grounding          Gates            Fencing
         │                │                │
         └────────────────┼────────────────┘
                          ▼
                  StorefrontBackend
                          │
          ┌───────────────┼───────────────┐
          │               │               │
        REST             DB              MCP
          │               │               │
          └───────────────┼───────────────┘
                          ▼
                   Business Systems

同时：

MemoryStore
   ↕
MemoryRuntime

SessionState
   ↕
Provenance

Presentation
   ↓
AgentEvent
   ↓
Frontend UI
```

---

# 21. 学完 Shopping Agent 后，重新定义“一个 Agent”

一开始可能觉得：

```text
Agent = LLM + Tools
```

现在应该改成：

```text
Agent
=
LLM

+ Static Instructions
+ Dynamic Context

+ Skills
+ Tool Contracts

+ Runtime Loop
+ Session State

+ Backend Integration
+ Structured Memory

+ Grounding
+ Provenance
+ Gates
+ Fencing

+ Presentation
+ Event Protocol

+ Host Identity / Session Boundary
```

---

# 22. 最值得带走的 10 个设计

```text
1. Agent Definition / Runtime 分离

2. Static / Dynamic Context 分离

3. Skill Progressive Disclosure

4. Tool Contract / Backend 分离

5. Read-before-write Provenance

6. Deterministic Gates

7. Structured Long-term Memory

8. Canonical UI Enrichment

9. Bounded + Concurrent Agent Loop

10. Runtime-independent Core
```

---

# 23. 如果你接下来想真正“学会”，建议做三个实验

## 实验 A：Trace 一次请求

给 Runtime 加日志：

```text
User
→ Grounding
→ Claude Round
→ Tool Call
→ Executor
→ Gate
→ Backend
→ Tool Result
→ Next Round
```

不要只看最终页面。

---

## 实验 B：换一个最小 Backend

自己写：

```text
JSONCatalogBackend
```

实现：

```text
search_products
get_product_details
get_cart
add_to_cart
```

不改 Prompt/Skill。

你会真正理解：

```text
Backend Adapter
```

的价值。

---

## 实验 C：新增一个 Skill

比如：

```text
budget-optimizer
```

只写：

```text
SKILL.md
```

先不增加 Tool。

观察同一套 Search/Details/Presentation Tool 如何因为 SOP 不同而被重新组合。

---

# 24. 十二章路线回顾

```text
01 初始化 / Config / Types

02 Prompt / Context Engineering

03 Skills

04 Tool Contracts

05 Executor

06 Backend

07 Grounding / Gates / Provenance / Fencing

08 Memory

09 Presentation / Enrichment / Events

10 Messages API Runtime

11 Agent SDK Runtime

12 Managed Agents / MCP / Deployment
```

学完第 10 章：

```text
Shopping Agent 主体已经吃透
```

第 11、12 章帮助你理解：

```text
同一个 Agent Core
如何迁移到不同 Runtime / Deployment
```

---

## 最终自测

如果你能不用笔记回答这些问题，说明已经真正理解：

1. Config、Context、State、Memory 为什么不能合并？
2. Skill 为什么不是 Sub-Agent？
3. System Prompt、Tool Description、Skill、Gate 分别该放什么规则？
4. Tool Contract 为什么不能等同于 Backend Function？
5. 为什么写一个实体前必须先通过可信 Read 看见它？
6. Grounding 与 Provenance 有什么区别？
7. 为什么 Memory 不保存整段 Conversation？
8. Presentation 为什么需要 Server-side Enrichment？
9. ToolOutcome 为什么同时存在 Model Result 与 Host Event？
10. 为什么 Agent Loop 必须 bounded？
11. 为什么安全规则要下沉到 Executor / Gate？
12. 为什么换 Runtime 时不应该重写整个 Agent？

到这里，`shopping-agent` 的完整学习链路就闭环了。
