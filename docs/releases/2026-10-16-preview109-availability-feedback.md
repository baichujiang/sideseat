# Preview 109：计划信息层级与明确的填写完成反馈

**日期：** 2026-10-16，Europe/Berlin。源码已推送；网页/API 双域名 Ready，最终 Preview 109 已安装到默认手机并普通启动。

## 行为

原先标题旁只显示时区，昵称区域与操作说明占据较多空间；自动保存状态小且不持续可见，
用户第一次填写会寻找提交按钮。本次把状态、标题、日期范围、地点与明确标注的时区分层，
收紧昵称编辑，统一 App/网页的「我的时间 / 大家的结果」。网页日期表头拆成日期和星期两行，
恢复中性浅深色表面及主操作配色；保留电脑一屏七天和手机表内滚动。

选时页底部持续显示初始提示、正在保存、已自动保存或失败重试，并汇总已选天数/小时数。
服务器确认保存后才能「完成填写」，点后进入大家的时间表并提示可随时返回修改。
自动保存仍走原有串行队列；填写完成不等于确认参加，不写入日历。

## 源码、安装与部署

| 对象 | 记录 |
| --- | --- |
| 分支/基线 | `codex/ios-uxui-20260922` / `ba495a728fc4e9c63ec6549a4c574ed0f271196f` |
| 主源码 | `167cb5f`，已提交并推送 |
| 最终原生 | `4ed4e2f`，已提交并推送；配对使用现有浅深色按钮填充和文字，修正深色可读性 |
| 手机版本 | `app.sideseat.mobile.preview / 1.0.0 (109)`，独立于普通 SideSeat (97) |
| 默认真机 | iPhone 14 Plus / iOS 26.6.1 / `00008110-001A69110CC1401E` |
| 网页构建 | `dpl_EAJLd9xMRuyCx6fnoVeFphGtUmE1` / [构建 URL](https://sideseat-gljzuper0-baichus-projects.vercel.app) |
| 生产恢复点 | `dpl_HHqbc44TnSUitJCAgKUjNrCxNt4s` |

当前网页/API 的实际域名状态、最终安装/普通启动及清理结果见
[验收记录](../qa/2026-10-16-availability-feedback109.md)。

生产从真实上一部署的 1,343 项源码逐项校验后重建，保留 1,340 项原内容，仅覆盖
`shared-time-poll.tsx`、对应 CSS 与 `availability-editor.tsx`，新增来源记录。
1,344 项上传 SHA-1 全匹配。没有 API、OpenAPI、Schema 或迁移变化；构建显式跳过迁移。
发布上下文保留在
`/Users/baichu/Library/Application Support/SideSeat/releases/2026-10-16-feedback109/context`。
[来源](../qa/evidence/2026-10-16-feedback109/source-manifest.json)、
[上传核对](../qa/evidence/2026-10-16-feedback109/upload-verification.json)。

## 验证

本地 12 个不同集成用例最终通过，包含两种浏览器的慢保存/失败重试/完成返回、
320–1440px 布局、真实触控/撤销、游客昵称/按名字继续、邀请确认与日历范围。
静态类型、定向 ESLint、三语言字符串检查和签名构建通过。

主源码两项真机 UI 通过（新填写完成流程、普通滑动），实际 API 核对精确保存值与仍为征集中。
视觉检查发现深色完成按钮白底白字后，完成配色修正、重新安装并通过最终聚焦真机复查（35.964s，0 失败/跳过），人工核对深色文字可读。
未更改用户登录凭据；没有 TestFlight/App Store 上传。

候选/正式各两种浏览器真实流程通过，包含已保存后完成/返回修改、昵称编辑、游客确认及
两个注册用户精确的 12 小时日历。八项公开健康检查通过，15 分钟 error 查询为 0。
八个临时计划和两个账号已清理，公开 API 链接 404、旧令牌 401。
最终 QA runner 已卸载，Preview 109 空参数普通启动 PID 999 已核验运行，普通 SideSeat 97 保留。
[最终设备](../qa/evidence/2026-10-16-feedback109/device-final-state.json)、
[正式域名](../qa/evidence/2026-10-16-feedback109/deployment-state.json)、
[清理](../qa/evidence/2026-10-16-feedback109/cleanup-summary.json)。
