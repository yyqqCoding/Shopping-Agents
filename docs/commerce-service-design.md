# Java 订单服务设计

## 目标与范围

`commerce-service` 是一个独立的 Java 服务，承担商品目录、实时库存、购物车和订单，数据保存在 MySQL。购物 Agent 通过 `StorefrontBackend` 的一个新实现 `JavaRetail` 调用它，Agent 核心代码不变。

这个服务用来证明两件事：

- Agent 通过既有接口接入外部订单系统，模型看到的提示词和工具定义不因后端更换而改变。
- 用户的一句需求经过模型、工具、校验和 HTTP 接口，最终落到一条参数化的 MySQL 语句上。

范围内：结构化商品查询、商品详情、实时库存、每个对话一份购物车、用户点击提交后扣减库存。

范围外：独立的搜索功能、待支付状态与超时释放、支付、取消订单、Redis、商品管理后台。

## 决定

| 事项 | 决定 |
| --- | --- |
| 数据库 | MySQL 8.0.16 及以上，InnoDB，`utf8mb4` |
| 技术栈 | Java 17、Spring Boot 3、MyBatis-Plus、Flyway、Maven Wrapper |
| 并发控制 | 带条件的 `UPDATE` 与 InnoDB 行锁；库存表不使用乐观锁 |
| 购物车 | 每个对话一份；加购只检查库存，不扣减 |
| 提交订单 | 用户点击结算卡片上的按钮，一个 `@Transactional` 事务内扣减库存；订单只有 `PLACED` 状态 |
| 库存不足 | 提交失败，整单回滚，用户看到"库存不足" |
| 购物车变化 | 提交请求携带卡片上的商品行；与锁定的购物车不一致时返回"购物车已变化" |
| 下单权限 | 模型没有下单工具；提交只由用户点击触发 |
| 库存恢复 | 不限制下单次数；库存由运维命令恢复 |
| 数据导入 | 只更新商品信息，不覆盖已有库存；`--reset-inventory` 恢复初始库存 |
| 对话与记忆 | 保留在 Supabase PostgreSQL |
| 旧数据 | Supabase 中的购物车表和商品表由 `005` 迁移删除 |
| 部署 | Agent 留在现有服务器；Java 服务与 MySQL 部署在新服务器，经阿里云内网调用 |

## 职责

```text
浏览器 → Caddy → Next.js / Python API（旧服务器 172.30.61.56）
                      │  JavaRetail：HTTP，Authorization: Bearer <服务令牌>，X-User-Id
                      ▼
                 commerce-service（新服务器 172.24.65.233:8080，仅内网）
                      ▼
                   MySQL 8（新服务器，不开放端口）

Supabase PostgreSQL：匿名身份、对话、每轮记录、长期记忆
```

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| 模型与技能 | 理解需求，提取结构化条件，组织推荐 | 编写 SQL；下单 |
| Python 执行器与校验 | 本会话来源校验、规格未选拦截、数量上限、每轮搜索预算、数据隔离、界面卡片 | 判断库存、价格和能否购买 |
| Python 宿主 | 匿名身份验证、对话归属校验、转发提交请求、向下一轮写入应用事件 | 读写 MySQL |
| commerce-service | 商品查询、实时库存、购物车、提交事务、订单查询、配送报价、政策检索 | 模型、对话和记忆 |
| MySQL | 约束、行锁、事务原子性 | |

Python 的校验防止模型出错；能否购买、库存是否足够，由 Java 在事务内最终判断。

## 从需求到 SQL

以"帮我找个 300 元以内的头灯，买两个"为例：

| 步骤 | 触发 | Python | Java 接口 | MySQL |
| --- | --- | --- | --- | --- |
| 搜索 | 模型调用 `search_products`，`category=outdoor-lighting`、`max_price=300` | 检查本轮搜索预算，调用 `JavaRetail.search_products` | `POST /internal/v1/catalog/search` | `product` 按分类过滤，`EXISTS` 子查询要求同一个 SKU 同时满足价格与 `stock > 0` |
| 详情 | 模型调用 `get_product_details` | 商品及其规格记入本会话来源 | `GET /internal/v1/catalog/products/{id}` | `product` 主键；`sku` 按 `product_id`；关联 `inventory` |
| 加购 | 模型调用 `add_to_cart(id, 2)` | 来源、规格、数量上限校验 | `POST /internal/v1/carts/{conversationId}/items` | 读取 `inventory.stock` 检查；`INSERT … ON DUPLICATE KEY UPDATE` |
| 结算卡片 | 模型调用 `checkout` | 生成卡片，按当前价格计算小计 | `GET /internal/v1/carts/{conversationId}` | `cart_item` 关联 `sku`、`inventory` |
| 提交 | 用户点击"提交订单" | `POST /api/orders` 校验对话归属，转发 | `POST /internal/v1/orders` | 提交事务 |
| 后续 | 下一轮读到应用事件；模型调用 `get_order_status` | 订单商品记入本会话来源 | `GET /internal/v1/orders/{orderNo}` | `orders` 按订单号与用户 |

