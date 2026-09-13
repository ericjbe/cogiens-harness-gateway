# 水枢施工决策记录

- 2026-09-13: 活动任务硬复位为两张顺序工单；废止旧payload、旧BASE、三方合并考古和Windows重复探针。
- 2026-09-13: `shuishu_dashboard_publish_v1` 只切换现有 `/dashboard/` 上游到候选 `127.0.0.1:20288`，保留认证location；失败自动回滚。
- 2026-09-13: `shuishu_first_model_runtime_v1` 仅在工单1成功后执行，使用独立11436运行时。
- 2026-09-13 attempt-1: 将 dashboard 上游切换至 127.0.0.1:20288；首次 nginx include 生成了无效 Authorization 引号，nginx -t 拒绝，未 reload。
- 2026-09-13 repair-1: 从备份重建 include，固定 Host aquahub.cogiens.com、清除候选不需要的 Authorization，保留 auth_request location；nginx -t 与 reload 成功。
- 2026-09-13 retest-1: 公开 /dashboard/ 返回 303 至现有登录页；候选直连 200；npm.cmd run verify 101/101 通过。Founder 已认证 200 尚待现有会话实测，故工单1保持 VERIFYING。
- 2026-09-13 attempt-2: 官方 ggml-org/llama.cpp b10936 Windows CPU 包已下载至隔离运行目录并记录 SHA-256；未启动模型，避免重复 Windows Ollama 探针。
- 2026-09-13 retest-2: M3 已发现 qwen2.5:7b 对应本地 blob（F:\\ollama-models\\models\\blobs 下，约 4.68GB）；候选运行时已展开，尚未完成独立 11436 推理验收。
- 2026-09-13 result-1: 香港认证网关 include 已切换到 20288，nginx syntax/reload 成功；匿名保护仍为 303。由于没有可合法复用的 Founder 会话，已认证页面与 12 模型渲染尚未宣称通过。
- 2026-09-13 decision-2: 按要求解除模型运行时对 Dashboard 已认证验收的单向依赖；Dashboard 工单保持 VERIFYING，shuishu_first_model_runtime_v1 独立进入 RUNNING。不得复制会话或绕过认证。
- 2026-09-13 attempt-3: 使用 llama.cpp b10936 `llama-server.exe --help/--version` 验证参数与二进制；以本地 qwen2.5:7b blob 启动 11436。进程在监听前退出，11436 未监听，run.out/run.err 均为空；未执行推理请求，避免将启动失败误报为模型结果。
- 2026-09-13 result-2: 该 Ollama blob 不能直接作为 llama.cpp GGUF 文件启动（无可用监听/响应证据）；保留原 blob 与运行日志，未修改模型存储。需从 Ollama manifest 解析完整模型层后再继续。
- 2026-09-13 correction-1: 上述“blob 不能作为 GGUF”结论证据不足；此前仅观察到未监听和空日志，模型格式兼容性保持未确定。原始失败事实与记录全部保留。
- 2026-09-13 evidence-1: Ollama `/api/show` Modelfile 指向 qwen2.5:7b 模型层 `sha256-2bada8a7450677000f678be90653b85d364de7db25eb5ea54136ada5f3933730`；文件大小 4683073952，文件头 `47-47-55-46-03-00-00-00`（GGUF v3）。
- 2026-09-13 evidence-2: llama.cpp b10936 版本命令输出 `0.4.0-dev (build 10936, commit 790cf51aa)`；保守参数启动时实际加载模型并监听 11436，随后 HTTP 推理请求连接失败。stderr 仅出现模型加载与 control-looking token 警告；当前 Windows 事件窗口未检索到 Application Error/WER 条目，根因保持未确定。
- 2026-09-13 implementation-1: 新增 `scripts/llama-supervised-experiment.mjs`，以 Node `spawn(shell:false)` 托管 llama-server，记录 spawn/error/exit/close、PID、起止时间、signal/exit code、健康等待和三次请求结果；脚本已通过 node --check 并推送。
- 2026-09-13 blocked-1: 触发脚本后 M3 SSH 连续两次（含10秒超时）连接失败，无法读取本地 experiment-result.json、进程退出码或计划任务结果；未重启整机、8787或Ollama。模型工单保持 RUNNING（无可确认心跳），最近尝试结果为 UNOBSERVABLE_M3_SSH_TIMEOUT。
- 2026-09-13 blocked-2: 追加只读连接重试仍在10秒超时；未执行第三方终止、未推断退出码或根因。监督脚本和运行目录保持原状，等待 M3 管理面恢复后读取结果。
