# Preview 114 计划页界面和使用引导

后续 2026-10-18 05:59：已恢复默认真机 XCTest，并通过首次计划完整连续流程。
本记录中的连接失败保留为初次发布证据；最终验收、重新安装和普通启动见 [真机补验](./2026-10-18-preview114-phone-acceptance.md)。

2026-10-18，Europe/Berlin。沿用活跃分支 `codex/ios-uxui-20260922`，基线 `f1d9dad`。
本阶段更新计划首页、创建、填写完成及邀请确认，让用户知道从哪里开始、当前做什么、接下来等谁。

## 交付状态

| 层面 | 实际回执 |
| --- | --- |
| 源码 | `51c98e9b16676e85047d427b70f1d91e9e68e2e1` 已提交并推送；原生功能、API、OpenAPI、测试和交互文档均包含在内。该记录及最终发布证据由后续文档提交保存 |
| 后端 | `dpl_BerFn2d4wg2VPbtCxFN5WUQA217g`，Ready；候选验收后提升同一构建。`api.sideseat.de` 与 `www.sideseat.de` 均已指向该部署，配置接口 HTTP 200 |
| 手机 Preview | `app.sideseat.mobile.preview / 1.0.0 (114)` 严格签名核验、安装及普通启动完成；iPhone 14 Plus，iOS 26.6.1，UDID `00008110-001A69110CC1401E`，普通启动 PID `2151` 已在进程表核验 |
| 原有安装 | 普通 SideSeat `app.sideseat.mobile / 1.0.0 (97)` 保留；没有 TestFlight/App Store 上传 |

普通启动没有测试参数或 QA 环境变量，携带 `sideseat://plans`。
这证明安装与启动成功，不替代当前真机界面验收；[设备回执](../qa/evidence/2026-10-18-plans114/phone-final.json)。

## 用户现在如何使用

- 首页首次进入展示「发起新计划」、收到链接入口及分享 → 约定 → 日历说明；已有计划时收起大幅介绍，按需要你处理和等待其他人展示具体下一步。
- 创建先选择「时间还没定」或「已经有时间了」，随后只填写对应内容。候选日期/每日空闲范围与实际活动起止时间有明确区别，底部持续显示创建操作及下一步。
- 填写页直接显示分享/复制和保存状态。完成后，发起人看到分享或选时间发邀请，参与人看到等待发起人的说明；重新打开已填写的计划进入结果。
- 邀请和确认页显示真实时间、地点、名单、确认数及日历规则，主要操作固定在底部。已确认的人看到等待状态，全员接受后才显示日历入口。取消放在计划菜单中。

中/英/德文案资源已校验，中文深色、最大辅助字号及小屏界面有运行证据。
原有保存防回滚、邀请通知、过期只读、单层详情、逐人确认和确认后才写日历的规则保留。
本次重大更新聚焦计划流程；其他一级页面没有随本次重做。

## 验证结果及限制

- iPhone 14 Plus / iOS 26.5 隔离模拟器：**60 项通过，0 失败、0 跳过**，包括 50 项单元测试、3 项创建呈现测试及 7 项界面流程。
  真实计划数据来自隔离 API，登录外壳及未测消息角标使用 DEBUG 夹具。
- iPhone SE 第三代补充运行完整创建 → 填写 → 保存完成 → 分享/复制 → 返回下一步卡片流程，通过。
- 本地 API 六项、OpenAPI 13 项、191 个操作的契约校验、TypeScript、相关 ESLint、三语言资源语法及 diff 检查通过。
- 候选与正式 API 域名各 **五组线上流程通过**：Chromium/WebKit 游客保存/重开、实际 INVITED、逐人确认、两个账号日历/搜索、取消清理；过期征集只读和写入关闭；直接邀请跨过实际开始时间后关闭且不写日历。新增列表角色字段在创建/填写/邀请后均有断言。
- 真机独立 runner 已构建并尝试：Xcode 命令 exit 65，runner 在建立 XCTest 连接前 exit 74，**实际交互用例执行 0 项**。结果中的一个失败项是 runner 启动错误；不能算本次真机 userflow 通过。未调整设备安全设置或自动重启，runner 已卸载，Preview 已恢复普通启动。

首次模拟器失败、针对性修正、截图及最终结果见 [QA 记录](../qa/2026-10-18-plans114.md)。
[候选结果](../qa/evidence/2026-10-18-plans114/candidate-flows.json)、
[正式结果](../qa/evidence/2026-10-18-plans114/production-flows.json)、
[真机连接结果](../qa/evidence/2026-10-18-plans114/phone-ui-attempt.json)。

## 后端来源与清理

后端没有直接部署整份 Git 工作区。以发布前的真实生产
`dpl_BNevHf7yCYLW8MyrFPRnEtgjqcy1` 为基线，逐项校验并重建 1,346 个源文件，
保留其中 1,344 项，仅覆盖 `lib/api/v1/time-poll-service.ts` 与 `openapi/v1.json`，新增来源记录。
最终上传的 **1,347 项 SHA-1 全部匹配**。
列表仅新增可选读取字段 `isOwner`、`didRespond`、`planningMode`，内部答复行不返回给客户端；
没有 Schema 变更或迁移，构建显式设置并核验 `SKIP_DATABASE_MIGRATIONS=1`。

[来源清单](../qa/evidence/2026-10-18-plans114/source-manifest.json)、
[上传校验](../qa/evidence/2026-10-18-plans114/upload-verification.json)、
[构建和健康检查](../qa/evidence/2026-10-18-plans114/backend-build.json)、
[域名回执](../qa/evidence/2026-10-18-plans114/production-aliases.json)。

两个专用线上 QA 账号已删除，账号删除前剩余计划为 0；两个旧令牌返回 401，十个已知临时分享链接返回 404。
候选临时访问链接已撤销，私有账号夹具与含凭据的 runner 构建目录已移除。
本地隔离数据库、服务和两台任务模拟器已回收。
部署最近 15 分钟的 error/fatal 分组日志查询返回空表；这是限定时间的日志检查。
[数据清理](../qa/evidence/2026-10-18-plans114/online-cleanup.json)、
[运行日志检查](../qa/evidence/2026-10-18-plans114/runtime-errors.json)。

如需回退本次两个读取字段，上一生产部署为 `dpl_BNevHf7yCYLW8MyrFPRnEtgjqcy1`；
不要通过整份本地工作区覆盖生产。
