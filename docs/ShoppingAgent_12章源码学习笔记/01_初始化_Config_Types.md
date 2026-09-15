> 学习对象：Anthropic `commerce-agents` / `shopping-agent`  
> 基于：2026-09-04 阅读的 `main` 分支  
> 学习模式：源码定位 → 核心对象 → 调用链 → 具体例子 → 为什么这样设计 → 可迁移经验  
> 仓库：https://github.com/anthropics/commerce-agents


# 第 1 章：ShoppingAgent 初始化、Config 与 Types

这一章只回答一个问题：**用户还没发第一句话之前，一个 Shopping Agent 是怎么被组装出来的？**

## 1. 目录先分成 Core 与 Runtime

```text
shopping-agent/
├── core/shopping_agent/
│   ├── config.py
│   ├── types.py
│   ├── prompt.py
│   ├── backend.py
│   ├── executor.py
│   ├── gates.py
│   ├── grounding.py
│   ├── enrichment.py
│   └── tools/
├── skills/
├── runtime-messages-api/
├── runtime-agent-sdk/
└── managed-agents/
```

核心理解：

```text
Core    = “这个 Agent 是什么”
Runtime = “这个 Agent 怎么跑”
```

Messages API 版本真正的 `ShoppingAgent` 类位于：

`shopping-agent/runtime-messages-api/shopping_agent_runtime/orchestrator.py`

源码：
- https://github.com/anthropics/commerce-agents/blob/main/shopping-agent/runtime-messages-api/shopping_agent_runtime/orchestrator.py
- https://github.com/anthropics/commerce-agents/blob/main/shopping-agent/core/shopping_agent/config.py
- https://github.com/anthropics/commerce-agents/blob/main/shopping-agent/core/shopping_agent/types.py

## 2. ShoppingAgent 构造时装了哪些零件？

典型创建：

```python
agent = ShoppingAgent(
    backend=my_backend,
    skills_dir=Path("shopping-agent/skills"),
    config=ShoppingAgentConfig(...),
)
```

构造函数主要接收：

```text
backend
skills / skills_dir
config
memory_store
memory_write_filter
client
extra_presentation_tools
executor_class
```

分别对应：

| 组件 | 职责 |
|---|---|
| Backend | 真实业务数据与动作 |
| Skills | 任务 SOP |
| Config | 部署级能力和上限 |
| MemoryStore | 跨会话长期事实 |
| MemoryWriteFilter | 哪些内容不允许进入记忆 |
| Client | Claude API 客户端 |
| Presentation extensions | 业务扩展 UI |
| Executor | Tool 真正执行入口 |

所以工程化定义更接近：

```text
ShoppingAgent =
LLM Client + Config + Skills + Backend
+ Memory + Executor + Presentation
```

而不是 `Prompt + LLM`。

## 3. 初始化顺序

当前源码可以抽象成：

```text
ShoppingAgent(...)
  ├─ SkillRegistry
  ├─ ShoppingAgentConfig
  ├─ StorefrontBackend
  ├─ MemoryRuntime
  ├─ AsyncAnthropic Client
  ├─ Presentation Components
  ├─ build_static_system()
  └─ build_tools()
```

最后两个对象在启动时构造一次：

```python
self._static_system = build_static_system(...)
self._tools = build_tools(...)
```

后面会看到，这样做是为了稳定 Prompt Cache 前缀。

---

# 4. BaseAgentConfig

`ShoppingAgentConfig` 继承公共 `BaseAgentConfig`。

公共源码：
https://github.com/anthropics/commerce-agents/blob/main/commerce-common/commerce_common/config.py

### 4.1 Identity

```text
brand_name
assistant_name
brand_voice
```

这些不是纯后台配置，会进入 Static Prompt，定义 Agent 的身份和语气。

### 4.2 Models

```text
model
memory_model
thinking_effort
```

当前 Shopping 主模型配置默认是 `claude-sonnet-5`，记忆提取用独立 `memory_model`。这体现一个重要原则：

```text
主推理任务 ≠ 所有辅助 LLM 任务都必须用同一个模型
```

### 4.3 Agent Loop Budget

```text
max_tokens = 2048
max_tool_iterations = 8
request_timeout_s = 120
```

`max_tool_iterations` 是 Runaway Guard。没有它，理论上可能：

```text
Claude → Tool → Claude → Tool → Claude → ...
```

最后一轮 Runtime 会禁止继续 Tool，迫使模型根据已有信息结束。

### 4.4 Latency / Cache

```text
eager_tool_dispatch
rolling_conversation_cache
eager_partial_frames
close_on_presentation
```

说明这个 Runtime 不只考虑“能跑”，还考虑 latency、Token 和用户等待感受。

### 4.5 Memory

```text
enable_memory
memory_tier_one_cap
memory_blocked_patterns
memory_retention_days
```

`memory_tier_one_cap` 不是 Memory 总数上限，而是每轮自动进入上下文的事实容量。

### 4.6 Caps

```text
max_context_chars
max_search_results
max_fenced_chars
compact_history_above_tokens
```

核心原则：

```text
模型提出的参数 ≠ 系统最终允许执行的参数
```

---

# 5. ShoppingAgentConfig

Shopping 专属配置主要包括：

