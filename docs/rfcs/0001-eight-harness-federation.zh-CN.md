# RFC 0001：八 Harness 联邦架构

状态：架构冻结公开预览
发布标签：`v0.3.0-architecture-freeze`
运行基线：`v0.2.0-deployment-candidate`
公共项目名称：Cogiens Harness Gateway（CHG）
内部架构工作名称：Cogiens Joint Harness Gate

## 1. 冻结结论

v0.3 不推倒 v0.2。已经验证的本地 HTTP 控制面、Job/Run、有界 fan-out、超时、取消、事件、产物、SHA-256、preflight 和禁止 Mock 假成功全部保留。

v0.3 在此基础上增加永久可扩展的 Harness Registry、Capability Registry、Combat Passport、独立工作树、产物归集、联合评审和遥测证据。

本预览冻结的是架构方向，**不代表八个 Harness 已经安装、接入、通过一致性测试或获得生产认证。**

## 2. 八 Harness 编成

`FIRST_CLASS` 表示路线图优先级，不表示已经支持。真实状态由 `support_status` 和证据决定。

| ID | 接入目标 | 厂商 | 候选命令 | 架构等级 | 初始支持状态 |
|---|---|---|---|---|---|
| H01 | OpenAI Codex | OpenAI | `codex` | FIRST_CLASS | DECLARED_UNVERIFIED |
| H02 | Claude Code | Anthropic | `claude` | FIRST_CLASS | DECLARED_UNVERIFIED |
| H03 | Grok Build | xAI | `grok` | FIRST_CLASS | DECLARED_UNVERIFIED |
| H04 | Kimi Code | Moonshot AI | `kimi` | FIRST_CLASS | DECLARED_UNVERIFIED |
| H05 | DeepSeek Harness | DeepSeek | `dsh` | FIRST_CLASS | DECLARED_UNVERIFIED |
| H06 | Qwen Code | Alibaba/Qwen | `qwen` | FIRST_CLASS | DECLARED_UNVERIFIED |
| H07 | Antigravity CLI | Google | `agy` | FIRST_CLASS | DECLARED_UNVERIFIED |
| H08 | Mistral Vibe | Mistral AI | `vibe` | FIRST_CLASS | DECLARED_UNVERIFIED |

Hermes 调整为 `AUXILIARY_COMPATIBILITY`，服务于回退、本地模型、实验 Provider、协议兼容和对比测试。它不能被宣传为其他厂商的原生 Harness。

## 3. 永久原则

1. Harness 数量不得写死，未来 H09/H10 可通过 Registry 加入。
2. 原生厂商 Harness 优先，其次是官方 SDK/Runtime，再其次才是辅助 Harness 和人工桥接。
3. 不抓取交互式界面来伪造稳定协议。
4. 未安装、未登录、能力缺失和取消未确认必须明确失败。
5. 安装成功不等于自主执行能力。

## 4. 八层能力链

```text
操作员/控制面
  -> 联合开发指挥
  -> Cogiens Harness Gateway
  -> Harness Registry
  -> Capability Registry
  -> Mission Router
  -> Context Pack Builder
  -> Sandbox / Worktree Gate
  -> Artifact Intake
  -> Review / Red Team Workflow
  -> Telemetry / Evidence / Cost
  -> H01..H08 与辅助 Harness
```

## 5. Combat Passport

每个接入必须提交14项证据：安装来源、版本、认证、无交互入口、工作区读写、Shell、测试、结构化输出、会话恢复、确认取消、隔离、产物与用量、Trace证据。

最终只能得到以下状态之一：

- `NATIVE_AUTONOMOUS`
- `LIMITED_AUTONOMOUS`
- `HUMAN_BRIDGED`
- `NOT_READY`

## 6. 安全与隔离

多个 Harness 不得共用同一个可写工作树。每个 Run 必须拥有独立 Session、Sandbox/Worktree、事件、产物、SHA-256和终态。

默认禁止生产写入、生产数据库、密钥导出、付款动作以及未经变更申请的规范性修改。Secret不得进入Context Pack。

## 7. 联合工作流

```text
Lead分配
  -> Submission
  -> Collaborator Review
  -> Red Team
  -> Rework
  -> Joint Integration
  -> Acceptance
  -> Operator Freeze
```

任何阶段都不得把失败、取消、超时或不支持伪装成成功。

## 8. 迁移与实施

v0.2 的 HTTP API、Job/Run、fan-out、Timeout、Cancel、Event、SHA-256 Artifact 和本地探测逻辑继续作为兼容锚点。静态适配器配置逐步迁入 Registry，不进行大爆炸式重写。

实施顺序：v0.2审计 → 八Harness普查 → 契约评审 → Registry → Combat Passport → Worktree隔离 → 逐个适配器 → 联合评审工作流 → 控制面投影。

## 9. 开源与商业边界

Registry、契约草案、一致性规则、公共适配器和本地联邦核心进入MIT公共核心。托管编排、企业身份、托管Runner、认证、计费、SLA和Cogiens专有业务模块属于独立商业范围。

厂商名称只表示接入目标，不代表厂商认可或合作。使用者自行负责账号、许可证、服务条款和费用。

## 10. 冻结边界

本RFC冻结“Registry + Capability + Combat Passport + Isolation + Artifact Intake + Joint Workflow + Telemetry”的方向；它不冻结方法级Schema，也不认证H01-H08。真正支持必须经过公开评审、实现、一致性证据和平台测试。
