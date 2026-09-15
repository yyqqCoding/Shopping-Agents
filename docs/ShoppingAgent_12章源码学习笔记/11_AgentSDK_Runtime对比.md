> 学习对象：Anthropic `commerce-agents` 仓库中的 `shopping-agent`  
> 基于：2026-09-04 阅读的 `main` 分支  
> 学习方式：源码定位 → 核心对象 → 调用链 → 具体例子 → 设计动机 → 可迁移经验  
>
> 仓库：<https://github.com/anthropics/commerce-agents>


# 第 11 章：Claude Agent SDK Runtime——同一个 Shopping Agent，换一种运行时

前 10 章主要沿：

```text
runtime-messages-api
```

学习。

现在看：

```text
runtime-agent-sdk
```

这章最重要的不是重新学一套 Agent，而是理解：

> **Agent Definition 和 Agent Runtime 为什么可以分离。**

目录：

<https://github.com/anthropics/commerce-agents/tree/main/shopping-agent/runtime-agent-sdk>

---

# 1. 先给结论

Messages API Runtime：

```text
你自己维护 Agent Loop
```

Agent SDK Runtime：

```text
Claude Agent SDK 帮你维护 Agent Loop
```

但大量业务 Core 继续复用：

```text
ShoppingAgentConfig
Static Prompt
Skills
Tool Contracts
ShoppingToolExecutor
StorefrontBackend
Gates
Memory primitives
Presentation definitions
```

因此它不是“第二套 Shopping Agent”。

---

# 2. 两种 Runtime 的架构对比

## Messages API

```text
Your Runtime
│
├─ build request
├─ messages.stream
├─ parse tool calls
├─ dispatch tools
├─ append results
├─ loop
└─ events
```

## Agent SDK

```text
Claude Agent SDK
│
├─ agent loop
├─ model interaction
├─ Skill mechanism
├─ Tool invocation lifecycle
└─ session machinery
```

你的业务层：

```text
Tools
→ ShoppingToolExecutor
→ Backend
```

继续存在。

---

# 3. 核心入口

SDK 路径大致是：

```python
options, toolset = make_options(
    backend=backend,
    ...
)
```

然后：

```python
async with ClaudeSDKClient(options=options) as client:
    result = await run_turn(...)
```

返回的 Turn Result 包含：

```text
text
ui
tool_calls
```

具体以当前 README / runtime code 为准。

---

# 4. 为什么还要保留 `ShoppingToolExecutor`？

最重要的问题。

如果 Agent SDK 已经会 Tool Calling：

```text
是不是可以直接：
Claude SDK
→ Backend？
```

Repo 没这么做。

仍然：

```text
Claude Agent SDK
↓
Tool Adapter
↓
ShoppingToolExecutor
↓
Gates
↓
Backend
```

因为真正的安全与业务语义在：

```text
Executor / Gate
```

而不是 Messages API while-loop。

---

# 5. 这意味着切 Runtime 不会丢安全

例如：

```text
Provenance Gate
Options Gate
Quantity Cap
Memory Validation
Presentation Enrichment
```

仍然走同一个 Core。

所以：

```text
Messages API 安全
≠
靠 Messages API Runtime 安全
```

更重要的是：

```text
Core Action Boundary 安全
```

---

# 6. Skills 如何适配 Agent SDK？

Messages API：

```text
Static Prompt 中 Skill Index
↓
load_skill Tool
↓
SkillRegistry 返回 Body
```

Agent SDK 本身已经有 Skill 机制。

参考 Runtime 会把：

```text
shopping-agent/skills/*
```

暴露到 SDK 可识别的 Skill Surface。

于是 Claude 可以使用 SDK 的：

```text
Skill
```

而不是 Messages Runtime 自己的 `load_skill` 实现。

---

# 7. Skill 内容没有重写

这是关键。

```text
planning-goals/SKILL.md
```

还是同一个。

因此：

```text
业务 SOP
```

不依赖：

```text
Messages API
或
Agent SDK
```

这正是“Agent Definition 可移植”的价值。

---

# 8. Tool Contract 如何复用？

SDK adapter 会读取 Core Tool Registry。

业务 Tool：

```text
search_products
get_product_details
cart
orders
policies
memory
presentation
```

Schema / Description 尽量继续复用。

因此换 Runtime 时不用维护：

```text
一份 Messages Tool Schema
一份 SDK Tool Schema
```

避免两套行为漂移。

---

# 9. `StorefrontBackend` 完全不需要知道 Runtime

Backend 看不到：

```text
Messages API
Claude SDK
Managed Agent
```

它只收到：

```text
session
domain arguments
```

并返回：

```text
Product
Cart
Order
...
```

这就是 Backend Interface 真正解耦成功的证明。

---

# 10. SDK Runtime 与 Messages Runtime 并不完全一样

“共享 Core”不代表：

```text
所有 Runtime 行为字节级一致
```

主要有几类区别。

---

# 11. 区别一：谁维护 Agent Loop？

Messages：

```text
Commerce Repo 自己写 loop
```

所以可以精确控制：

```text
每 Round
每个 Tool Call
cache marker
stream event
最后一轮 tool_choice
```

SDK：

```text
Agent SDK 维护 loop
```

你让渡了一部分底层控制。

---

# 12. 区别二：Dynamic Session Context

Messages Runtime 有非常明确的：

```text
Static System Block
+
Dynamic Session Context Block
```

SDK 路径并没有完全相同的这套 Host-prefetched Block。

因此一些用户/Profile/Memory 信息会通过 Tool 方式暴露。

这也是 `registry.py` 里存在：

```text
INLINE_CONTEXT_DESCRIPTIONS
```

的原因之一。

---

