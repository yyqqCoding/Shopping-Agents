> 学习对象：Anthropic `commerce-agents` / `shopping-agent`  
> 基于：2026-09-04 阅读的 `main` 分支  
> 学习模式：源码定位 → 核心对象 → 调用链 → 具体例子 → 为什么这样设计 → 可迁移经验  
> 仓库：https://github.com/anthropics/commerce-agents


# 第 6 章：StorefrontBackend——Agent 与真实业务系统的边界

核心问题：

> **如果把官方 Mock Retail 换成自己的 Java/MySQL/Shopify/ERP，真正应该接哪里？**

答案：

```text
StorefrontBackend
```

源码：
- https://github.com/anthropics/commerce-agents/blob/main/shopping-agent/core/shopping_agent/backend.py
- https://github.com/anthropics/commerce-agents/blob/main/docs/backends.md

---

# 1. 总链路

```text
Claude
↓
Tool Contract
↓
Executor
↓
StorefrontBackend
↓
真实业务系统
```

真实系统可以是：

```text
Spring Boot
MySQL
PostgreSQL
Elasticsearch
Shopify
内部 ERP
REST API
MCP
```

上层 Agent 不需要知道。

---

# 2. Backend 是 Integration Surface

这套架构希望：

```text
Prompt / Skills / Tools / Gates
尽量稳定

部署者主要实现：
StorefrontBackend
```

因此它实际上是 Agent 世界的 Port。

你的业务系统是 Adapter。

---

# 3. 为什么 Handler 不直接访问数据库？

如果每个 Tool 自己：

```text
search → SQL
order  → Shopify
cart   → Redis
```

Agent Core 就和你的技术栈绑死。

Backend 统一返回：

```text
Product
Cart
Order
Policy
```

所以 Executor 不关心你的字段叫：

```text
sku_code
goods_id
item_no
```

---

# 4. Identity 绝不能由模型传

错误：

```python
get_orders(user_id="u123")
```

模型可能伪造用户。

正确：

```text
Host 登录认证
↓
创建 Session
↓
Session 绑定 principal
↓
Backend 从 session 读取 user identity
```

Tool 参数里根本没有 `user_id`。

---

# 5. Credential 留在 Server

例如：

```text
OAuth token
Shopify secret
customer API token
session cookie
```

都由 Host/Backend 持有。

Claude 只看到：

```text
经过 Domain Mapping 的结果
```

绝不看到 Token。

---

# 6. Backend 的典型能力

```text
Catalog
├── search_products
└── get_product_details

Customer
├── get_preferences
└── get_account_context

Cart
├── get_cart
├── add_to_cart
├── update_cart_item
└── remove_from_cart

Orders
├── get_orders
└── get_order_status

Knowledge
├── search_policies
└── fulfillment/disclosure
```

具体方法以当前 `backend.py` 为准。

---

# 7. Java 接入示例

假设 Spring Boot：

```text
GET  /api/products/search
GET  /api/products/{id}
GET  /api/cart
POST /api/cart/items
```

Python Adapter：

```python
class MyBackend(StorefrontBackend):

    async def search_products(self, session, query, filters, limit):
        resp = await client.get(
            "/api/products/search",
            headers={
                "Authorization": token_for(session.user_id)
            },
            params={"q": query, "limit": limit},
        )

        return [
            Product(
                product_id=x["id"],
                title=x["name"],
                price=x["price"],
            )
            for x in resp.json()
        ]
```

调用：

```text
Claude
→ search_products

Executor
→ backend.search_products

Backend
→ Spring Boot

Spring Boot
→ MySQL / ES
```

---

# 8. Backend 做 Domain Translation

你的系统：

```json
{
  "sku_code": "A001",
  "goods_name": "Tent",
  "price_cent": 19900,
  "stock_flag": 1
}
```

转成：

```python
Product(
    product_id="A001",
    title="Tent",
    price=199,
    in_stock=True
)
```

