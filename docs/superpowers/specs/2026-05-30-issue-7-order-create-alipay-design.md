# Issue #7 创建订单 MCP / CLI 与支付宝支付接入设计（按 betly#3360 修订）

## 背景

`climbing-go` 已具备公开门店查询、公开 card 类型产品查询和 SKU 返回能力。Issue #7 原始目标是新增创建订单的 MCP / CLI，并接入支付宝支付 SDK。

后续在 `betlysaas/betly#3360` 中，服务端已经补齐了对话支付链路：

- API 新增 `/api/conversation-pay/preview` 和 `/api/conversation-pay/create`。
- 服务端按 `org_id + mobile` 定位付款用户。
- 创建订单复用既有 `createOrder` 和 `createOrderPayment(alipay)`。
- 支付宝 SDK、支付链接生成、签名、notify webhook 验签和订单入账都留在 Betly API 内。
- `payment_action.payment_url` 返回 Betly 签名中转链接，避免对话平台破坏支付宝长链接签名。
- 不再透传浏览器 `return_url`，支付完成后的订单状态只依赖支付宝 `notify_url` webhook 更新。

因此，`climbing-go` 的实现边界需要修订：它不应该直接依赖支付宝 SDK，也不应该读取支付宝密钥，而是作为公开 CLI / 本地 MCP 壳，调用远端 `climbing-mcp` 的对话支付工具。

## 主 area

`climbing-go` CLI / MCP server / gateway / skill 层。

## 允许修改范围

- `src/store-gateway.ts`
- `src/mcp-server.ts`
- `src/cli.ts`
- `src/config.ts`
- `package.json`
- `pnpm-lock.yaml`
- `README.md`
- `skills/betly-product/SKILL.md`
- `skills/betly-order/SKILL.md`
- `tests/**/*.test.ts`
- `tests/fixtures/*.json`
- `docs/superpowers/specs/2026-05-30-issue-7-order-create-alipay-design.md`
- `docs/superpowers/plans/2026-05-30-issue-7-order-create-alipay.md`

## 明确不做

- 不在 `climbing-go` 里安装或调用支付宝 SDK。
- 不在 `climbing-go` 里读取 `ALIPAY_*` 密钥、证书、网关、returnUrl 或 notifyUrl。
- 不实现支付宝 notify webhook、验签或订单入账逻辑。
- 不实现真实订单数据库写入；真实订单创建由 Betly API 完成。
- 不支持课程、套餐、私教、活动等非 card 类型产品下单。
- 不新增优惠券选择 UI、购物车、退款、订单查询或多支付渠道扩展。
- 不使用真实门店、真实 SKU、真实订单或真实支付数据做测试。

## 用户流程

1. 用户通过 `climbing-go store list` 或 MCP `listStores` 选择门店。
2. 用户通过 `climbing-go product list --store-id <storeId>` 或 MCP `listProducts` 获取 card 类型产品。
3. 用户选择 `products[].variants[].id` 作为 `variant_id`。
4. 调用方提供 `org_id` 和付款手机号 `mobile`。
5. 用户先通过 `order preview` / `preview-alipay-order` 预览订单金额。
6. 用户确认购买后，通过 `order create` / `create-alipay-pending-order` 创建支付宝待支付订单。
7. 返回 `payment_action.payment_url` 给用户打开支付。
8. 支付成功后，由 Betly API 的支付宝 notify webhook 验签并更新订单为已支付。

## CLI 设计

新增命令：

```bash
climbing-go order preview \
  --org-id <orgId> \
  --mobile <mobile> \
  --store-id <storeId> \
  --variant-id <variantId>

climbing-go order create \
  --org-id <orgId> \
  --mobile <mobile> \
  --store-id <storeId> \
  --variant-id <variantId>
```

可选参数：

- `--quantity <number>`：正整数，缺省由 Betly API 按 1 处理。
- `--participant-id <participantId>`
- `--user-coupon-id <userCouponId>`
- `--promotion-id <promotionId>`
- `--payment-action-type <web_cashier|mini_program>`：仅 `order create` 支持，默认 `web_cashier`。

CLI 输出仍为格式化 JSON，外层保持 `ok/tool/endpoint/data`。

## MCP tool 设计

本地 stdio MCP server 暴露与 `betly#3360` 对齐的工具名：

- `preview-alipay-order`
- `create-alipay-pending-order`

输入参数使用 snake_case，与远端 `climbing-mcp` 保持一致：

```ts
{
  org_id: string;
  mobile: string;
  store_id: string;
  variant_id: string;
  quantity?: number;
  participant_id?: string;
  user_coupon_id?: string;
  promotion_id?: string;
  payment_action_type?: 'web_cashier' | 'mini_program';
}
```

`preview-alipay-order` 不接受 `payment_action_type`。

## Gateway 设计

`StoreGateway` 新增：

- `previewAlipayOrder(args)`
- `createAlipayPendingOrder(args)`

调用远端 MCP 时映射为：

- `previewAlipayOrder` -> tool name `preview-alipay-order`
- `createAlipayPendingOrder` -> tool name `create-alipay-pending-order`

TypeScript 内部仍可使用 camelCase，发给远端时转换成 `org_id`、`store_id`、`variant_id`、`payment_action_type` 等 snake_case 参数。

## 支付边界

`climbing-go` 只展示支付入口，不确认支付成功。

- 支付链接使用返回里的 `data.payment_action.payment_url`。
- 原始支付宝长链接如存在，只作为调试字段，不推荐展示给用户。
- 订单是否已支付以 Betly API 的支付宝 notify webhook 入账结果为准。
- 浏览器回跳页不作为入账依据。

## 测试策略

- `tests/store-gateway.test.ts`
  - 验证远端 tool name 为 `preview-alipay-order` / `create-alipay-pending-order`。
  - 验证 CLI/gateway 参数转成 snake_case。
  - 验证预览响应要求有 `preview`。
  - 验证创建响应要求有 `order`、`payment`、`payment_action`。
- `tests/cli.test.ts`
  - `order preview` 能传入 `orgId/mobile/storeId/variantId`。
  - `order create` 能传入 `paymentActionType`。
  - 非正整数 `--quantity` 返回结构化错误。
- `tests/mcp-server.test.ts`
  - `tools/list` 包含两个订单工具。
  - fixture 模式能返回预览和创建订单假数据。
- `tests/config.test.ts`
  - 只保留 endpoint 配置测试，不再测试支付宝配置。
- `tests/skill.test.ts`
  - 覆盖 `betly-order` skill 和 README 入口。

## 文档更新

README 与 skill 明确：

- SKU 来自 `data.products[].variants[].id`。
- 创建订单需要 `org_id`、`mobile`、`store_id`、`variant_id`。
- `climbing-go` 不接入支付宝 SDK，也不配置支付宝密钥。
- 支付链接来自 `data.payment_action.payment_url`。
- 支付成功入账由 Betly API 的支付宝 notify webhook 完成。
