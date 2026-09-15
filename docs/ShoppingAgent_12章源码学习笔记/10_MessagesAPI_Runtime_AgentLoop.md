> 学习对象：Anthropic `commerce-agents` 仓库中的 `shopping-agent`  
> 基于：2026-09-04 阅读的 `main` 分支  
> 学习方式：源码定位 → 核心对象 → 调用链 → 具体例子 → 设计动机 → 可迁移经验  
>
> 仓库：<https://github.com/anthropics/commerce-agents>


# 第 10 章：Messages API Runtime——把前 9 章串成一个完整 Agent Loop

这一章是前面所有零件真正“活起来”的地方。

前面我们分别学了：

```text
Config / Types
Prompt / Context
Skills
Tools
Executor
Backend
Grounding / Gates
Memory
Presentation / Events
```

现在要回答：

> **用户发来一句话以后，`ShoppingAgent.stream_turn()` 到底按什么顺序把这些模块串起来？**

核心源码：

- `shopping-agent/runtime-messages-api/shopping_agent_runtime/orchestrator.py`  
  <https://github.com/anthropics/commerce-agents/blob/main/shopping-agent/runtime-messages-api/shopping_agent_runtime/orchestrator.py>
- `commerce-common/commerce_common/prompt_assembly.py`  
  <https://github.com/anthropics/commerce-agents/blob/main/commerce-common/commerce_common/prompt_assembly.py>
- `commerce-common/commerce_common/streaming.py`  
  <https://github.com/anthropics/commerce-agents/blob/main/commerce-common/commerce_common/streaming.py>

---

# 1. `stream_turn()` 的三个核心输入

调用形态：

```python
async for event in agent.stream_turn(
    messages,
    session,
    state,
):
    ...
```

三个参数一定要分清：

```text
messages
= Conversation History

session
= 当前用户与环境

state
= 当前 Session 的 Agent 执行状态
```

其中：

```text
messages
```

包括：

```text
User Message
Assistant Text
Assistant Tool Use
Tool Result
```

而：

```text
session
```

包括：

```text
user_id
session_id
page
timezone / now
```

`state` 最关键：

```text
seen_products
```

用于 Provenance。

---

# 2. 为什么 `ShoppingAgent` 自己不持有当前用户？

它没有：

```python
self.current_user
self.current_messages
self.current_state
```

而是 Host 每次把：

```text
messages
session
state
```

传进来。

所以部署结构是：

```text
                   ShoppingAgent
                        │
          ┌─────────────┼─────────────┐
          │             │             │
       User A         User B        User C
          │             │             │
      Session A     Session B      Session C
      State A       State B        State C
```

这使得一个共享 Agent Deployment 可以服务多个用户。

---

# 3. 一轮 `stream_turn()` 的全流程

先给完整图：

```text
User message
    │
    ▼
_prefetch()
    │
    ├── profile
    ├── account
    ├── cart
    └── tier-1 memory
    │
    ▼
build_dynamic_context()
    │
    ▼
build_system_blocks()
    │
    ▼
ShoppingToolExecutor
    │
    ▼
Grounding decision
    │
    ▼
┌───────────────────────────────┐
│      bounded agent loop       │
│                               │
│  Claude Stream                │
│       ↓                       │
│  text / tool_use / partial UI │
│       ↓                       │
│  eager tool dispatch          │
│       ↓                       │
│  ToolOutcome                  │
│       ↓                       │
│  append tool_result           │
│       ↓                       │
│  next Claude round            │
└───────────────────────────────┘
    │
    ▼
history compaction
    │
    ▼
turn_complete
    │
    ▼
update_memory()  ← 主 Turn 之后
```

---

# 4. 第一阶段：`_prefetch()`

每轮开始，Runtime 会并行获取环境数据。

概念上：

```python
preferences, account, cart, memory_facts = await asyncio.gather(
    backend.get_preferences(...),
    backend.get_account_context(...),
    backend.get_cart(...),
    memory.tier_one(...),
)
```

不是严格每项都无条件执行，而是受 Config Capability 控制。

例如：

```text
enable_cart = False
```

就没有 Cart Prefetch。

---

# 5. 为什么 Profile / Cart / Tier-1 Memory 要 Prefetch？

完全交给 Claude 也可以：

```text
User
↓
Claude
↓
get_preferences
get_cart
recall_memory
↓
Claude
```

但会多一轮甚至多轮。

这些信息：

```text
用户是谁
购物车现在怎样
最重要长期约束是什么
```

