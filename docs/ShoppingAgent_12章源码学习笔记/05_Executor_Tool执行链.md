> 学习对象：Anthropic `commerce-agents` / `shopping-agent`  
> 基于：2026-09-04 阅读的 `main` 分支  
> 学习模式：源码定位 → 核心对象 → 调用链 → 具体例子 → 为什么这样设计 → 可迁移经验  
> 仓库：https://github.com/anthropics/commerce-agents


# 第 5 章：Executor——Tool Call 如何真正变成代码执行

核心链路：

```text
Claude tool_use
↓
BaseToolExecutor
↓
ShoppingToolExecutor
↓
Validation / Gate
↓
StorefrontBackend
↓
ToolOutcome
↓
Claude + Host Events
```

源码：
- https://github.com/anthropics/commerce-agents/blob/main/commerce-common/commerce_common/execution.py
- https://github.com/anthropics/commerce-agents/blob/main/shopping-agent/core/shopping_agent/executor.py

---

# 1. 为什么需要 Executor？

Demo 很容易写成：

```python
if tool_name == "search_products":
    ...
elif tool_name == "add_to_cart":
    ...
```

Tool 一多就会：

```text
巨大 if/else
错误处理不一致
Memory/Skill/UI 特殊逻辑到处散
安全逻辑重复
```

所以项目设计：

```text
BaseToolExecutor
+
ShoppingToolExecutor
```

---

# 2. BaseToolExecutor 管公共执行框架

它负责：

```text
dispatch
failure ladder
Skill loading
Presentation
Memory
Delegate
status
```

Role Executor 只负责：

```text
有哪些业务 handler
业务 Tool 怎么映射 Backend
领域错误怎么解释
```

这就是：

```text
Framework + Role Extension
```

---

# 3. `execute()` 的重要承诺

设计目标：

```text
Tool Failure 不应该让整个 Turn 崩掉
```

所以 `execute()` 会把异常转换成：

```text
ToolOutcome.error(...)
```

而不是直接把 Exception 抛出到主 Agent Loop。

这样模型可以在工具失败后继续：

```text
换一个 Search
换一个候选
告诉用户系统当前不可用
```

---

# 4. Failure Ladder

大致：

```python
try:
    return await dispatch(...)
except InvalidArguments:
    return ToolOutcome.error(...)
except Exception as error:
    if domain_error(error):
        return mapped_outcome
    return unavailable
```

语义：

```text
模型参数错
→ 告诉模型哪里错，可以重试

业务领域错误
→ 转成业务可理解结果

未知异常
→ 安全的 unavailable 文本
```

内部堆栈留 Server Log，不泄露给模型。

---

# 5. JSON Schema 后还要 Pydantic

`parse_argument()`：

```text
model.model_validate(value)
```

原因：

```text
Schema = 模型生成边界
Pydantic = 服务端真实执行边界
```

绝不能把 Backend 安全建立在“模型会遵守 Schema”。

---

# 6. `clamp_limit()`

模型：

```text
limit = 999
```

执行器：

```text
clamp 到 config ceiling
```

再次说明：

```text
Model Proposal ≠ Execution Authority
```

---

# 7. `status` 先剥离

Tool Input：

```json
{
  "status": "正在查帐篷",
  "query": "..."
}
```

Executor：

```text
split_status()
```

得到：

```text
业务参数：query
UI label：正在查帐篷
```

后面的 Handler、Gate、Backend 看不到 `status`。

---

# 8. `dispatch()` 优先级

大致：

```text
1. absent tool?
2. load_skill?
3. presentation?
4. delegate?
5. business handler?
6. unknown?
```

不同 Tool 类型最终统一入口：

```python
executor.execute(name, input)
```

但内部职责清楚。

---

# 9. Disabled Tool 为什么 Executor 还要检查？

Config 关闭后，Tool 已从列表移除。

但：

```text
Messages API
Agent SDK
MCP
Host prefetch
```

都可能从不同入口走 Executor。

所以执行层仍检查：

```text
name in absent_tools
```

这是 Defense in Depth。

---

# 10. `load_skill`

Executor：

```text
SkillRegistry.get_instructions(name)
↓
ToolOutcome(skill body)
```

第三章的 Progressive Disclosure 在这里真正落地。

---

# 11. Presentation

如果 Tool 属于 Presentation：

```text
run_presentation()
```

会构造：

```text
EnrichmentContext
├── backend
├── config
├── session
└── state
```

