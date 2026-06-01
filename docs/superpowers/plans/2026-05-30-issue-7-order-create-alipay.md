# Issue #7 创建订单 MCP / CLI 与支付宝支付接入实施计划（按 betly#3360 修订）

## Header

- Issue: #7 新增创建订单 MCP 和 CLI，并接入支付宝支付 SDK
- Repo: `betly-ai/climbing-go`
- Branch: `feature/issue-7-order-create-alipay`
- Base: `codex/product-list`
- Design: `docs/superpowers/specs/2026-05-30-issue-7-order-create-alipay-design.md`
- 参考 PR: `betlysaas/betly#3360`

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

## 明确不做

- 不在 `climbing-go` 中安装或调用支付宝 SDK。
- 不读取或保存 `ALIPAY_*` 密钥、证书、网关、returnUrl 或 notifyUrl。
- 不实现支付宝 webhook、验签或订单入账。
- 不实现真实订单数据库写入。
- 不支持非 card 类型产品、复杂购物车、退款、订单查询或多支付渠道。
- 不使用真实门店、真实 SKU、真实订单或真实支付数据做测试。

## 实施任务

- [x] 修订订单能力边界
  - 以 `betly#3360` 为准，确认支付宝 SDK 留在 Betly API。
  - `climbing-go` 只调用远端 `climbing-mcp` 订单工具。
  - 删除公开包内支付宝 SDK helper 与 `ALIPAY_*` 配置入口。

- [x] 调整 gateway
  - 删除泛化 `createOrder(userId/items/paymentChannel)`。
  - 新增 `previewAlipayOrder(args)`。
  - 新增 `createAlipayPendingOrder(args)`。
  - 远端 tool name 分别为 `preview-alipay-order` 和 `create-alipay-pending-order`。
  - 内部 camelCase 参数转换为远端 snake_case 参数。
  - 校验预览响应包含 `preview`。
  - 校验创建响应包含 `order`、`payment`、`payment_action`。

- [x] 调整 CLI
  - 新增 `climbing-go order preview`。
  - 调整 `climbing-go order create` 参数为 `--org-id`、`--mobile`、`--store-id`、`--variant-id`。
  - 支持 `--quantity` 正整数。
  - 支持 `--participant-id`、`--user-coupon-id`、`--promotion-id`。
  - `order create` 支持 `--payment-action-type web_cashier|mini_program`。
  - 移除 `--user-id`、`--item`、`--payment-channel`。

- [x] 调整 MCP server
  - 注册 `preview-alipay-order`。
  - 注册 `create-alipay-pending-order`。
  - MCP 参数使用 `org_id`、`mobile`、`store_id`、`variant_id`。
  - fixture 模式返回 conversation-pay 形状的 fake preview/create 响应。

- [x] 移除支付宝 SDK 依赖
  - 删除 `src/alipay.ts`。
  - 删除 `loadAlipayConfig` 和相关类型。
  - 从 `package.json` 移除 `alipay-sdk`。
  - 从 `pnpm-lock.yaml` 移除 importer 中的 `alipay-sdk`。

- [x] 更新测试
  - 更新 CLI 测试覆盖 `order preview`、`order create` 和非法 `--quantity`。
  - 更新 gateway 测试覆盖远端 tool name 与 snake_case 参数。
  - 更新 MCP stdio 测试覆盖两个订单工具。
  - 更新 config 测试，移除支付宝配置断言。
  - 更新 skill 测试，覆盖 `betly-order`。

- [x] 更新 README 和 skill
  - README 说明最小链路：`product list` -> `order preview` -> `order create`。
  - README 说明 `climbing-go` 不接支付宝 SDK、不配置支付宝密钥。
  - README 说明支付链接使用 `data.payment_action.payment_url`。
  - 更新 `betly-product` 下一步购买提示。
  - 更新 `betly-order` 说明 Agent 下单流程。

- [x] 运行验证
  - 执行 `./node_modules/.bin/vitest run`。
  - 执行 `./node_modules/.bin/tsc -p tsconfig.json`。
  - 执行 `git diff --check`。

- [x] 收尾
  - 检查 diff，确认没有真实密钥、真实订单、真实支付数据进入仓库。
  - 更新 Issue #7 评论，说明计划已按 `betly#3360` 修订。
