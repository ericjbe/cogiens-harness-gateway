# Cogiens Harness Gateway v0.2 部署手册

## 结论先行

这个部署包包含一个可运行的本地 HTTP 控制面、真实子进程适配器、并行 fan-out、超时、输出上限、取消、事件、SHA-256 产物和 Windows/WSL2 启停脚本。

它不会附带任何模型账号、API Key 或厂商软件，也不会把“模型后端”冒充为“独立 Harness”。某个适配器只有在可执行文件、认证和健康检查通过后才会启用。

## 应当选择哪种部署

| 目标 | 推荐方式 |
|---|---|
| Codex + Hermes | Windows 原生或 WSL2 |
| Codex + Hermes + DeepSeek Harness | WSL2（推荐） |
| 远程/公网服务 | 当前版本不建议；默认只监听 `127.0.0.1` |

DeepSeek Harness 的已审计 Python SDK 教程声明支持 Linux x64、Linux arm64 和 macOS arm64，未声明 Windows Agent 支持。因此，不把 Windows 原生标记为已支持；在 Windows 上要同时运行三者，请把 Gateway 和三套 Harness 都安装在 WSL2 中。

## 1. 准备 Harness

### Codex

安装 Codex CLI 后执行一次登录，并验证：

```powershell
codex --version
codex login
codex login status
```

Gateway 使用官方稳定的无交互入口 `codex exec --json`，提示词通过 stdin 传入，默认 `workspace-write` 沙箱、`never` 审批和受限网络。不得把 `--yolo` 写进公共默认配置。

### Hermes

安装并完成 Hermes 自己的 Provider 配置，然后验证：

```powershell
hermes --version
hermes chat --query-file -
```

Gateway 使用 Hermes 官方 one-shot 入口 `hermes chat --query-file -`。可以复制一条 Hermes Adapter 配置并指定不同 `provider`，例如 `xai`、`qwen-oauth` 或 `deepseek`；这表示“同一个 Hermes Harness 使用不同模型后端”，不是三个不同 Harness。

### DeepSeek Harness（WSL2）

在 WSL2 内创建 Python 虚拟环境并安装发布的 SDK：

```bash
python3 -m venv .venv-dsh
. .venv-dsh/bin/activate
python -m pip install deepseek-harness-sdk
export DEEPSEEK_API_KEY='在你自己的安全环境中设置，不要写入仓库'
python -c "import deepseek_harness; print('ok')"
```

若使用虚拟环境，把 `config/harnesses.local.json` 中 DeepSeek Adapter 的 `command` 改成该虚拟环境 Python 的绝对路径。

## 2. 安装 Gateway

### Windows 原生

在解压目录打开 PowerShell：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\deploy\windows\Install-CHG.ps1
.\deploy\windows\Start-CHG.ps1
.\deploy\windows\Test-CHG.ps1
```

### WSL2

不要混用 Windows 和 WSL 的 Harness 安装。进入 WSL 后，在 Linux 文件系统或 `/mnt/f/...` 中打开本目录：

```bash
bash deploy/wsl/install.sh
bash deploy/wsl/start.sh
bash deploy/wsl/test.sh
```

检测脚本会更新被 Git 忽略的本机文件 `config/harnesses.local.json`：只有通过 preflight 的 Adapter 才设为 `enabled: true`。安装或登录新的 Harness 后重新执行：

```bash
node scripts/detect-adapters.mjs
```

## 3. 让多个 Harness 同时工作

把任务写入 `task.txt`，然后执行：

```powershell
node scripts/chg.mjs fanout --workspace "F:\your-project" --prompt-file task.txt --adapters openai.codex.cli,nous.hermes.cli --concurrency 2 --timeout 1800
```

WSL2 示例：

```bash
node scripts/chg.mjs fanout \
  --workspace /mnt/f/your-project \
  --prompt-file task.txt \
  --adapters openai.codex.cli,nous.hermes.cli,deepseek.harness.python \
  --concurrency 3 \
  --timeout 1800
```

Gateway 会为一个 Job 建立三个独立 Run，再由有界并发器同时启动。每个 Run 有独立 Session ID、事件、终态和 SHA-256 结果产物；部分失败不会抹掉其他 Harness 的成功结果。

## 4. 验收标准

```bash
npm run verify
node scripts/chg.mjs adapters
node scripts/chg.mjs health
```

必须同时满足：

- Gateway `/health` 可访问；
- 目标 Adapter 为 `enabled: true` 且 `health.status` 为 `healthy`；
- fan-out Job 最终为 `COMPLETED` 或可解释的 `PARTIAL`；
- 每个成功 Run 有且只有一个终态事件和至少一个 SHA-256 产物；
- 未安装、未登录、缺密钥或不支持当前平台时明确失败，不降级为 Mock。

## 5. 安全边界

- 默认只监听 `127.0.0.1:8787`。
- 改为非本机监听时，服务会强制要求 `CHG_API_TOKEN`。
- Job JSON 不接受密码、Token 或 API Key；凭据由各 Harness 原生登录或进程环境提供。
- 磁盘中的 Job 快照不保存提示词原文，只保存长度和 SHA-256；模型输出与事件会保存在 `var/jobs/`。
- Codex 默认 `workspace-write`；DeepSeek SDK 的工具边界取决于其 Cordis 组合，应只在隔离工作区或 WSL2/容器中运行。

## 6. 当前没有完成的部分

- 这三个 Adapter 是部署候选，不是生产认证 Adapter。
- one-shot 适配器没有把厂商原生审批完整映射到 CHG；因此 capability 明确为 `approvals: false`。
- Grok Build 和 Qwen 尚无独立 Harness Adapter。它们可以先作为 Hermes 的模型 Provider 使用，但不能被宣传为独立 Harness 已接入。
- 生产多租户、队列、数据库、分布式 Runner、计费、SLA 和企业治理属于后续版本。
