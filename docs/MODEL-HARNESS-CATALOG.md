# 水枢模型与 Harness 管理契约（候选 v2）

## 目的

模型目录是水枢的资源清单，不是在线状态广告。模型槽位只有通过执行适配器、节点健康、授权、计费和额度检查后才可派单。任务成功仍须结合产物与验收证据判断。

## 配置边界

`model_harness.slots` 定义界面中的模型槽位。槽位可以预先存在而不绑定适配器；此时必须显示“尚未绑定执行适配器”，并禁止派单。

```json
{
  "model_harness": {
    "customer_access_ready": false,
    "slots": [
      {
        "slot_id": "free-01",
        "display_name": "本地免费模型 01",
        "access_class": "free",
        "adapter_id": "operator.installed.adapter.id",
        "tenant_visibility": "tenant-allowlist"
      }
    ]
  }
}
```

模型品牌、真实模型名、执行命令、服务地址和凭据不由浏览器提交。真实模型名来自管理员安装的 adapter 配置；凭据只能保存在服务端既有密钥设施中。

## 免费模型派单闸门

免费槽位必须绑定 `ollama-local` 适配器，并同时满足：

1. adapter 已启用；
2. 明确绑定模型；
3. 不是云端模型标签；
4. 执行节点健康检查为 `healthy`。

健康检查只允许试运行，不等于推理质量或工程交付验收通过。

## 收费模型派单闸门

收费槽位除适配器和节点要求外，还必须同时满足：

```json
{
  "selection": {
    "authorization": { "status": "ACTIVE" },
    "billing": { "status": "READY" },
    "budget": { "currency": "USD", "remaining": 100 }
  }
}
```

缺少授权、计费未接入、额度未配置或余额不大于零时，水枢必须拒绝派单。默认禁止自动从免费模型切换到收费模型。

## 多租户边界

- `operator-only`：仅超级管理员可见/可用；
- `tenant-allowlist`：必须由现有 APP/CP 的可信授权结果明确放行；
- `all-tenants`：仍需 APP/CP 身份及执行隔离通过，不能匿名派单。

浏览器传入的 `tenant_id`、模型地址、命令、Token 或模型名不得被当作可信授权。客户执行只有在 `execution_isolation_ready=true` 时才可能启用。

## API 与界面

- `GET /v1/model-harness/catalog`：返回槽位、可用性、授权/计费摘要、租户范围及阻塞原因；
- `POST /v1/jobs/selected`：只接受目录中的 `choice_id`；
- 管理界面提供免费/收费/可派单筛选、10+6 槽位摘要、Harness 与节点状态、授权与预算、租户范围、一键加入派单；
- 任务执行结果继续进入既有任务记录、报告和 artifact 下载入口。

## 当前候选限制

`config/hk.json` 只建立 10 个免费槽位和 6 个收费槽位，全部保持未绑定、不可执行。它没有伪造任何已安装模型、云端账号、余额或客户开放状态。实际绑定必须在 M3 隔离工作树中结合真实 adapter 和密钥设施完成复验。
