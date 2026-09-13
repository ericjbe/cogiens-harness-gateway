# 水枢施工决策记录

- 2026-09-13: 活动任务硬复位为两张顺序工单；废止旧payload、旧BASE、三方合并考古和Windows重复探针。
- 2026-09-13: `shuishu_dashboard_publish_v1` 只切换现有 `/dashboard/` 上游到候选 `127.0.0.1:20288`，保留认证location；失败自动回滚。
- 2026-09-13: `shuishu_first_model_runtime_v1` 仅在工单1成功后执行，使用独立11436运行时。
- 2026-09-13 attempt-1: 将 dashboard 上游切换至 127.0.0.1:20288；首次 nginx include 生成了无效 Authorization 引号，nginx -t 拒绝，未 reload。
- 2026-09-13 repair-1: 从备份重建 include，固定 Host aquahub.cogiens.com、清除候选不需要的 Authorization，保留 auth_request location；nginx -t 与 reload 成功。
- 2026-09-13 retest-1: 公开 /dashboard/ 返回 303 至现有登录页；候选直连 200；npm.cmd run verify 101/101 通过。Founder 已认证 200 尚待现有会话实测，故工单1保持 VERIFYING。
- 2026-09-13 attempt-2: 官方 ggml-org/llama.cpp b10936 Windows CPU 包已下载至隔离运行目录并记录 SHA-256；未启动模型，避免重复 Windows Ollama 探针。