是高频 Ambient Context。

所以 Host 主动读。

这形成：

```text
Host-managed ambient reads
+
Agent-decided task reads
```

的混合架构。

---

# 6. Prefetch 为什么并发？

它们大多数没有依赖：

```text
Profile
Account
Cart
Memory
```

因此：

```text
串行：
A → B → C → D

不如：

A
B
C
D
并发
```

这是整个项目反复出现的原则：

```text
无依赖工作尽量同轮/并发
```

不仅 Prompt 教 Claude 这么做，Runtime 自己也这么做。

---

# 7. Dynamic Context 在 Turn 开头构造

Prefetch 结果进入：

```python
build_dynamic_context(...)
```

生成：

```text
# Session context

<storefront_data>
customer
account
saved_memory
cart
current_page
local_time
</storefront_data>
```

然后：

```python
build_system_blocks(
    self._static_system,
    dynamic_context
)
```

最终形成：

```text
System Block 1:
Static Prompt

System Block 2:
Current Session Context
```

---

# 8. 一个非常重要的细节：Dynamic Context 不是每个 Tool Round 都重建

假设本 Turn：

```text
Round 0
→ add_to_cart

Round 1
→ present_products
```

`add_to_cart` 后 Cart 已变化。

Host 会收到：

```text
cart_update
```

但 Runtime 不会每个 Round 都重新 Prefetch Cart，然后改变 System Prefix。

原因：

```text
Turn 内保持 Context Prefix 稳定
降低复杂度
有利于 Cache
```

真正下一 User Turn，再重新 Prefetch authoritative Cart。

---

# 9. 构造 `ShoppingToolExecutor`

随后 Runtime 创建当前 Turn 的执行器：

```python
executor = ShoppingToolExecutor(
    backend=...,
    config=...,
    skills=...,
    session=session,
    state=state,
    memory=...,
    ...
)
```

注意这里：

```text
Backend / Config / Skills
来自 Deployment

Session / State
来自当前用户
```

因此同一个 Tool：

```text
add_to_cart
```

执行时天然知道：

```text
这是哪个用户
这个 Session 见过哪些 Product
```

而不用让模型传 `user_id`。

---

# 10. Grounding 决定第一 Round 是否强制 Tool

Runtime 会取最新 User Text：

```text
latest_user_text
```

再跑：

```text
first_forced_tool(GROUNDING_RULES)
```

可能得到：

```text
search_policies
get_orders
get_product_details
None
```

例如：

```text
“我的包裹到哪了？”
```

第一 Round：

```text
tool_choice = get_orders
```

不是：

```text
auto
```

---

# 11. 三种 `tool_choice`

整个 Loop 中其实有三种模式：

```text
第一 Round + Grounding 命中
→ forced specific tool

普通 Round
→ auto

最后 Round
→ none
```

它们对应：

```text
Grounding correctness
Model autonomy
Runaway protection
```

---

# 12. Bounded Agent Loop

概念上：

```python
for round_index in range(max_tool_iterations + 1):
    ...
```

为什么是 bounded？

因为模型可能：

```text
Tool
→ Tool
→ Tool
→ Tool
→ 永不结束
```

所以最后一轮：

```text
force_text = True
tool_choice = none
```

让 Claude：

```text
停止继续工具调用
根据已有结果给出最终内容
```

这是生产 Agent 必须有的：

```text
Iteration Budget
```

---

# 13. 每 Round 的 Claude Request

大致：

```python
{
    "model": config.model,
    "max_tokens": config.max_tokens,

    "system": system_blocks,

    "tools": self._tools,

    "tool_choice": ...,

    "messages": request_messages,
}
```

而 `request_messages` 还会经过：

```text
rolling cache assembly
```

---

# 14. Rolling Conversation Cache

一个 Agent Turn 可能产生大量 Tool Result。

例如：

```text
Round 0:
search_products
→ 8 products

Round 1:
3 × get_product_details
→ 大量 specs

Round 2:
present comparison
```

如果每 Round 都重新完整读取前面所有结果：

```text
Token / latency 很贵
```

因此 `build_request_messages()` 会在已经稳定下来的对话内容上滚动 cache breakpoint。

目标：

```text
Previous Tool Results
→ cache read
```

---

# 15. Runtime 使用 Streaming API

不是：

```python
response = await client.messages.create(...)
```

然后等整个响应完成。

而是类似：

```python
async with client.messages.stream(...) as stream:
    ...
```

