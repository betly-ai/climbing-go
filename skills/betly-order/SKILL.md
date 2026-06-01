---
name: betly-order
description: Use when a user wants to preview or create a Betly/Banana Climbing Alipay pending order through the climbing-go CLI using a product variant SKU.
---

# Order Creation

Use this skill only for previewing or creating card 类型产品支付宝待支付订单 through `climbing-go`.

## MUST DO

- 开始前先确认 `climbing-go` 已安装并且当前终端可以直接执行
- 预览订单用 `climbing-go order preview`，用户确认购买后再用 `climbing-go order create`
- 只使用 `product list` 返回里的真实 `data.products[].variants[].id` 作为 SKU，不要猜测或编造 SKU
- 如果用户没有给 SKU，先使用 `betly-product` 查询公开 card 类型产品
- 如果用户没有给数量，默认数量为 1
- 必须由调用方或用户提供 `org_id` 和付款手机号；不要自行猜测组织或手机号
- 不要使用、询问或配置支付宝密钥；支付宝 SDK、签名和 webhook 入账都在 Betly API 内完成

## Scope

- 支持 `order preview`
- 支持 `order create`
- 当前仅支持 card 类型产品
- 当前仅支持支付宝支付
- 不支持课程、套餐、会员私有资产、优惠券、退款或订单查询

## Setup

先确认 CLI 已安装：

```bash
climbing-go --help
```

如果当前是在仓库源码里调试，可以改用本地入口：

```bash
pnpm exec tsx src/index.ts --help
```

## Commands

```bash
climbing-go order preview --org-id <orgId> --mobile <mobile> --store-id <storeId> --variant-id <variantId>
climbing-go order create --org-id <orgId> --mobile <mobile> --store-id <storeId> --variant-id <variantId>
climbing-go order create --org-id <orgId> --mobile <mobile> --store-id <storeId> --variant-id <variantId> --quantity 2
```

`--quantity` 不传时默认 `quantity = 1`，数量必须为正整数。

## Query Strategy

1. 用户已经给出 `org_id`、手机号、`store_id` 和 SKU 时，先预览订单
2. 用户只给产品名或门店信息时，先用 `betly-product` 找到真实 SKU
3. 多个 SKU 都可能命中时，返回真实候选项让用户确认
4. 用户没有说明数量时，预览和创建都按 1 处理
5. 用户确认购买后，再创建支付宝待支付订单
6. 用户要求非 card 产品、课程预约或复杂订单时，说明当前 CLI 未开放

## Output

- `order preview` 返回 JSON，重点看 `data.preview.amount` 和 `data.preview.items`
- `order create` 返回 JSON，重点看 `data.order`、`data.payment` 和 `data.payment_action`
- `data.payment_action.payment_url` 是推荐展示给用户打开的支付入口
- 不要把返回支付链接当作支付成功；订单入账依赖支付宝 notify webhook

## Failure Handling

- 返回 `not_found` 时，说明门店或 SKU 不存在或不在公开范围
- 返回用户不存在或手机号错误时，请用户确认手机号和组织上下文
- 返回支付创建错误时，报告真实错误，不要伪造支付成功
- 返回 `endpoint_not_found`、`timeout`、`network_error` 时，直接报告真实错误，不要猜测订单结果
