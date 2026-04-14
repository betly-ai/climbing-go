---
name: betly-store
description: Use when an AI agent needs Betly climbing store list or store detail data through the climbing-go CLI in a terminal session.
---

# Store Query

Use this skill only for 一期公开门店能力：门店列表查询和门店详情查询。

## MUST DO

- 开始前先确认 `climbing-go` 已安装并且当前终端可以直接执行
- 所有查询都通过 `climbing-go` 命令完成，不要绕过 CLI 直接请求 MCP
- 只使用命令返回里的真实字段和门店 ID，不要猜测或编造数据

## Scope

- 支持 `store list`
- 支持 `store get`
- 不支持课程、会员、订单、私有门店或其他未开放数据

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
climbing-go store list --city 上海 --search 香蕉 --limit 10
climbing-go store get store_123
```

## Output

- `store list` 返回 JSON，重点看 `data.stores` 和 `data.count`
- `store get` 返回 JSON，重点看 `data.store`
- 成功响应包含 `ok`、`tool`、`endpoint` 和 `data`

## Failure Handling

- 返回 `not_found` 时，说明门店 ID 不存在或不在公开范围
- 返回 `endpoint_not_found`、`timeout`、`network_error` 时，直接报告真实错误，不要猜测门店数据
