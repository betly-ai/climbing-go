# climbing-go

`climbing-go` 是一个查询 Betly 攀岩公开门店信息的小工具。

如果你想快速看有哪些门店、某个门店的详情，或者想让 AI Agent 帮你查门店，这个工具就是给这个场景准备的。

已支持通过 MCP 查询公开门店列表与详情。

## 3 分钟开始

先安装 CLI：

```bash
npm install -g climbing-go
```

安装完成后，先确认命令可以直接使用：

```bash
climbing-go --help
```

然后就可以直接查询门店：

```bash
climbing-go store list
climbing-go store get 23b9298b-5dbe-426f-94d2-5905bb41558f
```

## 你可以用它做什么

- 看全部公开门店
- 按城市筛选门店
- 按关键词搜索门店
- 查看某个门店的详细信息

当前不包含课程、会员、订单和其他私有能力。

## 常用命令

```bash
climbing-go store list
climbing-go store list --city 上海
climbing-go store list --city 上海 --search 香蕉 --limit 10
climbing-go store get 23b9298b-5dbe-426f-94d2-5905bb41558f
```

## 返回结果怎么看

命令成功后会返回 JSON。

- `store list` 重点看 `data.stores` 和 `data.count`
- `store get` 重点看 `data.store`
- 响应里会带上 `ok`、`tool`、`endpoint` 和 `data`

## Skill

如果你是在 AI Agent 场景里使用，也可以安装这个仓库自带的 skill。

先确保 CLI 已经装好，再安装 skill：

```bash
npx skills add betly-ai/climbing-go -y -g
```

当前提供的 skill：

- `betly-store`：给 AI Agent 用的公开门店查询 skill，可以查门店列表和门店详情

skill 文件位置：

`skills/betly-store/SKILL.md`

装好以后，Agent 会优先通过 `climbing-go` 命令查门店，而不是直接绕过 CLI 去请求底层 MCP。

## 如果你想自己开发

```bash
pnpm install
pnpm test
pnpm build
pnpm exec tsx src/index.ts --help
```

## 发布说明

这个仓库使用 `semantic-release` 自动发布 npm 包。

- 发布触发：推送到 `main` 或手动触发 `release-climbing-go` workflow
- 发布前检查：固定校验 git 身份为 `betlysaas <betly@mx5.cn>`，并校验 npm 登录身份
- 需要的仓库配置：`NPM_TOKEN`、`NPM_EXPECTED_USER`、`RELEASE_MCP_ENDPOINT`

发布前可以先执行：

```bash
pnpm release:verify
pnpm release --dry-run
```
