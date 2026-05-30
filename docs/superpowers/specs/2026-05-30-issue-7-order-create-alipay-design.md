# Issue #7 创建订单 MCP / CLI 与支付宝支付接入设计

## 背景

`climbing-go` 已在 `codex/product-list` 分支具备公开门店查询、公开 card 类型产品查询和 SKU 返回能力。用户可以通过 `product list` 或 MCP `listProducts` 获取 `products[].variants[].id`，但还不能把选中的 SKU 转成订单，也不能发起支付宝支付。

本次需求要补齐最小下单闭环：查询门店和产品，选择 SKU，创建订单，返回支付宝支付发起信息。实现需要面向 CLI 用户和 AI Agent，同时保留测试桩能力，避免接入真实门店、真实 SKU、真实订单或真实支付数据。

## 主 area

`climbing-go` CLI / MCP server / gateway 层。

具体归属：

- `src/mcp-server.ts`：新增本地 stdio MCP tool `createOrder`，并在 fixture 模式下提供 fake 下单服务。
- `src/store-gateway.ts`：新增远端 MCP JSON-RPC 调用方法 `createOrder`，解析结构化返回。
- `src/cli.ts`：新增 `climbing-go order create` 命令，复用同一个 gateway 能力。
- `src/config.ts`：扩展支付宝配置读取边界，只保存非敏感路径或由环境变量注入。
- `package.json` / `pnpm-lock.yaml`：加入支付宝 SDK 依赖。
- `tests/`、`README.md`、`skills/`：补充测试与使用说明。

## 允许修改范围

- `src/store-gateway.ts`
- `src/mcp-server.ts`
- `src/cli.ts`
- `src/config.ts`
- `package.json`
- `pnpm-lock.yaml`
- `README.md`
- `skills/betly-product/SKILL.md`
- 可新增 `skills/betly-order/SKILL.md`
- `tests/**/*.test.ts`
- `tests/fixtures/*.json`
- `docs/superpowers/specs/2026-05-30-issue-7-order-create-alipay-design.md`
- `docs/superpowers/plans/2026-05-30-issue-7-order-create-alipay.md`

## 明确不做

- 不实现课程、套餐、私教、活动等非 card 类型产品下单。
- 不新增真实生产订单 API、数据库写入或后台订单管理页面。
- 不使用真实门店、真实 SKU、真实用户、真实订单或真实支付数据做测试。
- 不把支付宝 appId、私钥、公钥、证书内容硬编码进仓库。
- 不实现完整 HTTP 回调服务，只把支付宝 SDK 初始化、支付发起、签名/验签配置边界设计清楚。
- 不新增复杂购物车、优惠券、会员资产、库存锁定或多支付渠道扩展。
- 不顺手重构已有 store/product 命令和测试结构。

## 用户流程

1. 用户通过 `climbing-go store list` 或 MCP `listStores` 选择门店。
2. 用户通过 `climbing-go product list --store-id <storeId>` 或 MCP `listProducts` 获取 card 类型产品。
3. 用户选择 `products[].variants[].id` 作为 `variant_id`。
4. 用户通过 CLI 或 MCP 创建订单。
5. 服务端重新校验 SKU、价格、状态和上架范围，创建订单后返回支付宝支付发起信息。

## CLI 设计

新增命令：

```bash
climbing-go order create \
  --store-id <storeId> \
  --user-id <userId> \
  --item <variantId> \
  --payment-channel alipay
```

`--item` 支持重复传入：

```bash
climbing-go order create \
  --store-id <storeId> \
  --user-id <userId> \
  --item <variantA>:2 \
  --item <variantB> \
  --payment-channel alipay
```

解析规则：

- `<variantId>:<quantity>` 明确传数量。
- `<variantId>` 不传数量时默认 `quantity = 1`。
- quantity 必须为正整数。
- `payment-channel` 首期只允许 `alipay`，默认值为 `alipay`。
- 输出仍为格式化 JSON，与现有命令一致。

## MCP tool 设计

新增 tool：`createOrder`。

输入 schema：

```ts
{
  storeId: string;
  userId: string;
  items: Array<{
    variantId: string;
    quantity?: number;
  }>;
  paymentChannel?: 'alipay';
}
```

归一化规则：

- `items[].quantity` 可选，缺省按 `1` 处理。
- 归一化后 quantity 必须为正整数。
- `items` 至少一项。
- `paymentChannel` 缺省为 `alipay`。

返回结构建议：

