# Cogiens Harness Gateway（CHG）

> **面向 AI Agent Harness 的开源互操作、路由与治理层。**

[![CI](https://github.com/ericjbe/cogiens-harness-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/ericjbe/cogiens-harness-gateway/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933.svg)](package.json)
[![欢迎 PR](https://img.shields.io/badge/PRs-welcome-EB6100.svg)](CONTRIBUTING.md)

[English](README.md) · [简体中文](README.zh-CN.md) · [开源边界](OPEN_SOURCE_BOUNDARY.md) · [v0.3 联邦运行时](docs/COMBAT_PASSPORTS.md) · [架构 RFC](docs/rfcs/0001-eight-harness-federation.zh-CN.md) · [部署手册](docs/DEPLOYMENT.zh-CN.md) · [常见问题](docs/FAQ.md) · [开发适配器](docs/BUILD_AN_ADAPTER.md) · [路线图](docs/ROADMAP.md)

**Cogiens Harness Gateway 是一个采用 MIT 许可证、厂商中立的网关。一个应用可以通过统一的 Adapter Contract，发现、调用、观察、审批、取消和审计多个有状态的 AI Agent Harness。**

**开放 CHG，不开放 Cogiens。** 本仓库只包含 CHG 公共核心。Cogiens Business System 及所有专有商业系统均为闭源，不属于本仓库。公开 API、Schema、SDK 或接入协议，不等于公开其背后的实现。规范边界见 [OPEN_SOURCE_BOUNDARY.md](OPEN_SOURCE_BOUNDARY.md)。

当产品需要同时协调代码、研究或企业 Agent Runtime，而又不希望为每一家厂商分别硬编码会话、事件、审批、取消和产物逻辑时，可以使用 CHG。

唯一官方仓库：[github.com/ericjbe/cogiens-harness-gateway](https://github.com/ericjbe/cogiens-harness-gateway)

## 为什么需要 CHG

模型正在变得可替换，Harness 还没有。

Harness 是模型外围的执行系统，负责会话、工具、文件、审批、运行状态和产物。不同 Harness 对这些能力的表达方式不同。CHG 提供统一的控制边界，同时不伪造任何厂商并不具备的能力。

### CHG 不是另一个模型 API 路由器

| 模型 API 路由器 | Cogiens Harness Gateway |
|---|---|
| 选择模型推理端点 | 选择并治理有状态的 Agent Harness |
| 路由提示词和模型响应 | 协调会话、运行、事件、审批、取消和产物 |
| 通常以无状态请求为中心 | 保留 Job、Run、Session、Trace 和工作区身份 |
| 优化模型、价格、延迟或供应商 | 规范能力、策略、证据和执行生命周期 |
| 返回文本或结构化模型输出 | 产生可审计事件流和有完整性校验的产物 |

两者可以组合使用：模型路由器负责选择模型端点；CHG 负责治理实际执行工作的 Harness。

## 当前真实状态

`v0.3.0-alpha.1` 实现“八 Harness 联邦”的第一个有界运行切片：零新增依赖的 Registry Loader、能力状态、证据门控的支持状态转换、只读 HTTP/CLI 查询，以及首份 H01 Codex Combat Passport。v0.2 Job fan-out 保持兼容，Adapter Contract v0.1 仍是当前规范。

| 组件 | 状态 |
|---|---|
| Adapter Contract v0.1 | 已发布 |
| JSON Schemas | 已发布 |
| Adapter SDK 基础能力 | 已发布 |
| 内存 Mock Adapter | 已通过一致性测试 |
| 本地 HTTP 控制面与有界并行 fan-out | 部署候选 |
| Codex CLI one-shot Adapter | 候选；要求本机已安装并登录 |
| Hermes CLI one-shot Adapter | 候选；要求本机已安装并配置 Provider |
| DeepSeek Harness Python SDK Adapter | 候选；Windows 建议通过 WSL2 运行 |
| 八 Harness 联邦 Registry Runtime | P2-A Alpha；已实现加载与只读查询 |
| Adapter Contract v0.3 | 草案；v0.1 仍是当前规范 |
| Harness Registry v0.3 | 已由运行时加载；H01 为 `CONFORMANCE_PARTIAL`，H02-H08 仍为 `DECLARED_UNVERIFIED` |
| H01 Codex Combat Passport | 公开证据记录；`NOT_READY`，不构成生产认证 |
| Linux / Windows，Node.js 20 / 22 CI | 已验证 |
| 生产认证厂商适配器 | 规划中，尚未发布 |
| 可移植 Digital Job Pack Contract | 公开设计中，尚未稳定 |
| 托管、企业及其他 Cogiens 专有系统 | 不属于本仓库，也不属于 CHG MIT 公共核心 |

Codex、Hermes 和 DeepSeek Harness 已有 one-shot 部署候选，但还没有生产认证。Grok 与 Qwen 可以先作为 Hermes 的模型 Provider 使用，这不等于已经存在独立的 Grok/Qwen Harness Adapter。准确状态见[适配器目录](docs/ADAPTER_CATALOG.md)。

## v0.3 八 Harness 联邦注册表运行时

公开架构队列包括 OpenAI Codex、Anthropic Claude Code、xAI Grok Build、Moonshot Kimi Code、DeepSeek Harness、Qwen Code、Google Antigravity CLI 和 Mistral Vibe。它们是第一优先级的**架构目标**，不是整体支持声明。H02-H08 仍为 `DECLARED_UNVERIFIED`。H01 只升级到 `CONFORMANCE_PARTIAL`：官方无交互/JSON 接口和适配器单元测试已有公开证据，但本机构建环境没有 Codex 可执行文件，登录、上游版本、平台矩阵和生产门槛尚未验证。

Registry 已经运行，不代表八个厂商 Adapter 都已运行。请审阅[Combat Passport 规则](docs/COMBAT_PASSPORTS.md)、[H01 证据](config/combat-passports/H01.openai-codex.v0.3-alpha.1.json)、[中文架构预览](docs/rfcs/0001-eight-harness-federation.zh-CN.md)、[v0.3 Adapter Contract 草案](docs/contracts/adapter-contract.v0.3-draft.md)、[Registry](config/harness-registry.v0.3.yaml)和[迁移计划](docs/migrations/v0.2-to-v0.3.md)。

## 快速开始

需要 Node.js 20 或更新版本。

```bash
git clone https://github.com/ericjbe/cogiens-harness-gateway.git
cd cogiens-harness-gateway
npm run verify
npm run example:mock
```

Gateway 本身没有 npm 运行时依赖；各厂商 Harness 需要独立安装和认证。Windows/WSL2 的完整命令见[部署手册](docs/DEPLOYMENT.zh-CN.md)。

Gateway 启动后可以只读查询联邦状态：

```bash
node scripts/chg.mjs federation
node scripts/chg.mjs harness H01
node scripts/chg.mjs capabilities H01
node scripts/chg.mjs passport H01
```

## 参与建设

开放生态只围绕 CHG 公共核心展开，包括：

1. **Harness Adapter：** 把一个厂商或社区 Harness 接入统一契约。
2. **公共 Digital Job Pack 标准：** 研究可移植任务格式、输入、权限、审批、证据与测试。

公开“任务格式标准”不等于公开 Cogiens 的商业岗位实现、商业 Prompt、工作流包或内部运营逻辑。后者不属于本仓库，除非另行明确批准采用 MIT 许可证公开。

当前可以立即贡献适配器、测试、文档和协议设计。Digital Job Pack Contract 还没有冻结，必须先通过公开 RFC 共同定义，不能把未来目标描述成已实现功能。

- [20 分钟适配器指南](docs/BUILD_AN_ADAPTER.md)
- [提出 Harness Adapter](https://github.com/ericjbe/cogiens-harness-gateway/issues/new?template=adapter.yml)
- [提出 Digital Job Pack](https://github.com/ericjbe/cogiens-harness-gateway/issues/new?template=digital-job-pack.yml)
- [寻找第一个贡献](https://github.com/ericjbe/cogiens-harness-gateway/contribute)
- [贡献规则](CONTRIBUTING.md)

所有提交都需要 DCO 签署，并必须通过 Commercial Boundary Gate。公共仓库贡献采用 MIT 许可证。不得提交密钥、客户数据、厂商会话文件、专有代码或许可证不兼容的代码。

## 开源边界原则

CHG 的公共代码只负责 Harness 互操作基础设施。Cogiens 的商业系统、客户系统、商业任务编排、商业岗位实现、内部 Prompt、定价/结算/收入逻辑、内部运营规则和其他专有实现均不属于本仓库。

每一个 PR 在进入公共仓库前都必须回答：

> 如果竞争对手明天 Fork 本仓库，并依法根据 MIT 将这项修改用于商业产品，我们是否明确愿意允许？

只有答案为无条件的“是”，才允许进入公共仓库；否则必须留在私有系统中。

## Star、关注与传播

如果你认同开放的 Harness 互操作层：

1. 给仓库一个 **Star**，让真实需求被看见；
2. **Watch** Releases，关注契约与适配器更新；
3. 提交 Issue，告诉我们你需要接入的 Harness 或公共互操作能力；
4. 用测试、证据和 Commercial Boundary 声明提交 PR。

Star 不是产品本身。可工作的适配器、公开一致性证据、稳定契约和持续贡献者才是 CHG 公共核心的价值。

## 许可证与商业边界

- 开源边界：[OPEN_SOURCE_BOUNDARY.md](OPEN_SOURCE_BOUNDARY.md)
- 公共核心：[MIT License](LICENSE)
- 贡献规则：[CONTRIBUTING.md](CONTRIBUTING.md)
- 安全报告：[SECURITY.md](SECURITY.md)
- 项目治理：[GOVERNANCE.md](GOVERNANCE.md)
- 商业边界：[COMMERCIAL.md](COMMERCIAL.md)
- 商标规则：[TRADEMARKS.md](TRADEMARKS.md)
- 机器可读引用：[CITATION.cff](CITATION.cff)

MIT 允许对 CHG 公共核心进行商业使用，但该许可不延伸到 Cogiens 专有系统、托管服务、商业实现、商标、认证、支持或本仓库之外的其他权利。
