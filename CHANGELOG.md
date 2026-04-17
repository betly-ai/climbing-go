## [1.2.1](https://github.com/betly-ai/climbing-go/compare/v1.2.0...v1.2.1) (2026-04-17)


### Bug Fixes

* **security:** 加固 endpoint 配置，防止 SSRF 与凭据泄露 ([#1](https://github.com/betly-ai/climbing-go/issues/1)) ([e2796d4](https://github.com/betly-ai/climbing-go/commit/e2796d47d6a20db7117d653c3bd07106c788f450))
* **发布工作流:** 收紧权限并修复 hono 漏洞依赖 ([#2](https://github.com/betly-ai/climbing-go/issues/2)) ([41b0474](https://github.com/betly-ai/climbing-go/commit/41b04743f7be311c85ea1f391e226efc042c748c))
* **安全审计:** 完整修复 climbing-go 剩余安全与发布风险 ([#4](https://github.com/betly-ai/climbing-go/issues/4)) ([6c98d32](https://github.com/betly-ai/climbing-go/commit/6c98d329af04e86d908e6c8c388a17c4576f64ba))
* **安全校验:** 补齐远端响应、分页参数和本地配置的安全校验 ([#3](https://github.com/betly-ai/climbing-go/issues/3)) ([0af0ab4](https://github.com/betly-ai/climbing-go/commit/0af0ab42addc61944bd3cfb24f7e4c613ae24e26))

# [1.2.0](https://github.com/betly-ai/climbing-go/compare/v1.1.0...v1.2.0) (2026-04-15)


### Features

* **store:** raise default store list limit to 100 for public store queries ([#20](https://github.com/betly-ai/climbing-go/issues/20)) ([a310528](https://github.com/betly-ai/climbing-go/commit/a3105282faf6e303e9223cfc79b508e30a9dbeae))

# [1.1.0](https://github.com/betly-ai/climbing-go/compare/v1.0.1...v1.1.0) (2026-04-15)


### Features

* **mcp:** add stdio server entrypoints for local MCP clients in climbing-go ([#19](https://github.com/betly-ai/climbing-go/issues/19)) ([b35eaaf](https://github.com/betly-ai/climbing-go/commit/b35eaafc9e8c0251e8d576aa73a840edf48ab664))

## [1.0.1](https://github.com/betly-ai/climbing-go/compare/v1.0.0...v1.0.1) (2026-04-14)


### Bug Fixes

* **cli:** package dist entry cleanly and simplify default store docs ([#9](https://github.com/betly-ai/climbing-go/issues/9)) ([a69ffef](https://github.com/betly-ai/climbing-go/commit/a69ffef6b11fe2bf3abdb329daffd4460b9d7e21))

# 1.0.0 (2026-04-14)


### Features

* **cli:** connect climbing MCP store commands to main with structured error output ([#6](https://github.com/betly-ai/climbing-go/issues/6)) ([af62e15](https://github.com/betly-ai/climbing-go/commit/af62e156944cbec19a0bf33bb0cf50987fec51bf))
* **skill:** 添加公开门店查询 skill ([#5](https://github.com/betly-ai/climbing-go/issues/5)) ([90cc350](https://github.com/betly-ai/climbing-go/commit/90cc350aea10757f038e1435c81500e8a27a4dde)), closes [betlysaas/betly#1615](https://github.com/betlysaas/betly/issues/1615)
* **攀岩 CLI:** 初始化基础结构并预留公开门店查询命令 ([#1](https://github.com/betly-ai/climbing-go/issues/1)) ([0ecad26](https://github.com/betly-ai/climbing-go/commit/0ecad26618b4775d618e48e218b4d7bd5a82ea94))