Java 以 DEBUG 级别记录 MyBatis 执行的 SQL 与参数，日志带上 Python 传入的 `X-Conversation-Id`，同一对话的各条 SQL 可按该值查到。

## 表结构

七张表：

```text
product 1 ── n sku 1 ── 1 inventory
cart_item n ── 1 sku
orders 1 ── n order_item n ── 1 sku
policy
```

约定：

- 金额使用 `DECIMAL(12,2)`，时间使用 `DATETIME(3)`。
- 不建物理外键。插入订单明细时外键会对被引用行加共享锁；订单快照也不应依赖商品行的存续。关联由服务代码与导入程序保证。
- 没有规格的商品在 `sku` 中有一行，id 与商品 id 相同；库存、购物车和订单只使用 `sku_id`。
- `AR-` 开头的旧商品导入为 `retired = 1`，可以查看详情和从购物车移除，不能加购或提交。
- 有货由查询计算：SKU 为 `stock > 0`；商品族在任一规格有货时有货，价格取有货规格的最低价。
- 规格行保存合并商品族属性后的完整 `attributes`，以及自己的描述与参数（`detail`）；`display_order` 保持规格在商品族内的顺序。没有币种的旧商品按 USD 计价。
- 用户偏好不建表，`JavaRetail` 返回游客资料。配送规则读取 `examples/assistant/data/policies.json` 的 `terms`，与前端 `lib/storePolicy.ts` 同一来源。

### product

