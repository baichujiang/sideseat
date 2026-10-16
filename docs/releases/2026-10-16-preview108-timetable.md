# Preview 108：完整时间表与手选活动起止时间

**交付日期：** 2026-10-16，Europe/Berlin。源码已提交并推送，网页/API 已正式发布，
默认 iPhone 14 Plus 已安装并正常启动 Preview 1.0.0 (108)。

## 交付行为

用户希望根据完整时间表商量玩半天或一天。原结果推荐依赖预设活动时长，容易把征集理解成
一小时会议。现在 App 和分享网页直接展示「大家的时间表」、填写人数及每格人数热图，
移除共同时间和人数最多推荐卡片。

「一起定时间」创建时不再要求活动时长。发起人看表后，在邀请页手选日期、开始时间、
结束时间和受邀名单；默认覆盖所配置当天的完整时间范围。半天、全天均按实际起止时间
发出邀请，所有受邀人确认后按同一范围写入注册用户日历。「直接选时间」保留原流程。

30 分钟格、旧 15 分钟填写、撤销、颜色、全天全选、自动保存、游客按名字继续填写及
网页确认保留。旧客户端不传结束时间时沿用既有时长；当前客户端明确发送结束时间。
数据库 Schema 无变化，无数据库迁移。

## 源码与部署

| 对象 | 核验结果 |
| --- | --- |
| 工作分支与基线 | `codex/ios-uxui-20260922`，起始 `b17ad8936c3ff31d7dad8d216b348b47aeb23321`，工作区干净 |
| 主实现 | `87502492a3d3152873ded9c92c66cff0abacb2bc`，已推送 |
| 隔离本地 UI 测试辅助 | `dc9a8742b5fc02943a50af1b6fe96d79fd626e8d`，已推送；不改变 App 运行逻辑 |
| 最终手机源码 | `362daaba13a1724defd12db9caaab081a32530a1`，已推送；修正日期栏及摘要遵循 App 所选语言 |
| 正式网页/API | `dpl_HHqbc44TnSUitJCAgKUjNrCxNt4s`，双域名 Ready |
| 构建 URL | [已验证生产构建](https://sideseat-aq0wg7r5f-baichus-projects.vercel.app) |
| 保留恢复点 | `dpl_6gNEve6aFMsmzWFD4rJpNgBB4fUH`，上一游客名字继续填写版 |
| 手机 | iPhone 14 Plus，iOS 26.6.1，UDID `00008110-001A69110CC1401E` |
| 安装与签名 | `app.sideseat.mobile.preview / 1.0.0 (108)`；Team `V4238R5R53`，描述文件包含目标设备，签名核验通过 |
| 最终运行 | 空参数普通启动 PID 968，运行进程已核验，QA runner 已卸载 |

生产从上一真实部署的 1,342 项源码逐文件 SHA-1 校验重建；保留 1,338 项原内容，
只覆盖网页结果、邀请请求 Schema、邀请服务和 OpenAPI 四项源码，再新增发布来源记录。
最终 1,343 项上传哈希全匹配。先验证候选，再 promote 同一生产构建；未执行旧发布前置脚本，
构建显式跳过迁移。受控发布目录保留在
`/Users/baichu/Library/Application Support/SideSeat/releases/2026-10-16-timetable108/context`。
见 [来源](../qa/evidence/2026-10-16-timetable108/source-manifest.json)、
[上传核对](../qa/evidence/2026-10-16-timetable108/upload-verification.json)、
[双域名状态](../qa/evidence/2026-10-16-timetable108/deployment-state.json)。

## 验证与收尾

本地最终 13 个不同集成用例通过；首次两项 Calendar 断言用错字段名，修正后定向重跑通过。
候选和正式线上各通过 Chromium/WebKit 两种真实流程，检查 4 小时、12 小时邀请、游客确认、
两个注册用户日历的精确起止时间。另有本地 24 小时跨日确认/日历用例通过。

独立模拟器三项 UI 通过，默认真机三项通过；发现新日期栏仍为英文且摘要跟随设备德语后，
完成原生语言修正、重装并通过全天邀请单项真机复查。最终截图日期栏和摘要均为中文。
类型、定向 ESLint、191 项 OpenAPI 操作校验、生成代码、三语言字符串和签名构建检查通过。

九个线上临时计划、两个 QA 账号已清理，公开链接均 404，旧登录令牌均 401；
独立本地服务、数据库和临时模拟器已停止/移除。测试使用临时认证参数，未改写用户登录凭据。
普通 SideSeat 1.0.0 (97) 保留；没有 TestFlight/App Store 上传。

[完整验收及截图](../qa/2026-10-16-timetable108.md)、
[最终安装状态](../qa/evidence/2026-10-16-timetable108/device-final-state.json)、
[清理证据](../qa/evidence/2026-10-16-timetable108/cleanup-summary.json)。