```json
{
  "order": {
    "id": "fake-order-1",
    "store_id": "fake-store-1",
    "user_id": "fake-user-1",
    "status": "pending_payment",
    "amount": 123,
    "currency": "CNY",
    "items": [
      {
        "variant_id": "fake-variant-1",
        "quantity": 1,
        "unit_price": 123,
        "subtotal": 123
      }
    ]
  },
  "payment": {
    "channel": "alipay",
    "status": "created",
    "payload": "...",
    "payment_url": "..."
  }
}
```

字段命名遵循当前 MCP 返回偏业务 JSON 的风格，订单内部字段使用 snake_case，CLI 外层继续由 gateway 包装 `ok/tool/endpoint/data`。

## 服务端校验边界

创建订单不能信任产品列表中返回的价格。真实服务端实现必须：

- 按 `store_id` 和 `variant_id` 重新查询 `product_variants`。
- 校验 SKU 存在、属于 card 类型产品、状态可售、门店上架范围有效。
- 使用服务端查到的当前价格计算金额。
- 校验 quantity 为正整数，缺省数量按 1 处理。
- 只在所有 SKU 校验通过后创建订单。

当前 `climbing-go` 本地 stdio MCP server 没有数据库连接，因此 fixture 模式只提供 fake SKU 下单桩；真实校验应由远端 Betly MCP 服务负责。

## 支付宝 SDK 接入

依赖使用支付宝官方 Node.js SDK 包 `alipay-sdk`。官方 SDK 面向 Node.js 服务端，提供 OpenAPI 调用、订单信息生成、证书、加签和验签能力；初始化需要 appId、应用私钥、公钥或证书路径等配置。

配置入口：

- `ALIPAY_APP_ID`
- `ALIPAY_PRIVATE_KEY_PATH` 或后续安全密钥管理注入的私钥内容
- `ALIPAY_PUBLIC_KEY_PATH`
- `ALIPAY_APP_CERT_PATH`
- `ALIPAY_PUBLIC_CERT_PATH`
- `ALIPAY_ROOT_CERT_PATH`
- `ALIPAY_GATEWAY`
- `ALIPAY_RETURN_URL`
- `ALIPAY_NOTIFY_URL`

首期实现原则：

- 只在需要真实支付发起时初始化 SDK。
- fixture/test 模式不读取真实密钥，不访问支付宝网络。
- 缺少支付配置时返回清晰结构化错误，不静默降级成成功支付。
- 支付发起结果作为订单创建返回的一部分，方便 CLI 和 MCP client 直接展示。
- 验签能力通过独立 helper 封装，为后续回调 handler 复用，但本次不新增 HTTP 回调服务。

## 方案选择

选择方案 B：从 `codex/product-list` 分支派生 #7 规划。

原因：

- Issue #7 的主链路依赖 `products[].variants[].id`，该能力在 PR #6 中已经具备。
- 在同一分支基础上规划能直接描述从 `product list` 到 `order create` 的完整体验。
- 计划仍保持最小范围，不把产品查询 PR 的代码再设计一遍。

## 测试策略

- `tests/mcp-server.test.ts`
  - `tools/list` 包含 `createOrder`。
  - `tools/call createOrder` 传 fake SKU 可返回订单和支付宝支付桩。
  - 不传 quantity 时返回 quantity 为 1。
- `tests/cli.test.ts`
  - help 中出现 `order create`。
  - `--item variant-id` 默认 quantity 为 1。
  - `--item variant-id:2` 正确解析数量。
  - 非正整数 quantity 报结构化错误。
- `tests/store-gateway.test.ts`
  - `createOrder` 调用远端 MCP tool name 为 `createOrder`。
  - 解析结构化订单返回。
  - 非法响应返回 `invalid_response`。
- `tests/fixtures/order-create.json`
  - 使用 fake store/user/SKU/order/payment 数据。
- `pnpm test`
- `pnpm build`

## 文档更新

README 增加最小链路：

```bash
climbing-go product list --store-id <storeId>
climbing-go order create --store-id <storeId> --user-id <userId> --item <variantId>
```

文档明确：

- SKU 来自 `products[].variants[].id`。
- `--item <variantId>` 不传数量时默认 1。
- 当前只支持 card 类型产品和支付宝。
- 支付宝配置必须通过环境变量或本地安全配置注入。

新增或更新 skill：

- `betly-product`：补充“下一步可用 variant id 创建订单”的说明。
- `betly-order`：说明 Agent 如何通过 CLI 创建订单，并提醒不得伪造真实支付数据。