因此 UI Enrichment 可以读取真实 Backend 和 Provenance State，而不是相信模型重新生成数据。

---

# 12. Memory

Base Executor 统一注册：

```text
save_memory
recall_memories
```

说明 Memory 是：

```text
Agent Infrastructure
```

不是 StorefrontBackend 的业务方法。

---

# 13. ShoppingToolExecutor 的业务 Handler

典型：

```text
search_products      → _search_products
get_product_details  → _get_product_details
get_cart             → _get_cart
add_to_cart           → _add_to_cart
...
```

最后大部分调用：

```text
StorefrontBackend
```

---

# 14. Search Handler 完整逻辑

可以抽象成：

```text
Claude:
search_products

↓
Executor

参数清理 / Validate
↓
SearchFilters
↓
Clamp Limit
↓
backend.search_products
↓
state.remember_products
↓
Serialization
↓
Fence
↓
ToolOutcome
```

最关键的不是“返回结果”，而是：

```text
state.remember_products()
```

它为后面的写动作建立 Entity Provenance。

---

# 15. Product Details 同样建立 Provenance

详情返回：

```text
Family
+
Variants
```

这些都会进入 `seen_products`。

因此用户选择 Variant 后：

```text
add_to_cart(VARIANT_ID)
```

Gate 才能确认这个 ID 来自可信 Read。

---

# 16. Order Read 也可以建立 Product Provenance

用户：

```text
“再买一次我上次那个”
```

订单 Tool 中的 Product ID 是用户真实订单记录，因此也能成为可信来源。

这说明 Provenance 的定义是：

```text
可信 Tool Result 引入的实体
```

不等于“必须 Search”。

---

# 17. ToolOutcome

这是执行层很核心的结构：

```text
result_text
events
is_error
blocked
```

它同时服务两个消费者：

```text
Claude
和
Host UI
```

### result_text
给模型，作为下一 Round Context。

### events
给前端/Host，例如：

```text
cart_update
ui
progress
```

因此：

```text
Model Channel ≠ UI Channel
```

---

# 18. error 与 held/blocked

三种基本语义：

```text
ok
error
blocked
```

例如：

```text
网络异常
→ error

没有 Provenance
→ blocked(provenance)

Family 还没选 Variant
→ blocked(options)
```

Blocked 不代表系统炸了，而是：

```text
动作被安全机制 hold
模型通常可以采取修复步骤
```

---

# 19. Tool Call Event

工具执行开始：

```text
AgentEvent.tool_call
```

结束：

```text
AgentEvent.tool_result
```

Host 可以做非常清晰的 Agent Trace：

```text
正在查商品
→ 成功

正在加购物车
→ blocked: options
```

---

# 20. 为什么 Executor 是跨 Runtime 安全边界？

Messages API、Agent SDK、Managed MCP 都尽量走同一个：

```text
ShoppingToolExecutor
```

所以：

```text
Gate
Memory Validation
Business result shaping
```

写一次就能在多 Runtime 生效。

如果安全只写在 Messages API 的 while-loop，换 Runtime 就可能绕过。

---

# 21. Executor 与 Backend 为什么还要再分？

Executor：

```text
Agent-facing adapter
```

处理：

```text
模型输入
Agent State
Gate
Fencing
ToolOutcome
```

Backend：

```text
Business-system adapter
```

处理：

```text
数据库/API
credential
真实业务能力
```

这两个职责完全不同。

---

# 22. 完整执行图

```text
Claude
  │ tool_use
  ▼
BaseToolExecutor.execute
  │
  ├─ strip status
  ├─ absent check
  ├─ validation
  └─ dispatch
       │
       ▼
ShoppingToolExecutor handler
       │
       ├─ gate
       ├─ clamp
       └─ backend
             │
             ▼
         Domain Record
             │
       ├─ provenance
       ├─ serialize
       └─ fence
             │
             ▼
         ToolOutcome
          /       \
 result_text      events
   ↓                ↓
Claude             Host
```

---

## 本章检查点

1. 为什么要两层 Executor？
2. 为什么 `execute()` 不应该让普通 Tool Failure 直接结束 Turn？
3. Schema 后为什么还要 Pydantic？
4. `ToolOutcome` 为什么同时有 text 和 events？
5. `blocked` 与 `error` 有什么区别？
6. Search 为什么需要更新 State？
7. 为什么关键执行逻辑应该跨 Runtime 复用？
