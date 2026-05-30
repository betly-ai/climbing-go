---
name: betly-order
description: Use when a user wants to create a Betly/Banana Climbing card product order through the climbing-go CLI using a product variant SKU.
---

# Order Creation

Use this skill only for creating card 类型产品订单 through `climbing-go`.

## MUST DO

- 开始前先确认 `climbing-go` 已安装并且当前终端可以直接执行
- 所有下单都通过 `climbing-go order create` 命令完成，不要绕过 CLI 直接请求 MCP
- 只使用 `product list` 返回里的真实 `data.products[].variants[].id` 作为 SKU，不要猜测或编造 SKU
- 如果用户没有给 SKU，先使用 `betly-product` 查询公开 card 类型产品
- 如果用户没有给数量，默认数量为 1
- 不要使用真实支付密钥、真实测试支付数据或仓库外未确认的用户身份

## Scope

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
climbing-go order create --store-id <storeId> --user-id <userId> --item <variantId>
climbing-go order create --store-id <storeId> --user-id <userId> --item <variantId>:2
```

`--item <variantId>` 不传数量时默认 `quantity = 1`。需要多份时使用 `--item <variantId>:<quantity>`，数量必须为正整数。

## Query Strategy

1. 用户已经给出 `store_id`、`user_id` 和 SKU 时，直接创建订单
2. 用户只给产品名或门店信息时，先用 `betly-product` 找到真实 SKU
3. 多个 SKU 都可能命中时，返回真实候选项让用户确认
4. 用户没有说明数量时，按 1 创建订单
5. 用户要求非 card 产品、课程预约或复杂订单时，说明当前 CLI 未开放

## Output

- `order create` 返回 JSON，重点看 `data.order` 和 `data.payment`
- `data.order.status` 为订单状态
- `data.payment.channel` 当前应为 `alipay`
- 不要把支付 payload 当作支付成功；它只代表支付发起信息

## Failure Handling

- 返回 `not_found` 时，说明门店或 SKU 不存在或不在公开范围
- 返回支付配置错误时，说明支付宝配置缺失或不可用，不要伪造支付成功
- 返回 `endpoint_not_found`、`timeout`、`network_error` 时，直接报告真实错误，不要猜测订单结果
