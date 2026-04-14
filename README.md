# climbing-go

Betly 攀岩 CLI，提供公开门店查询能力，并为 AI Agent 提供可直接复用的 skill。

已支持通过 MCP 查询公开门店列表与详情。

## Install

```bash
npm install -g climbing-go
climbing-go --help
```

## Skill

仓库内提供 skill 入口：

`skills/betly-store/SKILL.md`

使用前先确保 `climbing-go` 已安装，并且当前终端可以直接执行该命令。

Skill 默认通过 CLI 调用能力，不直接绕过 CLI 请求底层 MCP。

## Commands

```bash
climbing-go store list
climbing-go store list --city 上海 --search 香蕉 --limit 10
climbing-go store get store_123
```

## Output

- 所有成功结果都返回 JSON
- `store list` 重点查看 `data.stores` 和 `data.count`
- `store get` 重点查看 `data.store`
- 响应包含 `ok`、`tool`、`endpoint` 和 `data`

## Scope

- 公开门店列表查询
- 公开门店详情查询
- 当前不包含课程、会员、订单和其他私有能力

## Development

```bash
pnpm install
pnpm test
pnpm build
pnpm exec tsx src/index.ts --help
```

## Release

仓库使用 `semantic-release` 自动发布 npm 包。

- 发布触发：推送到 `main` 或手动触发 `release-climbing-go` workflow
- 发布前检查：固定校验 git 身份为 `betlysaas <betly@mx5.cn>`，并校验 npm 登录身份
- 需要的仓库配置：`NPM_TOKEN`、`NPM_EXPECTED_USER`、`RELEASE_MCP_ENDPOINT`

发布前可先执行：

```bash
pnpm release:verify
pnpm release --dry-run
```
