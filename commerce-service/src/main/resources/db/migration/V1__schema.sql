-- Catalog, inventory, carts and orders. MySQL 8.0.16+ enforces the CHECK constraints.
-- No foreign keys: an order line keeps its snapshot even if a product row changes, and
-- inserting a line takes no shared lock on the rows it names.

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

CREATE TABLE inventory (
  sku_id              VARCHAR(40) NOT NULL,
  stock               INT         NOT NULL,
  low_stock_threshold INT         NOT NULL DEFAULT 8,
  updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (sku_id),
  CONSTRAINT chk_inventory_stock CHECK (stock >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE policy (
  id          VARCHAR(32)   NOT NULL,
  title       VARCHAR(200)  NOT NULL,
  category    VARCHAR(64)   NULL,
  content     TEXT          NOT NULL,
  search_text VARCHAR(2000) NOT NULL DEFAULT '',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
