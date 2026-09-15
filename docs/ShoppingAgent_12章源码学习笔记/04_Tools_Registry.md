> 学习对象：Anthropic `commerce-agents` / `shopping-agent`  
> 基于：2026-09-04 阅读的 `main` 分支  
> 学习模式：源码定位 → 核心对象 → 调用链 → 具体例子 → 为什么这样设计 → 可迁移经验  
> 仓库：https://github.com/anthropics/commerce-agents


# 第 4 章：Tools 与 `tools/registry.py`

这一章回答：

> **Claude 到底能调用哪些能力？Tool Contract 怎么定义？为什么 Tool Description 与 JSON Schema 本身就是 Agent 设计的一部分？**

源码：
https://github.com/anthropics/commerce-agents/blob/main/shopping-agent/core/shopping_agent/tools/registry.py

---

# 1. Tool Contract ≠ Tool Implementation

一定先分开：

```text
Tool Contract
= 给 Claude 看的能力说明

Tool Implementation
= Python 真正执行的代码
```

例如：

```text
search_products
```

它的 Contract 在 `tools/registry.py`。

真正执行则是：

```text
ShoppingToolExecutor
↓
StorefrontBackend.search_products()
```

这两个层次不要混。

---

# 2. `build_tools(...)`

核心函数：

```python
build_tools(
    config,
    skill_names,
    extra_presentation_tools
)
```

它生成一个稳定的 Tool Array。

源码特意按固定顺序构造，因为：

```text
Tool Array bytes 稳定
→ Prompt Cache 更稳定
```

---

# 3. Tool Rules 应放在哪里？

这个文件开头就给出了很好的规则：

```text
一个 Tool 自己的行为
→ Tool Description

跨多个 Tool 的规则
→ System Prompt / Skill
```

进一步可以总结：

```text
Global behavior      → System Prompt
Flow procedure       → Skill
Single-tool behavior → Tool Description
Hard invariant       → Gate / Backend
```

以后自己做 Agent 时非常值得照这个方法拆。

---

# 4. Tool 可以分成四类

## A. Infrastructure

```text
load_skill
save_memory
recall_memories
```

## B. Business Read

```text
search_products
get_product_details
get_cart
get_preferences
get_orders
get_order_status
search_policies
get_fulfillment_options
```

## C. Business Write

```text
add_to_cart
update_cart_item
remove_from_cart
```

## D. Presentation

```text
present_products
present_comparison
present_plan
present_guide
present_order_status
present_suggestions
checkout
```

这说明一个 Agent 的 Tool Surface 不只是 CRUD，还包括：

```text
Skill
Memory
UI
```

---

# 5. `load_skill`

Schema 中：

```text
skill_name
```

不是任意字符串，而是：

```text
enum(installed skills)
```

因此 Claude 只能选择当前真正安装的 Skill。

这体现：

```text
语义选择交给 LLM
合法值范围交给 Schema
```

---

# 6. `search_products`

典型 Schema：

```text
query
filters
limit
```

Filters：

```text
category
min_price
max_price
min_rating
attributes
sort
```

这比让 LLM 写 SQL 稳定得多。

架构：

```text
Natural Language
↓
Structured Search Contract
↓
Backend
↓
SQL / ES / Shopify / API
```

模型不需要接触数据库查询语言。

---

# 7. Filter 与 Query 的边界

源码中一个很好的设计思想：

```text
用户明确说出的 Constraint
→ filter

模型猜测/语义偏好
→ query wording
```

例如：

```text
用户：
1000 以内、通勤用、轻一点的包
```

可以：

```text
max_price = 1000
query = "lightweight commuter backpack"
```

而不是把所有自然语言都硬映射数据库字段。

---

# 8. JSON Schema 的几个关键约束

大量 Tool 都会使用：

```json
"additionalProperties": false
```

意义：

```text
模型不能随便添加未知参数
```

还广泛使用：

```text
enum
minimum
maximum
maxLength
maxItems
required
```

这些限制会显著减少模型 Tool Call 的搜索空间。

---

# 9. Schema 不是最终安全边界

即使 Schema 写：

```text
limit <= 8
```

执行器仍会：

```text
clamp_limit()
```

原因：

```text
Tool Schema
= 模型侧约束

Server Validation
= 真正执行侧约束
```

安全设计不能只依赖模型是否按 Schema 生成。

---

# 10. `get_product_details`

它的 Description 不只是“查商品详情”。

还说明什么时候应该用：

```text
用户问具体商品
比较 finalist 前
选择 Variant 前
用户引用 Catalog ID
```

这种只属于一个 Tool 的使用规则，放 Description 最合适。

---

# 11. Cart Tools

例如 `add_to_cart` 的 Description 会提醒：

```text
product_id 应来自本 Session 的 catalog/order tool
```

但要注意：