所以 Runtime 可以边生成边处理：

```text
text delta
Tool Use blocks
Partial Presentation
```

这就是第 9 章 Event Stream 真正从哪里来的。

---

# 16. `StreamedRound`

`StreamedRound` 负责把 Claude 的流式输出整理成：

```text
Assistant message content
Tool Use
UI partial
usage / stop reason
```

你可以理解为：

```text
Anthropic raw stream
↓
Commerce Agent round abstraction
```

---

# 17. `EagerDispatcher`

这是 Messages Runtime 很有价值的一点。

传统 Tool Loop：

```text
Claude 整轮输出结束
↓
拿到所有 Tool Calls
↓
开始执行
```

这里：

```text
Tool Call A 一生成完整
↓
立刻执行 A

与此同时：
Claude 还在继续生成 Tool B
```

也就是：

```text
Model Generation
与
Tool Execution
部分重叠
```

减少等待。

---

# 18. 同一 Round 的独立 Tool 可以并发

例如 Claude：

```text
search tent
search sleeping bag
search lantern
```

Runtime 不需要：

```text
一个结束后再执行另一个
```

可以并发。

这和前面 Skill / Prompt 一起形成闭环：

```text
Prompt:
教模型同轮发出

Runtime:
真正同轮并发执行
```

---

# 19. Tool 执行开始时就发 `tool_call` Event

前端不用等 Tool 结束。

可以立即显示：

```text
正在查找轻量两人帐篷…
```

Event：

```text
tool_call
```

包含：

```text
tool
id
input
label
```

---

# 20. ToolOutcome 回来以后发生什么？

对于每个 Tool：

```text
result_text
→ 变成 Claude 下一轮可读 Tool Result

events
→ 直接发 Host
```

例如：

```text
add_to_cart
```

ToolOutcome：

```text
result_text:
“Added product P001…”

events:
cart_update(full cart)
```

---

# 21. Messages API 的 Tool Result 结构

Claude Round 生成：

```text
Assistant:
tool_use(...)
```

Runtime 执行后，再追加：

```text
User:
tool_result(...)
```

然后调用下一 Round。

因此 Conversation History 中完整保存：

```text
User intent
Assistant tool_use
Tool result
Assistant reasoning / next tool
...
```

---

# 22. 为什么 Runtime 会原地更新 `messages`？

调用后：

```text
messages
```

已经包含本 Turn 新增的：

```text
Assistant ToolUse
Tool Results
Final Assistant Message
```

Host 直接持久化它。

不用自己重新拼。

---

# 23. 断流与 malformed Tool Use

生产 Streaming 必须考虑：

```text
Client disconnected
API stream error
工具 JSON 只生成一半
```

如果持久化：

```text
Assistant tool_use
```

却没有对应：

```text
tool_result
```

下次继续发 Messages API 时可能形成非法 Tool pairing。

所以 Runtime finally 会：

```text
close_open_tool_uses(...)
```

确保已写入 History 的 Tool Use 都有对应结果/错误。

---

# 24. Partial Presentation 输入坏了怎么办？

Presentation Tool 可能在流式生成：

```json
{
  "picks": [
    {
      "product_id": "P001"
```

这时可以尝试产生 `ui_partial`。

但如果最终 JSON 仍不合法：

```text
不能执行业务逻辑
```

Runtime 会给：

```text
Tool Error
```

让 Claude 后续修正，而不是把半截输入交 Backend。

---

# 25. Presentation Close

假设 Claude 最终：

```text
present_plan(...)
present_suggestions(...)
```

两个都成功。

如果：

```python
close_on_presentation=True
```

并满足 clean close 条件：

```text
Runtime 直接结束 Turn
```

不再：

```text
Claude Round N+1:
“以上就是我的方案。”
```

这可以省一次昂贵模型调用。

---

# 26. 哪些情况不能 Presentation Close？

例如：

```text
Tool Error
Gate Blocked
缺必要 UI
```

那模型可能还需要一轮：

```text
解释问题
修复调用
询问用户
```

所以不是 Presentation Tool 一出现就盲目结束。

---

# 27. Usage Aggregation

一整个 Turn 可能包含：

```text
Model Call 1
Model Call 2
Model Call 3
```

Runtime 会累计：

```text
input tokens
output tokens
cache read/write
```

最后通过：

```text
turn_complete
```

返回。

因此 Eval / Observability 可以直接统计：

```text
每 Turn 成本
平均 Tool Rounds
Latency
```

