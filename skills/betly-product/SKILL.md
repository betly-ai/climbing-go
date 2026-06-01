---
name: betly-product
description: Use when a user asks what card products, passes, memberships, or purchasable climbing products are available at Betly/Banana Climbing stores through the climbing-go CLI.
---

# Product Query

Use this skill only for Betly 一期公开产品能力：card 类型产品列表查询。

## MUST DO

- 开始前先确认 `climbing-go` 已安装并且当前终端可以直接执行
- 所有查询都通过 `climbing-go` 命令完成，不要绕过 CLI 直接请求 MCP
- 只使用命令返回里的真实字段、门店 ID 和产品 ID，不要猜测或编造数据
- 用户说自然语言时，先把问题归一成“查公开产品列表”，再选命令
- 如果用户提到门店名但没有门店 ID，先用 `product list` 的 `--city` 和 `--store-search` 缩小范围

## Scope

- 支持 `product list`
- 当前仅支持公开 card 类型产品列表
- 产品返回中的 `data.products[].variants[].id` 可作为 `betly-order` 的下单 SKU
- 不支持直接在本 skill 内下单、支付、会员私有资产、订单、课程预约或其他未开放数据

## Typical User Phrases

- `深圳有什么卡可以买`
- `深圳香蕉有哪些门票`
- `香蕉攀岩售卡列表`
- `这家店有什么卡`
- `查一下这个门店的月卡`
- `成人单日票多少钱`
- `what products can I buy`
- `list Banana climbing cards in Shenzhen`

## Setup

先确认 CLI 已安装：

```bash
climbing-go --help
```

如果命令不存在，先安装：

```bash
npm install -g climbing-go
```

如果当前是在仓库源码里调试，可以改用本地入口：

```bash
pnpm exec tsx src/index.ts --help
```

## Commands

```bash
climbing-go product list
climbing-go product list --city 深圳
climbing-go product list --city 深圳 --store-search 香蕉 --limit 10
climbing-go product list --city 深圳 --store-search 香蕉 --search 月卡
climbing-go product list --store-id <storeId>
```

`product list` 默认会请求最多 100 条公开产品；显式传入 `--limit`/`--offset` 时才走分页。

## Query Strategy

1. 用户只是在问有什么卡可以买，比如“有什么卡”“有哪些门票”，优先用 `product list`
2. 用户提到了城市，比如“深圳”“上海有哪些卡”，带上 `--city`
3. 用户提到了门店名或关键词，比如“香蕉”“iN”，在列表查询时带上 `--store-search`
4. 用户提到了产品关键词，比如“月卡”“次卡”“单日票”，在列表查询时带上 `--search`
5. 用户给了具体门店 ID，使用 `product list --store-id <storeId>`
6. 如果列表结果有多个可能命中，返回真实候选项让用户确认，不要自行猜测具体产品

## Query Examples

- `深圳有什么卡可以买` -> `climbing-go product list --city 深圳`
- `深圳香蕉有哪些门票` -> `climbing-go product list --city 深圳 --store-search 香蕉 --limit 10`
- `深圳香蕉月卡` -> `climbing-go product list --city 深圳 --store-search 香蕉 --search 月卡 --limit 10`
- `这个门店有什么卡` -> `climbing-go product list --store-id <storeId>`
- `what products can I buy in Shenzhen` -> `climbing-go product list --city 深圳`

## Output

- `product list` 返回 JSON，重点看 `data.store`、`data.products`、`data.products[].variants` 和 `data.count`
- SKU 最小字段为 `id`、`name`、`price`、`original_price`
- 如果用户下一步要购买，使用真实返回的 `data.products[].variants[].id` 作为 `climbing-go order preview/create --variant-id` 的 SKU
- 成功响应包含 `ok`、`tool`、`endpoint` 和 `data`
- 回答价格时只引用 `data.products[].variants` 里真实存在的 SKU 字段；回答卡名、适用门店这类问题时，只引用 `data.products` 和 `data.store` 里真实存在的字段；如果返回里没有，就明确说当前公开数据未提供

## Failure Handling

- 返回 `not_found` 时，说明门店不存在或不在公开范围
- 返回 `endpoint_not_found`、`timeout`、`network_error` 时，直接报告真实错误，不要猜测产品数据