```text
Description 只是指导模型
```

真正防止乱写 ID 的是：

```text
Provenance Gate
```

因此：

```text
Prompt / Description = Soft Guidance
Gate                 = Hard Enforcement
```

---

# 12. `get_preferences` 的 Runtime 适配

Messages API 路径中：

```text
Profile 通常已经通过 Dynamic Context 注入
```

所以 Description 会说：

```text
Context 缺失时再调用
```

但 Agent SDK / MCP 路径没有完全相同的 Dynamic System Block，因此源码定义 `INLINE_CONTEXT_DESCRIPTIONS`，对描述做适配。

说明：

> 同一个 Core Tool 可以针对不同 Runtime 的上下文机制做薄适配，而不是重写业务 Tool。

---

# 13. Order Tools 为什么拆成两个？

```text
get_orders
= 最近订单 / 用户没有指定某个订单

get_order_status
= 用户明确给出一个 order_id
```

相比设计一个：

```text
query_order(mode=...)
```

拆开后模型更容易正确路由。

这是一个很实用的 Tool Granularity 原则。

---

# 14. `search_policies`

Policy Search 不只处理：

```text
return
warranty
shipping
```

`purchase-research` 还会用它获取：

```text
Store Buying Guide
```

因此一个业务 Read Tool 可以服务多个 Skill。

Skill 决定“怎么组合 Tool”，Tool 自己不绑定某个唯一 Flow。

---

# 15. Memory Tools

`save_memory`：

```text
key
value
category
```

其中 Category：

```text
preference
constraint
context
```

Tool Description 已经会提醒模型：

```text
保存 durable need
不要保存产品/Policy 文本
```

后面 MemoryRuntime 仍会：

```text
sanitize
validate
write filter
```

又一次体现多层防护。

---

# 16. `recall_memories`

输入非常克制：

```text
topic
```

例如：

```text
shoe size
wife gift
camping
work travel
```

不是把整段对话扔给 Memory Search。

语义是：

```text
“我现在缺一个关于这个 Topic 的长期事实”
```

---

# 17. 为什么 Presentation 也要做 Tool？

因为模型不应该只输出 Markdown。

例如：

```python
present_products(...)
```

表达的是：

```text
“我现在要把这些 Product 展示成商品卡片”
```

然后 Runtime：

```text
Validate
↓
Enrich
↓
AgentEvent.ui
↓
Frontend
```

这本质是：

```text
LLM → UI Intent API
```

---

# 18. `present_products`

模型主要传：

```text
product_id
reason
layout
```

不重新生成：

```text
price
rating
image
stock
```

这些真实字段由 `seen_products` 中的 canonical record 补全。

---

# 19. `present_comparison`

限制：

```text
2~4 finalists
```

模型负责：

```text
pros
cons
best_for
recommended choice
```

但具体 Product 事实仍来自前面的 Tool Result。

也就是：

```text
LLM = interpretation
System = authoritative records
```

---

# 20. `present_plan`

Tool Schema 甚至限制：

```text
step count
每步文本长度
product_ids 数量
```

这不只是 UI 校验，也是在限制 Agent 不生成一个 50-step 巨型计划。

---

# 21. `status` 字段

公共 Executor 会给非 Presentation Tool 增加可选：

```text
status
```

例如模型可以写：

```text
“正在查找轻量帐篷”
```

Host 用它显示执行进度。

但是执行前会：

```text
strip status
```

所以它不会进入：

```text
Backend
Gate
Memory
业务参数验证
```

很好的分层：

```text
Display Metadata ≠ Business Argument
```

---

# 22. Capability 如何影响 Tool Surface

`build_tools()` 最终会：

```text
Built-in Tools
- config.absent_tools()
+ extra presentation tools
+ optional web search
```

所以没有订单系统的部署：

```text
根本不应该暴露订单 Tool
```

比“暴露所有工具然后要求模型别乱用”更好。

---

# 23. 自己设计 Tool 的 Checklist

```text
1. Tool 名称是否明确？
2. Description 是否只讲这个 Tool？
3. 何时用 / 不用是否清楚？
4. Schema 是否使用 enum/min/max/maxLength？
5. additionalProperties 是否应该 false？
6. 是否能用结构化 Contract 替代 SQL/自然语言命令？
7. 是否暴露了不必要的 user_id/credential？
8. Display 字段是否和 Business 字段分开？
9. Server 是否会再次 Validation？
10. 当前部署真的需要把这个 Tool 暴露给模型吗？
```

---

## 本章检查点

1. Tool Contract 与 Tool Implementation 区别是什么？
2. Tool Description 为什么不能承担所有规则？
3. Schema 能解决什么，不能解决什么？
4. Presentation 为什么也适合做 Tool？
5. `status` 为什么不能传到 Backend？
6. 为什么 Tool Surface 越小通常越好？
