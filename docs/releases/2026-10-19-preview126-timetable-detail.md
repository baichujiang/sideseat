# Preview 126 时间表为核心的计划详情

计划详情取消重复摘要和整块名单卡片，活动与状态平面展示后直接进入时间表。
征集阶段直接编辑空闲；邀请阶段突出最终时段高亮，表下方显示确认进度。
完整填写/邀请名单通过人数或「谁会参加」展开；底部突出当前阶段的分享、选时、确认或日历动作，复制链接降为次要图标。
[userflow 基准](../PLAN_FLOW_BASELINE_2026-10-18.md)、现有记录与确认/日历规则保留。

- 来源：`3e4e70f9cbc2edde4002a8452f533b061550255b`，已推送 `codex/ios-uxui-20260922`。
- 手机：默认 iPhone 14 Plus，`app.sideseat.mobile.preview / 1.0.0 (126)`，严格签名/安装及普通启动 PID **1741** 已核验。
- 验证：25 项单元；原生 **263.027 秒**、Safari **150.573 秒**两条完整真机流程；首页横滑回归 **47.175 秒**；12+8 个正式 API 阶段通过。最终真机两个批次分别 2 项和 1 项通过，0 失败、0 跳过。
- 复验：首轮 Safari 测试遗漏新名单入口，补齐路径并保留原断言，新账号完整重跑通过；初始失败独立保存。
- 回收：4 个临时账号、3 个计划/链接删除，私有配置与 QA runner 移除；普通 SideSeat 97 保留。
- 发布：无 API、Schema、迁移或网页部署；保持 `dpl_6kZ6PYg8h4FUUxDxXwvBXYkVirRn`，无 TestFlight / App Store 上传。

[完整 QA](../qa/2026-10-19-plans126.md)、
[征集首屏](../qa/evidence/2026-10-19-plans126/native-flow/phone-first-plan-native-01-owner-table.png)、
[邀请详情](../qa/evidence/2026-10-19-plans126/native-flow/phone-first-plan-native-08-participant-invitation.png)、
[设备回执](../qa/evidence/2026-10-19-plans126/device-final.json)。