# 13. `get_preferences` 在 SDK 路径意义更大

Messages Runtime：

```text
Profile 已经 Prefetch 到 Context
```

因此 `get_preferences` 可能很少需要。

SDK 路径：

```text
没有同样的 Prefetch Block
```

`get_preferences` 的描述会适配成：

```text
获取 Profile + saved preferences / remembered facts
```

从而让模型可以主动读。

---

# 14. 区别三：Grounding

Messages Runtime 可以直接：

```text
tool_choice = forced tool
```

SDK Runtime 对 Loop 的控制点不同。

因此某些 Grounding 会在 Host 侧：

```text
先执行对应 Read
→ 把结果注入本 Turn
```

或使用 SDK 能支持的对应机制。

但是最终：

```text
写操作 Gate
```

仍不会消失。

---

# 15. 区别四：UI 交付时机

Messages Runtime：

```text
text_delta
ui_partial
ui
tool_call
cart_update
```

可以非常实时。

Agent SDK 参考实现更偏：

```text
Turn 完成
↓
Result:
text
ui
tool_calls
```

因此如果你特别重视：

```text
高度自定义实时前端
```

Messages Runtime 更有优势。

---

# 16. 区别五：Turn Close

Messages Runtime：

```text
round_closes_turn()
```

自己判断 Presentation Tool 成功后是否直接结束。

SDK 路径则需要：

```text
SDK Hook / post-tool-batch mechanism
```

达到同样目标：

```text
不要为了 Closing Sentence 多跑一次模型
```

---

# 17. 区别六：Memory Lifecycle

Messages Runtime 有显式：

```python
await agent.update_memory(...)
```

参考 SDK Runtime 并不是简单自动复制同样生命周期。

因此使用 SDK 时：

```text
Host 仍要明确决定
何时 extraction
如何 persistence
```

这说明：

```text
Runtime 抽象可以复用很多 Core
但 Host Lifecycle 不一定完全相同
```

---

# 18. 区别七：Web Search

Messages Runtime：

```text
enable_web_search
→ Tool Registry / API Tool
```

SDK：

```text
依赖 SDK / CLI 的 Web Tool Surface
```

所以 Web 能力本身更 Runtime-specific。

---

# 19. Tool Allow-list

Agent SDK 运行时不能因为使用 Claude Code 风格 Runtime，就顺手开放：

```text
Shell
Filesystem
任意系统 Tool
```

Shopping Agent 应只允许：

```text
当前业务需要的 Tools
```

参考实现通过 permission / allowed-tools 思路限制。

这叫：

```text
Least Privilege
```

---

# 20. 防止外部 `CLAUDE.md` 污染

Agent SDK / Claude Code 环境可能自动读取：

```text
工作目录
上级目录
CLAUDE.md
```

如果一个部署环境恰好有额外 instruction：

```text
Shopping Agent 行为就可能被污染
```

参考 Runtime 会尽量隔离 working directory / instruction source。

这个细节非常值得学：

```text
Agent Prompt
不仅要防用户 Prompt Injection
也要防运行环境中的意外 Instruction Injection
```

---

# 21. Messages API 的优势

如果你需要：

```text
完全控制每 Round
自定义 Streaming UI
自己设计 Event Protocol
精确 Prompt Cache
Eager Dispatch
自定义 History Compaction
```

Messages Runtime 更合适。

---

# 22. Agent SDK 的优势

如果你更看重：

```text
少写 Agent Loop
快速拥有 Agent 能力
CLI / developer-agent 风格
让 SDK 处理复杂生命周期
```

Agent SDK 更合适。

---

# 23. 对你自己做 Agent 项目的启发

假设你用 LangGraph。

不要把所有业务代码直接写：

```python
def langgraph_node_1(...):
    ...
```

最好仍然分：

```text
Domain Types
Backend
Tool Contracts
Gates
Memory
Skills
```

LangGraph 只是：

```text
Runtime / Orchestrator
```

未来换：

```text
Claude Agent SDK
OpenAI Agents SDK
自写 Loop
```

核心不至于全部重做。

---

# 24. 一张对照表

| 维度 | Messages API | Agent SDK |
|---|---|---|
| Agent Loop | 自己控制 | SDK 控制 |
| Streaming UI | 最灵活 | 参考实现偏 Turn 结果 |
| Prompt Cache | 自己精确控制 | SDK/runtime 管理更多 |
| Skills | `load_skill` Tool | SDK Skill 机制 |
| Tool Executor | 复用 | 复用 |
| Backend | 复用 | 复用 |
| Gates | 复用 | 复用 |
| Session Context | Host Prefetch Block | 更多通过 Tool/SDK 环境 |
| 开发复杂度 | 高 | 更低 |
| 可控性 | 最高 | 更抽象 |

---

# 25. 本章真正要记住的一句话

```text
Runtime 可以换，
业务 Agent Definition 不应该跟着重写。
```

如果换一个 Runtime 就要重新写：

```text
Prompt
Tool Schema
Gate
Backend
Memory
Skill
```

说明原来的 Agent 架构耦合太重。

---

## 本章检查点

1. Agent SDK 到底替代了 Messages Runtime 的哪些工作？
2. 为什么 `ShoppingToolExecutor` 不能因为换 SDK 就删除？
3. 为什么 Skill 文件能直接复用？
4. SDK Runtime 为什么没有完全一样的 Dynamic Context Block？
5. 哪些能力是 Runtime-specific，哪些是 Core？
6. 为什么要防外部 `CLAUDE.md` 污染？
7. 如果你自己用 LangGraph，应该如何保持 Runtime 与 Domain 解耦？

下一章看最后一种路径：Managed Agents + MCP + 实际部署边界。
