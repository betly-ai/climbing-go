---
name: betly-store
description: Use when a user asks where to climb, find a climbing gym or bouldering gym, search Betly public stores by city or keyword, or check store details such as address and opening hours through the climbing-go CLI in a terminal session.
---

# Store Query

Use this skill only for Betly 一期公开门店能力：门店列表查询和门店详情查询。

## MUST DO

- 开始前先确认 `climbing-go` 已安装并且当前终端可以直接执行
- 所有查询都通过 `climbing-go` 命令完成，不要绕过 CLI 直接请求 MCP
- 只使用命令返回里的真实字段和门店 ID，不要猜测或编造数据
- 用户说自然语言时，先把问题归一成“查门店列表”或“查门店详情”，再选命令
- 如果用户问“几点开门”“营业到几点”“地址在哪”“电话多少”，先用 `store list` 缩小范围，再用 `store get` 看详情

## Scope

- 支持 `store list`
- 支持 `store get`
- 不支持课程、会员、订单、私有门店或其他未开放数据

## Typical User Phrases

- `找岩馆`
- `找攀岩馆`
- `去攀岩`
- `深圳哪里攀岩`
- `上海哪里有岩馆`
- `北京攀岩馆`
- `香蕉攀岩在哪里`
- `深圳香蕉几点开门`
- `这家店地址是什么`
- `营业时间是什么`
- `find a climbing gym`
- `where can I climb in Shanghai`
- `bouldering gym in Shenzhen`
- `what time does it open`
- `what are the opening hours`

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
climbing-go store list
climbing-go store list --city 上海 --search 香蕉
climbing-go store list --city 上海 --search 香蕉 --limit 10
climbing-go store get store_123
```

`store list` 默认会请求最多 100 条公开门店，足够覆盖当前全部公开门店；显式传入 `--limit`/`--offset` 时才走分页。

## Query Strategy

1. 用户只是在找店，比如“找岩馆”“去攀岩”“哪里攀岩”，优先用 `store list`
2. 用户提到了城市，比如“深圳”“上海”“北京哪里攀岩”，带上 `--city`
3. 用户提到了店名或关键词，比如“香蕉攀岩”，在列表查询时带上 `--search`
4. 用户在问地址、电话、营业时间、几点开门这类详情，先找到候选门店，再用 `store get <storeId>`
5. 如果列表结果有多个可能命中，返回真实候选项让用户确认，不要自行猜测具体门店

## Query Examples

- `找岩馆` -> `climbing-go store list`
- `深圳哪里攀岩` -> `climbing-go store list --city 深圳`
- `上海香蕉攀岩` -> `climbing-go store list --city 上海 --search 香蕉 --limit 10`
- `深圳香蕉几点开门` -> 先 `climbing-go store list --city 深圳 --search 香蕉 --limit 10`，再 `climbing-go store get <storeId>`
- `find a climbing gym in Beijing` -> `climbing-go store list --city 北京`
- `what time does Banana climb open in Shenzhen` -> 先 `climbing-go store list --city 深圳 --search 香蕉 --limit 10`，再 `climbing-go store get <storeId>`

## Output

- `store list` 返回 JSON，重点看 `data.stores` 和 `data.count`
- `store get` 返回 JSON，重点看 `data.store`
- 成功响应包含 `ok`、`tool`、`endpoint` 和 `data`
- 回答“几点开门”这类问题时，只引用 `data.store` 里真实存在的营业时间字段；如果返回里没有，就明确说当前公开数据未提供

## Failure Handling

- 返回 `not_found` 时，说明门店 ID 不存在或不在公开范围
- 返回 `endpoint_not_found`、`timeout`、`network_error` 时，直接报告真实错误，不要猜测门店数据
