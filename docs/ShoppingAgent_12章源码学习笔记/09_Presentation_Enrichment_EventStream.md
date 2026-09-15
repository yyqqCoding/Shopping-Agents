> 学习对象：Anthropic `commerce-agents` / `shopping-agent`  
> 基于：2026-09-04 阅读的 `main` 分支  
> 学习模式：源码定位 → 核心对象 → 调用链 → 具体例子 → 为什么这样设计 → 可迁移经验  
> 仓库：https://github.com/anthropics/commerce-agents


# 第 9 章：Presentation、Enrichment 与 Event Stream

这一章回答：

> **为什么 Shopping Agent 不只是输出 Markdown？它如何控制商品卡片、比较表、计划、购物车更新和实时状态？**

源码：
- https://github.com/anthropics/commerce-agents/blob/main/commerce-common/commerce_common/presentation.py
- https://github.com/anthropics/commerce-agents/blob/main/shopping-agent/core/shopping_agent/enrichment.py
- https://github.com/anthropics/commerce-agents/blob/main/commerce-common/commerce_common/streaming.py

---

# 1. 从 Chatbot 到 UI Agent

传统：

```text
LLM
↓
Markdown
```

Commerce Agent：

```text
LLM
↓
Text
+
Presentation Tool
+
Agent Events
↓
Frontend
```

这让前端不用解析自然语言去猜：

```text
“这句话是不是购物车更新？”
```

---

# 2. Presentation Tool = UI Intent

例如：

```python
present_products(
    picks=[
      {"product_id": "P001", "reason": "最轻"}
    ]
)
```

模型表达：

```text
“展示 P001，原因是最轻”
```

不是让模型生成：

```text
P001 price / rating / stock / image
```

---

# 3. Presentation Component

可以理解为：

```text
Tool Schema
+
Validation
+
Enrichment
+
Component Name
+
Partial Streaming Policy
```

所以 Presentation 不是普通 JSON 输出。

---

# 4. Enrichment

模型输入：

```json
{
  "product_id": "P001",
  "reason": "更适合轻量需求"
}
```

Enrichment 从：

```text
state.seen_products
```

拿真实：

```text
title
price
currency
image
rating
availability
```

最终形成 UI Payload。

---

# 5. 为什么 Enrichment 使用 Provenance？

如果模型：

```text
present_products(P999)
```

但 P999 从没读过：

```text
系统不能相信这个 ID
```

UI 也必须和写动作一样受可信实体来源约束。

---

# 6. Canonical Data Rendering

可以记：

```text
LLM
= 选择谁、为什么、如何比较

Server
= 真实数据

Frontend
= 怎么画
```

这是比“让 LLM 生成完整卡片 JSON”可靠得多的设计。

---

# 7. Disclosure 更严格

例如资费披露：

```text
Model 只选择 Product
↓
Backend.get_disclosure
↓
Server-authored Rows
↓
UI
```

模型没有资格编：

```text
费用金额
限制条款
```

---

# 8. Checkout URL 也不经过模型

```text
Claude:
用户要 checkout
↓
Backend / Host:
CheckoutHandoff
↓
Frontend:
按钮/链接
```

真实支付 URL 不作为模型生成内容。

---

# 9. AgentEvent Protocol

当前常见事件：

```text
text_delta
tool_call
tool_result
ui
ui_partial
cart_update
progress
turn_complete
error
```

这是一个标准 Host Protocol。

---

# 10. text_delta

普通模型文字流。

前端可以实时显示：

```text
“更推荐第二款……”
```

---

# 11. tool_call

包含：

```text
tool
id
input
label
```

其中 label 来自 `status`。

前端可以显示：

```text
正在查询订单…
正在搜索帐篷…
```

---

# 12. tool_result

包含：

```text
summary
is_error
status
reason
excerpt
```

Status 可以是：

```text
ok
error
blocked
```

如果 Gate held：

```text
reason = provenance / options
```

Trace 能直接解释“为什么没执行”。

---

# 13. cart_update

写 Cart 后，Host 得到：

```text
整个 authoritative cart
```

不是从模型文字“已经加入”去推测状态。

这很重要：

```text
UI State 应由结构化业务事件驱动
```

---

# 14. ui

最终完整 Presentation：

```text
component
payload
```

前端：

```text
component name
→ React/Vue Component
```

---

# 15. ui_partial

这是很高级的 UX 优化。

Presentation Tool 的 Input 还在模型 Streaming：

```text
第一个 pick 已经生成
第二个还没生成
```

Runtime 可以解析 partial JSON，先发：

```text
ui_partial
```

用户先看到第一张卡。

这降低 Perceived Latency。

---

# 16. Partial JSON Parser

`streaming.py` 中甚至会尝试：

```text
临时闭合未完成对象/数组
忽略仍未结束的字符串
```

让还没完整完成的 Tool Input 在安全范围内生成 Partial UI。

---

# 17. eager_partial_frames

如果每个字符变化都刷新 UI：

```text
事件太多
页面抖动
```

所以 Runtime 允许控制 Partial Frame 的积极程度。

这是：

```text
Latency
vs
UI Stability
```

---

# 18. progress

长任务/Delegate 可以发：

```text
starting
querying ...
```

Host 用最新 progress 更新当前状态。

这些只是 Display 信息，不是业务参数。

---

# 19. turn_complete

包含：

```text
stop_reason
usage
elapsed_ms
results_cleared
```

这给 Host：

```text
Token
Latency
Context Compaction
Stop 状态
```

非常适合 Observability / Langfuse-like Trace。

---

# 20. results_cleared

如果历史过大，Runtime 会清掉旧大 Tool Result。

`turn_complete` 告诉 Host 清了多少。

说明：

```text
Context Compaction
是可观察的 Host State Change
```

而不是黑盒。

---

# 21. Presentation Close

如果：

```text
close_on_presentation = True
```

最后一批 Presentation 成功并已完整结束 UI：

```text
Runtime 可以直接结束 Turn
```

无需再多叫模型：

```text
“以上就是我的推荐。”
```

省一次 LLM Round。

---

# 22. 一个 Turn 为什么只需要一个主要组件？

```text
新 shortlist
→ products

2~4 finalists
→ comparison

整体 Goal
→ plan

知识说明
→ guide
```

避免：

```text
Cards + Comparison + 巨大文本
```

重复同一信息。

---

# 23. 三方分工

```text
Claude
→ Semantic Decision

Executor/Enrichment
→ Data Integrity

Frontend
→ Rendering
```

这是 UI Agent 非常通用的架构。

---

# 24. 对你自己的 Agent 有什么启发？

例如 Repair Agent 不必所有内容都塞文本。

可以设计：

```text
text_delta
tool_call
tool_result
code_diff
test_result
trace_update
turn_complete
```

Agent Event Protocol 本身就是产品能力。

---

## 本章检查点

1. Presentation 为什么不直接让模型生成完整业务 JSON？
2. Enrichment 为什么和 Provenance 有关系？
3. ToolOutcome 的 Model Channel 与 Host Event Channel 有什么不同？
4. ui_partial 如何降低感知延迟？
5. Cart 为什么应该用结构化事件更新？
6. turn_complete 为什么是 Observability 的重要边界？
