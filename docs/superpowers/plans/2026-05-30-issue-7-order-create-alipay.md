# Issue #7 创建订单 MCP / CLI 与支付宝支付接入实施计划

## Header

- Issue: #7 新增创建订单 MCP 和 CLI，并接入支付宝支付 SDK
- Repo: `betly-ai/climbing-go`
- Branch: `feature/issue-7-order-create-alipay`
- Base: `codex/product-list`
- Design: `docs/superpowers/specs/2026-05-30-issue-7-order-create-alipay-design.md`

## 主 area

`climbing-go` CLI / MCP server / gateway 层。

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

- 不实现课程、套餐、私教、活动等非 card 类型产品下单。
- 不新增真实生产订单 API、数据库写入或后台订单管理页面。
- 不使用真实门店、真实 SKU、真实用户、真实订单或真实支付数据做测试。
- 不把支付宝 appId、私钥、公钥、证书内容硬编码进仓库。
- 不实现完整 HTTP 回调服务。
- 不新增复杂购物车、优惠券、会员资产、库存锁定或多支付渠道扩展。
- 不顺手重构已有 store/product 命令和测试结构。

## 实施任务

- [ ] 添加订单类型与 gateway 方法
  - 在 `src/store-gateway.ts` 定义 `CreateOrderArgs`、`OrderRecord`、`PaymentRecord` 等最小类型。
  - 扩展 `StoreGateway` 接口，新增 `createOrder(args)`。
  - 扩展 `callTool` 支持 tool name `createOrder`。
  - 解析远端 MCP 返回，校验 `order.id`、`order.status`、`payment.channel` 等最小字段。

- [ ] 实现 CLI `order create`
  - 在 `src/cli.ts` 新增 `order` command 和 `create` subcommand。
  - 参数包含 `--store-id`、`--user-id`、`--item`、`--payment-channel`、`--endpoint`、`--insecure`。
  - 支持重复 `--item`。
  - 支持 `--item <variantId>` 默认 quantity 为 1。
  - 支持 `--item <variantId>:<quantity>` 显式数量。
  - 校验 quantity 必须为正整数，错误输出走现有结构化错误路径。

- [ ] 实现 MCP `createOrder`
  - 在 `src/mcp-server.ts` 的 `StoreService` 中新增 `createOrder`。
  - 注册 MCP tool `createOrder`。
  - input schema 使用 `storeId`、`userId`、`items[].variantId`、`items[].quantity?`、`paymentChannel?`。
  - 在 tool handler 中将缺省 quantity 归一化为 1。
  - 真实模式转发到 gateway，fixture 模式走本地 fake 服务。

- [ ] 添加 fixture 下单桩
  - 新增 `tests/fixtures/order-create.json`。
  - 使用 fake store、fake user、fake variant、fake order、fake payment 数据。
  - fixture 服务按 `variantId` 查找 fake SKU，计算 `quantity * unit_price`。
  - 缺省 quantity 按 1 计算。
  - 未知 SKU 返回清晰错误。

- [ ] 接入支付宝 SDK 配置边界
  - 在 `package.json` 加入 `alipay-sdk` 依赖，并更新 lockfile。
  - 在 `src/config.ts` 或独立 helper 中定义支付宝配置读取函数。
  - 支持环境变量读取 appId、私钥路径、公钥/证书路径、gateway、returnUrl、notifyUrl。
  - 不读取真实测试密钥，不在 fixture 测试中访问支付宝网络。
  - 缺少配置时返回结构化错误。

- [ ] 封装支付发起最小 helper
  - 新增内部 helper 用支付宝 SDK 生成支付发起 payload 或支付 URL。
  - 支持首期 `alipay` 渠道。
  - 输入使用服务端订单号、金额、标题、returnUrl、notifyUrl。
  - 将 SDK 异常转换为现有结构化错误。
  - 预留验签 helper，供后续回调 handler 使用。

- [ ] 增加 MCP 测试
  - 更新 `tests/mcp-server.test.ts`，断言 `tools/list` 包含 `createOrder`。
  - 调用 `createOrder` 使用 fake SKU 创建订单。
  - 增加不传 quantity 默认 1 的断言。
  - 增加未知 SKU 或非法 quantity 的错误断言。

- [ ] 增加 CLI 测试
  - 更新 `tests/cli.test.ts`，断言 help 中包含 `order` 和 `create`。
  - 测试 `--item fake-variant` 会传 `quantity: 1`。
  - 测试 `--item fake-variant:2` 会传 `quantity: 2`。
  - 测试 `--payment-channel` 默认 `alipay`。
  - 测试非法 item 数量返回结构化错误。

- [ ] 增加 gateway 测试
  - 更新 `tests/store-gateway.test.ts`，验证 JSON-RPC 请求 tool name 为 `createOrder`。
  - 验证请求参数包含归一化后的 items。
  - 验证结构化返回能解析为 `ok/tool/endpoint/data`。
  - 验证缺少关键字段时报 `invalid_response`。

- [ ] 更新 README 和 skill
  - README 增加从 `product list` 到 `order create` 的最小链路。
  - README 明确 `products[].variants[].id` 是下单 SKU。
  - README 明确 `--item <variantId>` 数量默认 1。
  - README 增加支付宝配置说明。
  - 更新 `skills/betly-product/SKILL.md`，说明可继续创建订单。
  - 新增 `skills/betly-order/SKILL.md`，描述 Agent 下单流程和限制。

- [ ] 运行验证
  - 执行 `pnpm install` 更新 lockfile。
  - 执行 `pnpm test`。
  - 执行 `pnpm build`。
  - 如测试失败，按失败点修复，不做无关重构。

- [ ] 收尾
  - 检查 `git diff`，确认只包含允许范围。
  - 确认没有真实密钥、真实订单、真实支付数据进入仓库。
  - 给 Issue #7 添加 `status:in-progress`。
  - 在 Issue #7 评论设计和计划摘要。
