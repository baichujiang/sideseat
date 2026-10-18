# Preview 123 · 看清时间表里的最终邀请，再确认参加

2026-10-18，Europe/Berlin。

App 与分享网页收到邀请后，直接展示只读时间表并高亮最终时段，活动名称、地点、日期和时区同时可见。
点击时间格不会确认参加或改动空闲；用户看清后明确选择「确认参加」或「无法参加」。
全员确认后才进入日历。发起人的表内选时、名单复核和原有邀请版本规则保留。

| 交付项 | 实际状态 |
| --- | --- |
| 来源 | 原生 `b438a8581c8ddaf8a9b96f98edcfa725b414be64`、网页 `e484b77431e57ed3a9290b4880f2a55eb6cbf908`，均已提交推送至 `codex/ios-uxui-20260922` |
| 手机 | 默认 iPhone 14 Plus / `00008110-001A69110CC1401E` / iOS 26.6.1，Preview `app.sideseat.mobile.preview / 1.0.0 (123)` 已构建、严格签名、安装；普通 SideSeat 97 保留 |
| 网页 | [正式分享网页](https://www.sideseat.de)，`dpl_6kZ6PYg8h4FUUxDxXwvBXYkVirRn`，**READY / production / Next.js 15.5.23**；构建 125.033 秒；候选验证后原样提升，API/www/apex 均核验 |
| 生产保留 | 基线 1,349 项逐项重建，保留 1,346 项，上传 1,351 项 SHA-1 全匹配；仅相关分享 UI 更新，API/Schema 保留，迁移显式跳过 |
| 单元与布局 | Swift **25 项**、网页计算 **3 项**、隔离布局 **12 组**通过；覆盖实际邀请范围、旧半格、固定晚间、跨午夜和 DST |
| 真实网页 | 候选 **8 组**通过，增加首次视口断言后再 **8 组**通过；正式 **8 组**通过。改期更新高亮并重新确认，点击不接受，确认前日历 0 条、明确确认后唯一 1 条 |
| 真机 | Safari **147.349 秒**、修正后原生双账号 **253.634 秒**完整流程通过；**8 + 12 个 API 阶段**通过，深色最大字号复查完成；首轮原生 ID 覆盖及检查时序失败独立记录 |
| 最终交付 | QA runner 和私有配置移除，Preview 123 结束 QA 进程后无测试参数普通启动 PID **1585** 已核验；5 个一次性账号、15 个计划/链接回收，剩余 0、令牌 401、链接 404 |
| 运行检查 | 最终 20 分钟 error 级日志查询无匹配记录；7 项健康检查 HTTP 200 |
| 分发 | 未上传 TestFlight / App Store |

[完整 QA](../qa/2026-10-18-plans123.md)、
[正式深色首次视口](../qa/evidence/2026-10-18-plans123/production-webkit-invitation-viewport.png)、
[真机受邀表](../qa/evidence/2026-10-18-plans123/native-flow/phone-first-plan-native-08-participant-invitation.png)、
[最终设备回执](../qa/evidence/2026-10-18-plans123/device-final.json)、
[发布和域名回执](../qa/evidence/2026-10-18-plans123/deployment.json)。
