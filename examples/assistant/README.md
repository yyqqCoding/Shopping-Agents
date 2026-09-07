# 户外装备助手

一个打开即可体验的户外购物 Agent：中文对话、装备检索与比较、出行清单、模拟购物车和结算。浏览器自动建立 Supabase 匿名身份，不提供账号登录页面。每位访问者有自己的历史和长期偏好，同一访问者的新对话使用独立购物车和短期上下文。

## 运行

先安装仓库依赖，按 [部署说明](../../docs/deployment.md#中文体验站) 启用 Supabase 匿名访问、执行迁移并填写根目录 `.env`。然后运行：

```bash
python scripts/run_demo.py --no-install     # API :8004，页面 :3004
```

页面通过同源 `/api` 访问后端，开发代理由 `API_INTERNAL_URL` 指定。公网使用 [deploy](../../deploy/) 的 HTTPS 代理和一个 API worker。无需 Supabase 时只能浏览公开商品，不能创建共享演示身份来代替真实隔离。

## 文件与接口

- `api/main.py` 组合 `ShoppingAgent`、`MockRetail` 和 `demo_common.experience`，读取模型与 Supabase 配置。
- `api/mock_retail.py` 查询虚构商品与政策；购物车通过 `demo_common.persistence.PersistentCarts` 保存。
- `scripts/outdoor_catalog.py` 定义 8 类、96 个无品牌中文主商品及 120 个尺码变体，使用人民币独立定价；`data/catalog.json` 为固化输出。`evidence.json` 保存模拟价格和评价，`policies.json` 为前后端共享的配送、退货与选购依据。
- `shopping-agent/skills/outdoor-equipment/SKILL.md` 指导人数、气温、背负、睡眠系统、分层穿衣、照明与装备搭配；不声称提供实时天气或路线服务。
- `storefront-web/app/page.tsx` 是独立山野动画首页；`app/chat/page.tsx` 使用左侧对话导航、宽聊天区和右下角圆形购物车入口。`web-shared/storefront/Shell.tsx` 管理桌面折叠与移动端弹窗。
- `storefront-web/components/OutdoorMark.tsx` 与 `EquipmentIllustration.tsx` 提供原创 SVG 标识和八类装备插画；不展示记忆面板或读写进度。
- `storefront-web/components/VisitorProfile.tsx` 提供侧栏头像、昵称、个人资料与使用说明。展示资料按匿名身份保存在当前浏览器，桌面、移动端与同源标签页共享；不修改对话身份或长期偏好。
- `storefront-web/public/products/` 保留旧商品照片供历史查看，来源见目录中的 `IMAGE-CREDITS.md`。户外商品图片暂缓生成，`data/image-prompts.json` 记录待生成要求，缺图不产生失效 URL。
- `data/legacy/` 保存原始目录、中文内容源与价格评价；不参与新商品搜索。旧商品详情和旧购物车标记下架，可查看与移除，不能增购或结算。已保存的历史消息和卡片保持原样。

数据重新固化与校验：

```bash
python scripts/prepare_catalog.py
python scripts/prepare_catalog.py --check
```

主数据仍使用 JSON；Supabase 只保存身份、对话、购物车、长期记忆及处理进度。旧的本地记忆文件保留，不导入匿名用户。

新安装顺序执行 `001_agent_experience.sql`、`002_outdoor_cart_currency.sql`。已有安装先构建新镜像，停止 API 后仅执行 `002`，再启动新版本。迁移保留所有旧购物车的 USD 金额；新购物车使用 CNY，非空购物车拒绝混合币种，清空后可加入人民币商品。具体命令见 [户外版本升级](../../docs/deployment.md#户外版本升级)。

首次进入户外聊天创建空对话；原身份、长期偏好与左侧全部历史保留。之后恢复当前选中的对话。订单工具在户外部署中关闭，`data/users.json`、`orders.json` 仅保留本地夹具用途。

## 体验场景

- 两人春秋自驾露营一晚，预计最低 10°C，预算 2000 元，已有餐具，搭配帐篷、睡袋和睡垫。
- 比较 1000 元以内的双人徒步帐篷，解释重量、空间、防水与价格的取舍。
- 一日近郊徒步，已有徒步鞋，预算 700 元，选择背包、水壶和备用头灯。
- 表达稳定的背负、材质或颜色偏好，再新建对话体验推荐；后台提取完成前，新偏好可能尚未生效。
- 查看购物车和结算摘要。结算不创建订单、扣款或发货。

模型、记忆提取与长对话摘要都使用 Anthropic Messages API。网关必须支持 `/v1/messages` 和 SSE；`SHOPPING_MODEL` 与 `SHOPPING_MEMORY_MODEL` 都须在该网关可用。协议和部署参数见 [部署说明](../../docs/deployment.md)。