---

# 28. History Compaction

当 Context 过大：

```text
compact_history_above_tokens
```

触发。

它优先清理：

```text
旧 Tool Result
```

原因：

```text
Tool Result 往往最大
而且事实可以重新通过 Tool 获取
```

并把旧结果替换成类似：

```text
[result cleared; call tool again if needed]
```

---

# 29. 为什么不让 LLM 总结旧 Tool Result？

因为：

```text
商品价格
库存
订单状态
Policy
```

都是 authoritative facts。

让模型做 Summary：

```text
有失真风险
```

清掉：

```text
需要时重新查 Backend
```

反而更符合 Grounding 原则。

---

# 30. `turn_complete`

最终 Host 收到：

```text
stop_reason
usage
elapsed_ms
results_cleared
```

这构成一个清晰：

```text
Turn Boundary
```

Host 可以：

```text
保存 Conversation
记录 Trace
统计 Token
刷新 UI
```

---

# 31. Memory Extraction 为什么不塞进 `stream_turn()` 主循环？

推荐使用模式：

```python
async for event in agent.stream_turn(...):
    ...

await agent.update_memory(messages, session)
```

用户先拿到主答案。

然后 Memory Extraction：

```text
latest exchange
↓
transcript
↓
extract
↓
upsert facts
```

职责与 latency 都更合理。

---

# 32. 一次完整 planning 请求

用户：

```text
“两个人第一次露营，
总预算 $600，
帮我配基本装备。”
```

## Turn Start

并发 Prefetch：

```text
Profile
Cart
Memory
Account
```

## Round 0

Claude看到 Skill Index，发：

```text
load_skill(planning-goals)
search_products(tent)
search_products(sleeping)
search_products(cooking)
search_products(lighting)
```

## Executor

```text
Skill body
+
四组 Catalog Result
```

并行返回。

## Round 1

Claude按 SOP：

```text
必要时并行 get_product_details(...)
```

## Round 2

Claude：

```text
present_plan(...)
present_suggestions(...)
```

## Runtime

```text
UI Events
clean presentation close
```

## Turn End

```text
turn_complete
```

随后：

```text
update_memory()
```

---

# 33. 这就是 Agent Loop 的最小抽象

```python
context = prefetch()
executor = make_executor()

for round in bounded_loop:

    response = LLM(
        system=context,
        tools=tools,
        messages=history,
        tool_choice=...
    )

    stream(response)

    if no_tool_call:
        break

    results = await execute_tools(response.tool_calls)

    history += response
    history += results

    if should_close_after_presentation:
        break

compact_history()
emit_turn_complete()
```

---

# 34. 它和固定 Workflow 的区别

固定 Workflow：

```text
Search Node
↓
Details Node
↓
Answer Node
```

Shopping Runtime：

```text
Claude
↔
Tools
```

下一步由模型动态决定。

Skill：

```text
约束它怎么规划
```

Gate：

```text
约束它不能越界
```

因此属于：

```text
LLM-driven bounded loop
```

而不是固定 DAG。

---

# 35. 如果你用 LangGraph，可以如何对应？

最接近：

```text
Agent Node
   ↕
Tool Node
```

外围加入：

```text
Prefetch
Memory
Gate
Events
```

关键不是一定用哪个框架。

而是：

```text
Runtime Loop
和
Agent Core
分离
```

---

# 36. 本章最终调用链

```text
User
↓
Host
↓
stream_turn
↓
Prefetch
↓
Static + Dynamic Context
↓
Grounding
↓
Claude
↓
Tool Use
↓
Executor
↓
Gate
↓
Backend
↓
ToolOutcome
↓
Claude / Host Events
↓
更多 Round 或结束
↓
History Compact
↓
Turn Complete
↓
Memory Extraction
```

---

## 本章检查点

1. Prefetch 为什么不用 Claude 自己每轮决定？
2. Dynamic Context 为什么一个 Turn 只建一次？
3. forced / auto / none 三种 tool choice 分别解决什么？
4. Eager Tool Dispatch 为什么能降低延迟？
5. 为什么 Tool Use 与 Tool Result 必须配对？
6. 为什么 Compaction 更愿意清 Tool Result，而不是让模型总结事实？
7. `turn_complete` 对 Host 有什么价值？
8. Messages Runtime 中到底哪些事情属于 Runtime，哪些属于 Core？

学完这一章，`shopping-agent` 的主干已经基本吃透了。
