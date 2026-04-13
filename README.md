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

## 当前状态

- 已提供 `store list` / `store get` 命令骨架
- 已支持本地持久化配置攀岩 MCP endpoint
- 当前 `store` 命令输出的是待接入 MCP 的占位结果，后续可直接替换为真实 MCP 调用
