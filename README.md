# climbing-go

Betly 攀岩 CLI 一期骨架，当前聚焦公开门店查询命令与 MCP endpoint 配置。

## 开发

```bash
pnpm install
pnpm test
pnpm build
```

## 用法

```bash
pnpm exec tsx src/index.ts --help
pnpm exec tsx src/index.ts config set endpoint https://mcp.example.com
pnpm exec tsx src/index.ts config get endpoint
pnpm exec tsx src/index.ts store list
pnpm exec tsx src/index.ts store get store_123
```

也可以通过环境变量覆盖 endpoint：

```bash
CLIMBING_MCP_ENDPOINT=https://mcp.example.com pnpm exec tsx src/index.ts store list
```

## Skill

仓库内提供了最小可用的 AI skill：`skills/betly-store/SKILL.md`。

推荐先配置一次 MCP endpoint：

```bash
climbing-go config set endpoint https://mcp.example.com
```

之后就可以让 agent 复用下面这组最小示例：

```bash
climbing-go store list --city 上海
climbing-go store get store_123
```

## 当前状态

- 已支持通过 MCP 查询公开门店列表与详情
- 已支持本地持久化配置攀岩 MCP endpoint
- 已提供最小可用 skill，可在 AI Agent 场景中复用门店查询能力

## Release

仓库使用 `semantic-release` 自动发布 npm 包。

- 发布触发：推送到 `main` 或手动触发 `release-climbing-go` workflow
- 发布前检查：固定校验 git 身份为 `betlysaas <betly@mx5.cn>`，并校验 npm 登录身份
- 需要的仓库配置：
  - `NPM_TOKEN`：对应 `betly@mx5.cn` 账号的 npm automation token
  - `NPM_EXPECTED_USER`：npm 发布用户名，默认 `betlysaas`
  - `RELEASE_MCP_ENDPOINT`：发布后 smoke test 使用的 MCP 地址

本地可先执行：

```bash
pnpm release:verify
pnpm release --dry-run
```