因此 Backend 本质：

```text
Your Business Schema
↓
Agent Domain Schema
```

---

# 9. 不要把 DB Row 原样给模型

错误：

```text
数据库 70 个字段
→ 全部 Tool Result
```

正确：

```text
DB/API
↓
Domain Model
↓
Serialization
↓
Minimal Fenced Payload
```

减少：

```text
Token
无关字段
攻击面
内部实现泄露
```

---

# 10. Search 与 Detail 分层

Search：

```text
id/title/price/rating/availability
```

Details：

```text
description/specs/reviews/variants
```

否则每次 Search 把所有详情都返回，会严重污染 Context。

---

# 11. SPU/SKU 很适合映射 Family/Variant

```text
SPU → Product Family
SKU → Product Variant
```

Backend 把内部结构转成：

```text
options
option_values
variant_of
```

后面的 Cart Gate 就不需要知道你内部的商品模型。

---

# 12. Gate 与 Backend 的边界

Gate：

```text
Provenance
Variant 是否已确定
Agent 层数量 Cap
Session Cart mutation 序列化
```

Backend：

```text
真实 Cart 修改
业务最终校验
数据库一致性
权限
库存
事务
```

Agent Gate 不能替代业务 Backend 自己的安全与事务。

---

# 13. Business State 每轮重新读

例如 Cart：

```text
backend.get_cart()
```

不能只相信 Conversation。

用户可能在 Agent 对话外通过网页自己改 Cart。

所以：

```text
Backend = Source of Truth
Conversation = Interaction History
```

---

# 14. Checkout 为什么 Handoff？

StorefrontBackend 没设计一个让 Agent：

```text
charge_card()
```

的高风险接口。

流程：

```text
Agent:
用户准备 checkout

↓
Backend / Host:
构造 checkout handoff

↓
User:
进入已有 Commerce 支付流程
```

把 Payment/PCI Scope 留在原业务系统。

---

# 15. Disclosure 为什么 Server-authored？

例如：

```text
资费
费用
法律披露
票务限制
```

模型不应自己拼结构化权威内容。

更安全：

```text
Model 选择 Product
↓
Backend 提供 Disclosure rows
↓
UI 渲染
```

---

# 16. MCP 与 Backend 的关系

Commerce Agent 本身不是 MCP。

如果平台有 MCP：

```text
StorefrontBackend.search_products()
↓
MCP Client
↓
Official Platform MCP
```

或者 Managed Agent 路径：

```text
Managed Agent
↓
Storefront MCP Server
↓
Executor
↓
Backend
```

因此：

```text
MCP = Tool/Transport Protocol
Backend = Domain Integration Interface
```

不要混淆。

---

# 17. “系统不存在”与“系统故障”

Config：

```text
enable_orders = False
```

意思：

```text
这个部署本来就没有 Order capability
```

而：

```text
enable_orders = True
backend.get_orders() timeout
```

是：

```text
系统存在，但当前失败
```

对用户的语义不同。

---

# 18. Backend 接入 Checklist

```text
1. Identity 是否 Host 绑定？
2. Tool 参数是否没有 credential？
3. Backend 是否做 Domain Translation？
4. 是否只返回模型需要字段？
5. Search/Detail 是否分层？
6. Family/Variant 是否正确映射？
7. Backend 是否仍有自身业务校验？
8. 写操作是否考虑事务/幂等/并发？
9. 错误是否避免泄露内部信息？
10. Payment 等高风险 Action 是否应该 Handoff？
```

---

## 本章检查点

1. StorefrontBackend 为什么不是 Tool 本身？
2. 为什么 user_id 不能从模型参数传？
3. Backend 与 Executor 的职责怎么分？
4. MCP 为什么不等于 Backend？
5. SPU/SKU 怎么映射 Product Model？
6. 为什么 Conversation 不能成为业务状态源？
7. 为什么 Payment 留给 Host/System 更合理？
