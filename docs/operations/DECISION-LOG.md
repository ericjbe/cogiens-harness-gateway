# 水枢施工决策记录

- 2026-09-13: 活动任务硬复位为两张顺序工单；废止旧payload、旧BASE、三方合并考古和Windows重复探针。
- 2026-09-13: `shuishu_dashboard_publish_v1` 只切换现有 `/dashboard/` 上游到候选 `127.0.0.1:20288`，保留认证location；失败自动回滚。
- 2026-09-13: `shuishu_first_model_runtime_v1` 仅在工单1成功后执行，使用独立11436运行时。
