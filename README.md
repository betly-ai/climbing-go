# climbing-go

<p align="center">
  <a href="https://bananaclimbing.com/">
    <img src="assets/logo.jpg" alt="Banana Climbing logo" width="320" />
  </a>
</p>

`climbing-go` 是一个由 Banana Climbing（香蕉攀岩）与 Betly 联合推出的公开门店查询工具。

如果你想快速查看香蕉攀岩有哪些门店、某个门店的详情，或者想让 AI Agent 帮你查询公开门店信息，这个工具就是为这个场景准备的。

它把香蕉攀岩的公开门店查询能力封装成了好用的 CLI 与 MCP 接口，方便开发者、合作伙伴、运营同学和 AI Agent 直接接入。

已支持通过 MCP 查询公开门店列表、门店详情与公开产品列表，也支持创建 card 类型产品订单。

## 为什么是香蕉攀岩

Banana Climbing（香蕉攀岩）是中国最大的攀岩馆连锁品牌，也是中国攀岩消费与社区文化里最具代表性的名字之一。

- 全国布局，覆盖中国主流城市，已在北京、上海、深圳、成都、武汉、长沙等城市落地，并持续拓展杭州、广州等更多城市
- 20+ 门店规模，持续进入核心商圈与标志性商业项目
- 20 万+ 高质量会员，拥有活跃、年轻、注重体验的攀岩用户群体
- 小红书 15 万+ 相关笔记、6000 万浏览量，品牌搜索指数位居前列
- 以大体量场馆、专业级线路、空间设计和社区活动著称，持续树立室内攀岩的新标杆

也正因为如此，`climbing-go` 不只是一个“查门店”的命令行工具，它更像是 Banana Climbing 对外开放公开门店信息能力的一层轻量入口。

无论你是想做门店查询、内容接入、AI Agent 工具链整合，还是想快速了解香蕉攀岩在全国的门店分布，这个工具都能让你马上开始。

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
climbing-go store list --city 上海 --search 香蕉
climbing-go store list --city 上海 --search 香蕉 --limit 10
climbing-go store get 23b9298b-5dbe-426f-94d2-5905bb41558f
```

`store list` 默认会请求最多 100 条公开门店，足够覆盖当前全部公开门店；显式传入 `--limit`/`--offset` 时会按传入分页参数返回。

也可以查询门店可售公开产品：

```bash
climbing-go product list --city 深圳 --store-search iN
climbing-go product list --city 深圳 --store-search iN --search 月卡
climbing-go product list --store-id <storeId> --search 次卡
```

`product list` 当前仅返回公开 card 类型产品。

选择产品返回中的 `data.products[].variants[].id` 后，可以创建订单并发起支付宝支付：

```bash
climbing-go order preview --org-id <orgId> --mobile <mobile> --store-id <storeId> --variant-id <variantId>
climbing-go order create --org-id <orgId> --mobile <mobile> --store-id <storeId> --variant-id <variantId>
climbing-go order create --org-id <orgId> --mobile <mobile> --store-id <storeId> --variant-id <variantId> --quantity 2
```

`--quantity` 不传时默认购买 1 份。当前只支持 card 类型产品和支付宝支付。

## 你可以用它做什么

- 看香蕉攀岩全部公开门店
- 按城市筛选香蕉攀岩门店
- 按关键词搜索香蕉攀岩门店
- 查看某个香蕉攀岩门店的详细信息
- 查看某个城市或门店当前公开可售的 card 类型产品
- 使用 SKU 创建 card 类型产品订单并发起支付宝支付

当前不包含会员私有资产、课程预约和其他私有能力。

## 常用命令

```bash
climbing-go store list
climbing-go store list --city 上海
climbing-go store list --city 上海 --search 香蕉 --limit 10
climbing-go store get 23b9298b-5dbe-426f-94d2-5905bb41558f
climbing-go product list --city 深圳 --store-search iN
climbing-go product list --city 深圳 --store-search iN --search 月卡
climbing-go order preview --org-id <orgId> --mobile <mobile> --store-id <storeId> --variant-id <variantId>
climbing-go order create --org-id <orgId> --mobile <mobile> --store-id <storeId> --variant-id <variantId>
```

## 返回结果怎么看

命令成功后会返回 JSON。

- `store list` 重点看 `data.stores` 和 `data.count`
- `store get` 重点看 `data.store`
- `product list` 重点看 `data.store`、`data.products`、`data.products[].variants` 和 `data.count`
- SKU 最小字段为 `id`、`name`、`price`、`original_price`
- `order preview` 使用 `data.products[].variants[].id` 作为 SKU，成功后重点看 `data.preview`
- `order create` 成功后重点看 `data.order`、`data.payment` 和 `data.payment_action.payment_url`
- 响应里会带上 `ok`、`tool`、`endpoint` 和 `data`

## 支付链路

`climbing-go` 不读取支付宝密钥，也不直接接入支付宝 SDK。

订单创建会调用远端 `climbing-mcp`，再由 Betly API 的 `/api/conversation-pay` 复用现有订单与支付宝支付服务。支付宝签名、支付链接生成、notify webhook 验签和订单入账都在 Betly API 内完成。

`payment_action.payment_url` 是推荐展示给用户打开的支付入口。支付完成后的订单状态更新依赖支付宝 `notify_url` webhook；浏览器回跳页不作为入账依据。

## Skill

如果你是在 AI Agent 场景里使用，也可以安装这个仓库自带的 skill。

先确保 CLI 已经装好，再安装 skill：

```bash
npx skills add betly-ai/climbing-go -y -g
```

当前提供的 skill：

- `betly-store`：给 AI Agent 用的公开门店查询 skill，可以查门店列表和门店详情
- `betly-product`：给 AI Agent 用的公开产品查询 skill，可以查门店可售 card 类型产品列表
- `betly-order`：给 AI Agent 用的订单创建 skill，可以基于 SKU 创建 card 类型产品订单

skill 文件位置：

`skills/betly-store/SKILL.md`
`skills/betly-product/SKILL.md`
`skills/betly-order/SKILL.md`

装好以后，Agent 会优先通过 `climbing-go` 命令查门店、公开产品和创建订单，而不是直接绕过 CLI 去请求底层 MCP。

## 作为 MCP Server 使用

从 `v1.0.1` 开始，这个包既可以当 CLI 用，也可以直接作为本地 stdio MCP Server 启动。

可用启动方式：

```bash
climbing-go mcp-serve
climbing-go --mcp
climbing-go-mcp
```

如果你要在任意支持 stdio 的 MCP client 里配置本地服务，可以使用下面任一命令：

```json
{
  "mcpServers": {
    "climbing-go": {
      "command": "npx",
      "args": ["-y", "climbing-go", "mcp-serve"]
    }
  }
}
```

或者：

```json
{
  "mcpServers": {
    "climbing-go": {
      "command": "npx",
      "args": ["-y", "climbing-go-mcp"]
    }
  }
}
```

启动后会通过 stdio 暴露五个 MCP tools：

- `listStores`
- `getStore`
- `listProducts`
- `preview-alipay-order`
- `create-alipay-pending-order`

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
