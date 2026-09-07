# ACME 中文购物助手

一个打开即可体验的购物 Agent：中文对话、商品检索与比较、购物计划、模拟购物车和结算。浏览器自动建立 Supabase 匿名身份，不提供账号登录页面。每位访问者有自己的历史和长期偏好，同一访问者的新对话使用独立购物车和短期上下文。

## 运行

先安装仓库依赖，按 [部署说明](../../docs/deployment.md#中文体验站) 启用 Supabase 匿名访问、执行迁移并填写根目录 `.env`。然后运行：

```bash
python scripts/run_demo.py --no-install     # API :8004，页面 :3004
```

页面通过同源 `/api` 访问后端，开发代理由 `API_INTERNAL_URL` 指定。公网使用 [deploy](../../deploy/) 的 HTTPS 代理和一个 API worker。无需 Supabase 时只能浏览公开商品，不能创建共享演示身份来代替真实隔离。

## 文件与接口

- `api/main.py` 组合 `ShoppingAgent`、`MockRetail` 和 `demo_common.experience`，读取模型与 Supabase 配置。
- `api/mock_retail.py` 查询虚构商品与政策；购物车通过 `demo_common.persistence.PersistentCarts` 保存。
- `data/catalog.json` 包含 87 个中文主商品和 21 个规格变体。`content-zh.json` 是中文内容源，`evidence.json` 保存一致的模拟价格与评价，`policies.json` 包含配送、退货与选购指南。
- `storefront-web/` 使用 `web-shared` 的匿名身份、会话历史和流式组件，提供购物车与六种购物卡片；不展示记忆面板或读写进度。
- `public/products/` 保留现有照片，来源见目录中的 `IMAGE-CREDITS.md`。新增图片尚未生成，`data/image-prompts.json` 只记录待生成素材要求。

数据重新固化与校验：

```bash
python scripts/prepare_catalog.py
python scripts/prepare_catalog.py --check
```

主数据仍使用 JSON；Supabase 只保存身份、对话、购物车、长期记忆及处理进度。旧的本地记忆文件保留，不导入匿名用户。

## 体验场景

- 为两个人规划周末露营，预算 250 美元，需要帐篷与配套用品。
- 比较两个候选商品，说明价格、规格和适用场景的差异。
- 为小空间配置办公桌面，优先调整最影响日常使用的部分。
- 在一段对话里表达稳定的材质或颜色偏好，再新建对话体验推荐；后台提取完成前，新偏好可能尚未生效。
- 查看购物车和结算摘要。结算不创建订单、扣款或发货。

模型、记忆提取与长对话摘要都使用 Anthropic Messages API。网关必须支持 `/v1/messages` 和 SSE；`SHOPPING_MODEL` 与 `SHOPPING_MEMORY_MODEL` 都须在该网关可用。协议和部署参数见 [部署说明](../../docs/deployment.md)。