```sql
CREATE TABLE product (
  id                VARCHAR(32)   NOT NULL COMMENT '商品或商品族 id',
  title             VARCHAR(200)  NOT NULL,
  category          VARCHAR(64)   NOT NULL,
  currency          CHAR(3)       NOT NULL DEFAULT 'CNY',
  short_description VARCHAR(500)  NULL,
  image_url         VARCHAR(255)  NULL,
  rating            DECIMAL(3,2)  NULL,
  review_count      INT           NULL,
  options           JSON          NULL COMMENT '商品族的规格选项；普通商品为 NULL',
  detail            JSON          NOT NULL COMMENT 'labels、attributes、long_description、specs、review_highlights',
  evidence          JSON          NULL COMMENT '模拟价格走势与评价摘要',
  search_text       VARCHAR(2000) NOT NULL DEFAULT '',
  display_order     INT           NOT NULL DEFAULT 0,
  retired           TINYINT(1)    NOT NULL DEFAULT 0,
  created_at        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_category_list (category, retired, display_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### sku

```sql
CREATE TABLE sku (
  id                    VARCHAR(40)   NOT NULL COMMENT '规格 id；普通商品等于 product.id',
  product_id            VARCHAR(32)   NOT NULL,
  title                 VARCHAR(200)  NOT NULL,
  price                 DECIMAL(12,2) NOT NULL,
  currency              CHAR(3)       NOT NULL DEFAULT 'CNY',
  image_url             VARCHAR(255)  NULL,
  option_values         JSON          NULL COMMENT '规格值；普通商品为 NULL',
  attributes            JSON          NOT NULL COMMENT '合并商品族属性后的完整属性',
  detail                JSON          NOT NULL COMMENT 'short_description、long_description、specs',
  weight_g              INT           NULL,
  capacity_l            DECIMAL(6,1)  NULL,
  people                INT           NULL,
  comfort_temperature_c DECIMAL(5,1)  NULL,
  r_value               DECIMAL(4,1)  NULL,
  waterproof_mm         INT           NULL,
  evidence              JSON          NULL COMMENT '规格自己的价格走势与评价摘要',
  display_order         INT           NOT NULL DEFAULT 0 COMMENT '规格在商品族内的顺序',
  retired               TINYINT(1)    NOT NULL DEFAULT 0,
  created_at            DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_product (product_id, retired, price),
  CONSTRAINT chk_sku_price CHECK (price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

六个数值列对应 `domain_search_notes` 中的数值条件：`max_weight_g`、`min_capacity_l`、`min_people`、`max_comfort_temperature_c`、`min_r_value`、`min_waterproof_mm`。缺少数值的 SKU 不满足对应条件。

### inventory

```sql
CREATE TABLE inventory (
  sku_id              VARCHAR(40) NOT NULL,
  stock               INT         NOT NULL,
  low_stock_threshold INT         NOT NULL DEFAULT 8,
  updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (sku_id),
  CONSTRAINT chk_inventory_stock CHECK (stock >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

库存与 `sku` 分表，扣减的行锁只落在这张窄表上，商品读取不受影响。`stock` 不超过 `low_stock_threshold` 时，商品带上 `attributes.low_stock`。

### cart_item

```sql
CREATE TABLE cart_item (
  id              BIGINT      NOT NULL AUTO_INCREMENT,
  conversation_id CHAR(36)    NOT NULL,
  user_id         CHAR(36)    NOT NULL COMMENT 'Supabase 匿名用户 id',
  sku_id          VARCHAR(40) NOT NULL,
  quantity        INT         NOT NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_conversation_sku (conversation_id, sku_id),
  CONSTRAINT chk_cart_quantity CHECK (quantity BETWEEN 1 AND 24)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

MyBatis-Plus 不支持联合主键，因此使用自增主键加唯一索引。购物车不保存价格，读取时按 `sku.price` 计算。每条语句同时比对 `conversation_id` 与 `user_id`。

加购：

```sql
INSERT INTO cart_item (conversation_id, user_id, sku_id, quantity)
VALUES (?, ?, ?, ?) AS new
ON DUPLICATE KEY UPDATE quantity = cart_item.quantity + new.quantity;
```

写入前检查"写入后的数量 ≤ `inventory.stock`"，这次读取不加锁。

### orders

```sql
CREATE TABLE orders (
  id              BIGINT        NOT NULL AUTO_INCREMENT,
  order_no        VARCHAR(32)   NOT NULL COMMENT 'SO + IdWorker.getIdStr()',
  user_id         CHAR(36)      NOT NULL,
  conversation_id CHAR(36)      NOT NULL,
  request_id      CHAR(36)      NOT NULL COMMENT '提交按钮的幂等键',
  status          VARCHAR(16)   NOT NULL DEFAULT 'PLACED',
  item_count      INT           NOT NULL,
  total_amount    DECIMAL(12,2) NOT NULL COMMENT '商品小计，不含配送费',
  currency        CHAR(3)       NOT NULL DEFAULT 'CNY',
  created_at      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_no (order_no),
  UNIQUE KEY uk_user_request (user_id, request_id),
  KEY idx_user_created (user_id, created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

对外只使用 `order_no`：自增 id 会暴露订单量，19 位雪花数值在 JavaScript 中会丢失精度。`PLACED` 映射为核心类型的 `OrderStatus.PROCESSING`。

### order_item

```sql
CREATE TABLE order_item (
  id            BIGINT        NOT NULL AUTO_INCREMENT,
  order_id      BIGINT        NOT NULL,
  sku_id        VARCHAR(40)   NOT NULL,
  product_id    VARCHAR(32)   NOT NULL COMMENT '所属商品族；普通商品等于 sku_id',
  title         VARCHAR(200)  NOT NULL COMMENT '提交时的标题',
  option_values JSON          NULL,
  price         DECIMAL(12,2) NOT NULL COMMENT '提交时的单价',
  quantity      INT           NOT NULL,
  PRIMARY KEY (id),
  KEY idx_order (order_id),
  CONSTRAINT chk_item_quantity CHECK (quantity >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### policy

```sql
CREATE TABLE policy (
  id          VARCHAR(32)   NOT NULL,
  title       VARCHAR(200)  NOT NULL,
  category    VARCHAR(64)   NULL,
  content     TEXT          NOT NULL,
  search_text VARCHAR(2000) NOT NULL DEFAULT '',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 查询与索引

| 查询 | 索引 |
| --- | --- |
| 按分类查商品：`WHERE category=? AND retired=0 ORDER BY display_order, id` | `product.idx_category_list` 完成过滤与排序 |
| 同一 SKU 满足价格、属性与库存：`EXISTS (… sku s JOIN inventory i … WHERE s.product_id=p.id …)` | `sku.idx_product`；`inventory` 主键 |
| 不带分类或带关键词：`search_text LIKE ?` | 前置 `%` 不能使用 B+ 树索引，扫描约百行 |
| 按价格排序 | 商品族价格由规格计算，不能使用索引 |
| 商品详情 | `product` 主键；`sku.idx_product`；`inventory` 主键 |
| 装备浏览页 | `product.idx_category_list` |
| 读取购物车 | `cart_item.uk_conversation_sku` 最左列；`sku`、`inventory` 主键 |
| 加购写入 | `cart_item.uk_conversation_sku` |
| 提交时锁定购物车：`FOR UPDATE` | `cart_item.uk_conversation_sku`，只锁该对话的行 |
| 扣减库存：`WHERE sku_id=? AND stock>=?` | `inventory` 主键，只锁一行 |
| 幂等检查 | `orders.uk_user_request` |
| 订单列表：`WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT ?` | `orders.idx_user_created` 反向扫描 |
| 订单详情 | `orders.uk_order_no`；`order_item.idx_order` |

不建的索引：六个数值列与 `search_text`（数据量小，前置 `%` 用不上索引）；`order_item.sku_id`（只有离线对账使用）；`cart_item.user_id`（`conversation_id` 已定位到行）。

## 商品查询

`search_products` 的 `cursor` 在工具定义中是固定字段的对象（`id`、`price`、`rating`、`relevance`、`display_order`）。Java 使用这些字段做键集分页，核心代码不变：

| 排序 | 排序键 | 游标字段 |
| --- | --- | --- |
| `relevance` | 命中词数降序、`display_order`、`id` | `relevance`、`display_order`、`id` |
| `price_asc` / `price_desc` | 商品族价格、`id` | `price`、`id` |
| `rating` | 评分降序（空值在后）、`id` | `rating`、`id` |

- 关键词由 Python 的 `keyword_terms` 切分后以数组传入，每个词对 `search_text` 做 `LIKE`，去掉 `%` 与 `_`。命中词数作为相关度。
- 查询 `limit + 1` 行判断是否有下一页，多出的一行不返回。单次上限 8 行。
- 游标比较写成展开式 `a > x OR (a = x AND id > y)`。
- 已下架商品不出现在查询结果中，详情仍可读取。

## 提交订单

### 请求

```http
POST /internal/v1/orders
Authorization: Bearer <服务令牌>
X-User-Id: <Supabase 用户 id>
Idempotency-Key: <前端生成的 UUID，同一次点击的重试复用>

{"conversation_id": "…", "lines": [{"sku_id": "OD-2003-M", "quantity": 2}]}
```

`lines` 是结算卡片上显示的商品行。

### Mapper

```java
public interface CartItemMapper extends BaseMapper<CartItem> {
    @Select("SELECT * FROM cart_item WHERE conversation_id = #{cid} AND user_id = #{uid} " +
            "ORDER BY sku_id FOR UPDATE")
    List<CartItem> lockCart(@Param("cid") String conversationId, @Param("uid") String userId);
}

public interface InventoryMapper extends BaseMapper<Inventory> {
    @Update("UPDATE inventory SET stock = stock - #{qty} WHERE sku_id = #{skuId} AND stock >= #{qty}")
    int deduct(@Param("skuId") String skuId, @Param("qty") int qty);
}
```

### 事务

```java
@Transactional(rollbackFor = Exception.class)
public OrderView submit(String userId, String requestId, SubmitRequest request) {
    // 先锁购物车再查幂等键：等锁的重试读到第一次已提交的订单。
    // 事务里第一次普通读取才建立快照，所以它必须在加锁之后。
    List<CartItem> lines = cartItems.lockCart(request.conversationId(), userId);
    Order existing = byRequest(userId, requestId);
    if (existing != null) return view(existing);
    if (lines.isEmpty()) throw new BizException(ErrorCode.CART_EMPTY, "购物车已提交或为空");
    if (!sameLines(lines, request.lines())) throw new BizException(ErrorCode.CART_CHANGED, "…");
    // 任一 SKU 或商品已下架 → OUT_OF_STOCK
    orders.insert(order);                                      // 总额按当前价格计算
    for (CartItem line : lines) {                              // 已按 sku_id 升序
        if (inventory.deduct(line.getSkuId(), line.getQuantity()) == 0) {
            throw new BizException(ErrorCode.OUT_OF_STOCK, line.getSkuId() + " 库存不足，请让助手调整购物车");
        }
    }
    // 逐行写 order_item（标题与单价快照），再删除该对话的 cart_item
    return view(order);
}
```

完整实现见 `commerce-service/src/main/java/com/example/commerce/order/OrderService.java`。

### 保证

| 情况 | 结果 |
| --- | --- |
| 提交时库存足够 | 成功。同一 SKU 的扣减在行锁上排队，不因并发而失败 |
| 某个 SKU 库存不足 | `OUT_OF_STOCK`，整单回滚，订单、库存和购物车不变 |
| 卡片上的商品行与购物车不一致 | `CART_CHANGED`，库存不变 |
| 购物车为空（已提交） | `CART_EMPTY` |
| 同一 `Idempotency-Key` 重试 | 返回第一次的订单 |
| 同一 `Idempotency-Key` 并发 | 第二次插入违反 `uk_user_request`，Controller 在事务外捕获 `DuplicateKeyException`，查出并返回第一次的订单 |
| 两个订单以相反顺序包含相同 SKU | 按 `sku_id` 升序加锁，不产生死锁 |

加购时不占用库存。两个对话都加购了最后一件时，先提交的成功，后提交的得到"库存不足"。

扣减必须写成 `stock = stock - ?` 并在 `WHERE` 中比较。在 Java 中读出库存、计算新值再写回，会覆盖并发的扣减。库存表不注册 MyBatis-Plus 的 `OptimisticLockerInnerInterceptor`：版本号冲突在有限重试后会让有货的请求失败。

`@Transactional` 的使用约定：

- `BizException` 继承 `RuntimeException`，注解写 `rollbackFor = Exception.class`。
- 方法内不捕获后继续执行，否则提交时抛出 `UnexpectedRollbackException`。
- `submit` 由 Controller 调用；同类内部调用绕过事务代理。
- 事务内只执行数据库语句。

### 对账

```sql
SELECT i.sku_id
FROM inventory i
LEFT JOIN (SELECT sku_id, SUM(quantity) AS sold FROM order_item GROUP BY sku_id) o
       ON o.sku_id = i.sku_id
WHERE i.stock + COALESCE(o.sold, 0) <> ?;   -- 按 SKU 传入 inventory.json 的初始库存
```

并发测试以它作为最终断言。`--reset-inventory` 在恢复库存的同时清空 `orders` 与 `order_item`，因此这条查询在任何时候都应返回空。

## 内部接口

所有接口位于 `/internal/v1`，要求 `Authorization: Bearer <COMMERCE_SERVICE_TOKEN>`。用户相关接口要求 `X-User-Id`。`X-Conversation-Id` 只用于日志关联。请求与响应的字段均为 snake_case，与 `shopping_agent.types` 一致。

| 方法与路径 | 用途 |
| --- | --- |
| `POST /catalog/search` | `terms`、`category`、价格、评分、`inStock`、`attributes`、`sort`、`limit`、`cursor` → `products`、`hasMore`、`nextCursor` |
| `GET /catalog/products/{id}` | 详情，含规格、库存与证据 |
| `GET /catalog/products?category=&limit=&offset=` | 装备浏览页 |
| `POST /policies/search` | 政策检索 |
| `POST /fulfillment/quote` | `conversation_id`、`product_ids` → 配送方案 |
| `GET /carts/{conversationId}` | 购物车，每行带不可购买原因 |
| `POST /carts/{conversationId}/items` | `sku_id`、`quantity`：加到该行 |
| `PUT /carts/{conversationId}/items/{skuId}` | `quantity`：设置该行数量；购物车没有该行时不变 |
| `DELETE /carts/{conversationId}/items/{skuId}` | 移除一行 |
| `POST /orders` | 提交订单 |
| `GET /orders?limit=` | 当前用户的订单，最新在前 |
| `GET /orders/{orderNo}` | 当前用户的一张订单 |
| `GET /health` | 健康检查（执行 `SELECT 1`），不需要令牌 |

错误使用 `application/problem+json`，`code` 取值与传递：

| `code` | HTTP | Python | 用户或模型看到 |
| --- | --- | --- | --- |
| `UNAVAILABLE`（购物车写入、配送报价） | 409 | `Unavailable` | 模型说明缺货或下架，推荐消息中列出的有货规格 |
| `NOT_FOUND` | 404 | 返回 `None` | 找不到这件商品或订单 |
| `OUT_OF_STOCK`（提交） | 409 | 409 | 卡片显示"某某库存不足（或已下架），请让助手调整购物车" |
| `CART_CHANGED` | 409 | 409 | 卡片显示"购物车已变化，请让助手重新整理结算" |
| `CART_EMPTY` | 409 | 409 | 卡片显示"购物车已提交或为空" |
| `VALIDATION` | 400 | 其他异常 | 工具暂时不可用 |
| 5xx 或连接失败 | — | 其他异常 | 模型提示工具暂时不可用；卡片显示"提交失败，可重试" |

## Python 与前端

- `examples/assistant/api/java_retail.py`：`JavaRetail(StorefrontBackend)`，使用 httpx，超时 5 秒。搜索后设置 `last_page` 供执行器读取；详情的 `evidence` 写入参数（`specs`）并供详情面板读取。`get_preferences` 返回游客资料。
- `examples/assistant/api/main.py`：`CATALOG_BACKEND` 取 `json` 或 `java`；`enable_orders=True` 对两种模式相同，工具定义不因模式改变。`POST /api/orders` 校验对话归属，以请求中的 `request_id` 作为 `Idempotency-Key` 转发；成功后向 `pending_app_events` 写入订单号与件数并返回空购物车。
- `MockRetail` 是本地与测试模式，购物车保存在进程内存。
- `components/generative/CheckoutSummary.tsx` 的“提交订单”按钮提交卡片上的商品行，成功后显示订单号并清空购物车面板。
- `/equipment` 与 `/equipment/[id]` 在服务端每次请求 `/api/products`（`lib/liveCatalog.ts`），API 不可达时显示固化目录。

## 部署

Agent 服务器（`172.30.61.56`）运行 Caddy、Next.js 与 Python API；订单服务器（`172.24.65.233`）运行 commerce-service 与 MySQL。两台实例位于同一地域的不同 VPC，经 VPC 对等连接走内网；订单服务只绑定内网地址，安全组只放行 Agent 服务器的 8080 访问，MySQL 不发布端口。订单服务器的 Compose 网络固定为 `192.168.240.0/24`：两个 VPC 都使用 `172.16.0.0/12`，Docker 自动分配的网段可能覆盖对端交换机网段，回包会进入本机网桥。

MySQL 与订单服务各限 512M 内存：缓冲池 128M、关闭 `performance_schema`、锁等待 5 秒；JVM 堆 256M、连接池 5、Tomcat 线程 20。网络、安全组、部署命令和切换顺序见 [部署说明](deployment.md#订单服务)。

## 验收

- 模型提示词与工具定义在 `json` 与 `java` 两种模式下逐字节相同。
- 模型加购本会话未出现的 id 时在 Python 被拦截，Java 未收到请求。
- 加购只检查库存：库存 4 的 SKU 加购 5 件返回缺货；加购 2 件成功后库存仍为 4。
- 同一 SKU 同时满足条件：S 码便宜但缺货、L 码有货但贵时，"价格不超过 S 码价格且有货"的查询不返回该商品。
- 数值条件按数值比较，缺少数值的 SKU 不满足条件。
- 各排序方式下连续翻页无重复与遗漏。
- 不超卖：库存 4，50 个对话各 1 件并发提交，4 单成功，46 单库存不足，库存为 0，对账查询为空。
- 不少卖：库存 10，20 个对话各 1 件并发提交，恰好 10 单成功。
- 整单回滚：订单含 X、Y，Y 库存不足时 X 的库存与购物车不变。
- 相反顺序的两个多 SKU 订单并发提交均完成。
- 同一 `Idempotency-Key` 并发提交两次只产生一张订单，库存只扣一次。
- 卡片商品行与购物车不一致时返回 `CART_CHANGED`，库存不变。
- `AR-` 商品可查看详情，加购返回已下架，可从购物车移除。
- 重复导入不改变已有库存；`--reset-inventory` 后库存等于 `inventory.json`。
- 端到端：对话中搜索、加购、结算并点击提交后，`inventory.stock` 减少，`orders` 出现该订单，Java 日志按对话 ID 查到各条 SQL。

## 验证方式

| 验证 | 位置 |
| --- | --- |
| Java 编译与单元测试 | 本地，`mvnw test` |
| Python 测试（httpx `MockTransport` 模拟 Java 的各类响应） | 本地，`pytest` |
| MySQL 上的并发、回滚、幂等与分页测试 | 新服务器，`test` profile |
| 内网连通与端到端 | 部署后在两台服务器上 |
