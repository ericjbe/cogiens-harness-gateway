# Cogiens Harness Gateway（CHG）

> **面向 AI Agent Harness 的开源互操作、路由与治理层。**

[![CI](https://github.com/ericjbe/cogiens-harness-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/ericjbe/cogiens-harness-gateway/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933.svg)](package.json)
[![欢迎 PR](https://img.shields.io/badge/PRs-welcome-EB6100.svg)](CONTRIBUTING.md)

[English](README.md) · [简体中文](README.zh-CN.md) · [v0.3 八 Harness 架构预览](docs/rfcs/0001-eight-harness-federation.zh-CN.md) · [部署手册](docs/DEPLOYMENT.zh-CN.md) · [常见问题](docs/FAQ.md) · [开发适配器](docs/BUILD_AN_ADAPTER.md) · [路线图](docs/ROADMAP.md)

**Cogiens Harness Gateway 是一个采用 MIT 许可证、厂商中立的网关。一个应用可以通过统一的 Adapter Contract，发现、调用、观察、审批、取消和审计多个有状态的 AI Agent Harness。**

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

`v0.2.0` 在经过验证的 P0 公共核心上增加了可运行的本地部署候选；它不是生产级托管服务，也不代表生产认证。`v0.3.0-architecture-freeze` 是“八 Harness 联邦”的纯文档公开预览；当前真正实现的运行时仍是 v0.2。

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
| 八 Harness 联邦 RFC | 架构方向已冻结并公开征求意见；尚未实现 |
| Adapter Contract v0.3 | 草案；v0.1 仍是当前规范 |
| Harness Registry v0.3 | 仅为架构数据；H01-H08 全部为 `DECLARED_UNVERIFIED` |
| Linux / Windows，Node.js 20 / 22 CI | 已验证 |
| 生产认证厂商适配器 | 规划中，尚未发布 |
| 可移植 Digital Job Pack Contract | 公开设计中，尚未稳定 |
| Cogiens Cloud 与企业模块 | 独立商业范围 |

Codex、Hermes 和 DeepSeek Harness 已有 one-shot 部署候选，但还没有生产认证。Grok 与 Qwen 可以先作为 Hermes 的模型 Provider 使用，这不等于已经存在独立的 Grok/Qwen Harness Adapter。准确状态见[适配器目录](docs/ADAPTER_CATALOG.md)。

## v0.3 八 Harness 联邦架构公开预览

公开架构队列包括 OpenAI Codex、Anthropic Claude Code、xAI Grok Build、Moonshot Kimi Code、DeepSeek Harness、Qwen Code、Google Antigravity CLI 和 Mistral Vibe。它们是第一优先级的**架构目标**，不是当前支持声明。每一个目标都从 `DECLARED_UNVERIFIED` 开始，只有取得公开、可复验的 Combat Passport 证据后才能升级支持状态。

因此，CHG 是面向多 Harness 编排和 AI Agent Harness 互操作的开放基础设施，不是模型路由器，也没有声称八个厂商运行时已经接通。请审阅[中文架构预览](docs/rfcs/0001-eight-harness-federation.zh-CN.md)、[完整英文 RFC](docs/rfcs/0001-eight-harness-federation.md)、[v0.3 Adapter Contract 草案](docs/contracts/adapter-contract.v0.3-draft.md)、[Registry](config/harness-registry.v0.3.yaml)和[迁移计划](docs/migrations/v0.2-to-v0.3.md)。

## 快速开始

需要 Node.js 20 或更新版本。

```bash
git clone https://github.com/ericjbe/cogiens-harness-gateway.git
cd cogiens-harness-gateway
npm run verify
npm run example:mock
```

Gateway 本身没有 npm 运行时依赖；各厂商 Harness 需要独立安装和认证。Windows/WSL2 的完整命令见[部署手册](docs/DEPLOYMENT.zh-CN.md)。

## 参与建设

我们希望形成两个开放生态：

1. **Harness Adapter：** 把一个厂商或社区 Harness 接入统一契约。
2. **Digital Job Pack：** 定义可复用的数字岗位，包括输入、权限、审批、输出、证据和测试。

当前可以立即贡献适配器、测试、文档和协议设计。Digital Job Pack Contract 还没有冻结，必须先通过公开 RFC 共同定义，不能把未来目标描述成已实现功能。

- [20 分钟适配器指南](docs/BUILD_AN_ADAPTER.md)
- [提出 Harness Adapter](https://github.com/ericjbe/cogiens-harness-gateway/issues/new?template=adapter.yml)
- [提出 Digital Job Pack](https://github.com/ericjbe/cogiens-harness-gateway/issues/new?template=digital-job-pack.yml)
- [寻找第一个贡献](https://github.com/ericjbe/cogiens-harness-gateway/contribute)
- [贡献规则](CONTRIBUTING.md)

所有提交都需要 DCO 签署，公共仓库贡献采用 MIT 许可证。不得提交密钥、客户数据、厂商会话文件、专有代码或许可证不兼容的代码。

## Star、关注与传播

如果你认同开放的 Harness 互操作层：

1. 给仓库一个 **Star**，让真实需求被看见；
2. **Watch** Releases，关注契约与适配器更新；
3. 提交 Issue，告诉我们你需要接入的 Harness 或数字岗位；
4. 用测试与证据提交 PR。

Star 不是产品本身。可工作的适配器、可复现的数字岗位、公开的一致性证据和持续贡献者才是产品。

## 许可证与商业边界

- 公共核心：[MIT License](LICENSE)
- 安全报告：[SECURITY.md](SECURITY.md)
- 项目治理：[GOVERNANCE.md](GOVERNANCE.md)
- 商业范围：[COMMERCIAL.md](COMMERCIAL.md)
- 商标规则：[TRADEMARKS.md](TRADEMARKS.md)
- 机器可读引用：[CITATION.cff](CITATION.cff)

MIT 允许商业使用；Cogiens 商标、托管服务、企业模块、认证、支持与 SLA 不包含在公共核心许可中。
