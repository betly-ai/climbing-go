---
name: betly-store
description: Use when an AI agent needs Betly climbing store list or store detail data through the climbing-go CLI in a terminal session.
---

# Public Store Query

Use this skill only for一期公开门店能力：门店列表查询和门店详情查询。

## Scope

- 支持 `store list`
- 支持 `store get`
- 不支持课程、会员、订单、私有门店或其他未开放数据

## Setup

1. 先检查本地是否已经配置 endpoint：

```bash
climbing-go config get endpoint
```

2. 如果还没有配置，优先持久化保存：

```bash
climbing-go config set endpoint <url>
```

3. 也可以用环境变量临时覆盖：

```bash
CLIMBING_MCP_ENDPOINT=https://mcp.example.com climbing-go store list
```

4. 如果当前是在仓库源码里调试，直接用本地入口：

```bash
pnpm exec tsx src/index.ts store list
```

## Commands

```bash
climbing-go store list
climbing-go store list --city 上海 --search 香蕉 --limit 10
climbing-go store get store_123
```

## Output

- `store list` 返回 JSON，重点看 `data.stores` 和 `data.count`
- `store get` 返回 JSON，重点看 `data.store`
- 成功响应会包含 `ok`、`tool`、`endpoint` 和 `data`

## Failure Handling

- 提示缺少 endpoint 时，先运行 `climbing-go config set endpoint <url>`
- 返回 `not_found` 时，说明门店 ID 不存在或不在公开范围
- 返回 `endpoint_not_found`、`timeout`、`network_error` 时，直接报告真实错误，不要猜测门店数据