```text
enable_disclosures
enable_cart
enable_orders
enable_policies
enable_fulfillment

max_quantity_per_item
max_cart_lines

policy_grounding_gate
order_grounding_gate
catalog_grounding_gate
```

## 5.1 Capability-driven Agent

如果：

```python
enable_cart = False
```

不是让 Claude 仍看见购物车 Tool、调用后再报“不支持”，而是 `absent_tools()` 会把这些能力从 Tool Surface 移除。

因此：

```text
Deployment Config
      ↓
Tool Surface
      ↓
Prompt 内容
      ↓
Grounding Rules
```

会一起变化。

这是很值得学习的能力配置方式。

---

# 6. Config、Context、State、Memory 必须分开

### Config
回答：这个 Agent 部署成什么样？

```text
brand / model / capabilities / limits
```

生命周期：Deployment。

### Session Context
回答：当前用户是谁、在哪、现在什么时间？

```text
session_id / user_id / page / timezone
```

生命周期：Session/Request。

### Session State
回答：当前 Agent 在 Session 中真正看见过哪些可操作实体？

Shopping 最关键是：

```python
seen_products
```

### Long-term Memory
回答：跨 Session 要保留哪些稳定用户事实？

例如：

```text
喜欢轻量装备
鞋码 EU42
长期预算偏好
```

所以一定记：

```text
Config ≠ Context ≠ State ≠ Memory
```

---

# 7. types.py：Agent 世界的数据协议

可以分成：

```text
Catalog
├── Product
├── ProductDetails
└── SearchFilters

Cart
├── CartItem
├── Cart
└── CheckoutHandoff

User
└── UserPreferences

Order
├── OrderStatus
├── OrderItem
└── Order

Knowledge
├── Policy
├── Disclosure
└── FulfillmentOption

Session
├── PageContext
├── ShoppingSessionContext
└── ShoppingSessionState
```

这定义了 LLM、Executor、Backend、UI 共同认可的“业务世界”。

## 7.1 Product Family 与 Variant

Product 可能是：

```text
Plain Product
Family Product
Variant Product
```

比如：

```text
Nike Shoe                ← Family
├── Black / 42           ← Variant
├── Black / 43
└── White / 42
```

Family 只是选项集合，真正可购买的是 Variant。这个类型设计后面直接支撑 `OPTIONS_GATE`。

## 7.2 ProductDetails 为什么分开？

Search 只返回轻量 Product；需要详细比较时才 `get_product_details()` 返回 specs、reviews、variants。

目的：

```text
降低 Backend Payload
降低 Tool Result Token
避免 Search 把大量详情塞进 Context
```

## 7.3 Cart 确定性计算

Cart 的 `item_count`、`subtotal` 应由代码计算，不应该交给 LLM 重新算。

原则：

```text
确定性计算 → Code
语义判断   → LLM
```

## 7.4 CheckoutHandoff

Shopping Agent 没有真实支付 Tool。流程是：

```text
Agent 准备 Cart
→ 用户要 Checkout
→ Host/Backend 提供 Handoff
→ 真实支付系统接管
```

Payment credential 和真实 URL 不需要进入模型。

## 7.5 UserPreferences ≠ Memory

```text
UserPreferences
= Backend 权威 Profile

Memory
= Agent 学到的 durable facts
```

不能混在一起。

## 7.6 PageContext

当前页面：

```text
page_type
product_id
query
```

用户在商品页说“这个怎么样”，Agent 可以通过页面 Context 知道 referent。这就是 Ambient Context。

---

# 8. ShoppingSessionState.seen_products

这是本项目很漂亮的设计。

```text
search_products()
→ P001 / P002 / P003
→ state.remember_products(...)
```

以后：

```text
add_to_cart(P002)
```

Gate 检查：

```text
P002 ∈ seen_products
```

如果模型幻觉：

```text
add_to_cart(P999)
```

P999 从没由可信 Tool 返回，就 BLOCK。

这不是普通缓存，而是：

```text
Entity Provenance
```

公共 `PROVENANCE_CAP` 当前为 200。旧实体淘汰后，如果要再次操作，必须重新 Read。

---

# 9. 为什么 ShoppingAgent 不保存 current_user？

`stream_turn()` 传入：

```text
messages
session
state
```

而不是：

```text
agent.current_user
agent.current_cart
```

所以：

```text
           One ShoppingAgent
          /       |       \
       User A   User B   User C
       State A  State B  State C
```

更准确：

```text
Agent Deployment = shared
Session          = host-managed
Memory           = store-managed
```

这是 Web Agent 很重要的并发/隔离基础。

---

# 10. Java 类比

```text
ShoppingAgentConfig
≈ @ConfigurationProperties

ShoppingSessionContext
≈ RequestContext / SecurityContext

ShoppingSessionState
≈ Session-scoped runtime state

Product / Cart / Order
≈ Domain DTO / VO

StorefrontBackend
≈ Service Interface
```

Agent 工程仍然是软件工程，只是多了一个 LLM Decision Layer。

---

## 本章检查点

1. `ShoppingAgent` 为什么属于 Runtime 而不是 Core？
2. Config 与 SessionContext 为什么不能合并？
3. `seen_products` 为什么是安全机制？
4. Product Family/Variant 为什么影响 Cart Gate？
5. 为什么一个 ShoppingAgent 实例能服务多个用户？
6. 哪些是 Deployment 级，哪些是 Session 级？
