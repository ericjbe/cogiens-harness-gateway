# V3 内部验收版：现有 APP／CP 接入契约

代码版本 0.3.0-alpha.2。V3 是当前工作名称，不表示正式 3.0 商用发布。
本文以当前上传源码为基线；未获得现有 APP／CP 源码和实际鉴权接口，不能声称已完成客户接入。

## 公共设施边界

复用现有 APP、CP、身份权限、文件服务。不得另建客户后台、平台后台或账户库。
packages/shuishu-sdk/src/index.mjs 是供既有服务端调用的 SDK，不是新的后台。packages/gateway-core/src/registry.mjs 扩展原注册机制，不创建第二个注册中心。

## API

所有接口沿用现有 Gateway 鉴权。鉴权配置为全局内部服务 Token，尚无客户级服务端隔离，不能把 Token 下发客户或直接开放这些接口作为客户 API。

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | /v1/platform | 实际代码版本、基础设施能力与未完成接入声明 |
| GET | /v1/adapters | 预检查范围、实际适配器、最近执行状态 |
| POST | /v1/jobs/fanout | 提交任务，已有接口 |
| GET | /v1/jobs/{job_id} | 任务和事件详情，已有接口 |
| POST | /v1/jobs/{job_id}/cancel | 取消任务，已有接口 |
| GET | /v1/jobs/{job_id}/artifacts | 内嵌产物元数据及下载路径 |
| GET | /v1/jobs/{job_id}/artifacts/{artifact_id} | 下载该任务内登记的文字产物 |
| GET | /v1/jobs/{job_id}/report | 下载任务文本报告 |

下载接口不读取任意文件路径，不跟随外部 URI；非内嵌产物返回 409，由既有文件服务提供授权下载。产物下载响应的 X-Content-SHA256 对应实际响应正文。新产物的大小和摘要也按脱敏后的实际内容计算。历史记录不篡改。

## SDK 使用方式

```javascript
import { createShuishuClient } from './packages/shuishu-sdk/src/index.mjs';
const shuishu = createShuishuClient({
  baseUrl: process.env.SHUISHU_INTERNAL_URL,
  getHeaders: async () => ({ authorization: `Bearer ${process.env.SHUISHU_SERVICE_TOKEN}` })
});
// 在既有 APP／CP 服务端完成当前用户、租户、项目、动作权限校验后再调用。
const job = await shuishu.getJob(authorizedJobId);
const artifacts = await shuishu.artifacts(authorizedJobId);
```

SDK 不提供新登录界面、不建立用户库、不自动解决多租户隔离。既有宿主必须在服务端完成授权，按身份绑定项目/任务，不采信客户端随意传入的租户和工作目录。全量任务列表只供授权内部管理使用。

## 外部执行插件装载

配置 adapters 条目可采用 kind=plugin-module，通过 createAdapter(config) 导出当前 chg.adapter.v0.1 契约。createRegistryWithPlugins 为异步加载入口，原 createRegistry 继续供内置适配器兼容调用。

operator 配置示意（占位值不可直接上线）：

```json
{
  "plugin_root": "由维护人指定的绝对目录",
  "adapters": [{
    "id": "partner.executor",
    "kind": "plugin-module",
    "enabled": false,
    "module": "partner/adapter.mjs",
    "module_sha256": "填写入口文件实际SHA256",
    "plugin_version": "1.0.0",
    "owner": "维护责任人",
    "license": "实际许可证"
  }]
}
```

加载器检查入口真实路径在指定根目录内、入口摘要、必要元数据、导出方法及适配器身份。启停通过现有配置与受控重启，不提供远程上传或在线执行任意代码接口。

这里装载的是经过维护人审查的可信代码，不是安全沙箱。入口摘要不覆盖其全部依赖，维护人须同时审查/锁定依赖。该机制允许后续引入外部标准适配器，但本版未实现 MCP 等原生协议，不能宣传标准兼容已经完成。

## 香港部署结论

可作为内部隔离联调候选；不能按当前全局 Token 模式直接向多客户开放。仍需实际 APP／CP 服务端授权映射、M-3 与香港连接、凭据配置、资源隔离和实机验收。Windows 工作目录不自动迁移成香港服务器目录。

## 本版直接修复

- 下载和查看结果复用原任务记录，历史失败事件映射可见错误。
- 单个健康检查抛错不会使全部执行单元查询失败。
- 排队执行单元可取消，后续不会继续执行该单元。
- 本地推理超时独立记录 TIMED_OUT，用户取消记 CANCELLED。
- 本地 HTTP 响应读取有字节上限；不再先无限读取再处理。
- 产物摘要与脱敏后内容一致。
- 概览显示预检查与最近执行，清除硬编码示例项目/目录，避免误派到水智能项目。
- 不改变 H07 已配置 CPU 路径，不替换模型，不自动升级依赖。

## 尚未解决

M-3 上的模型内存访问崩溃和词表加载失败；多客户授权联调；外部原生协议适配；完整代码开发工具循环；现有 APP／CP 内的插件管理与客户端挂载。以上不以版本号或 UI 状态代替验收。
