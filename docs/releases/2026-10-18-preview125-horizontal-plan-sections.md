# Preview 125 计划横向分区

计划首页将需要自己处理的事项集中为纵向任务组，将等待其他人的计划改为横向卡片。
横滑预览下一张并按卡片停靠，可查看全部和收起；仅一张时填满宽度。
大字号改为完整换行的纵向展示。创建/链接入口去掉外层大卡片，下一次见面改为轻量日期摘要。
卡片均打开原详情，[暂存的 userflow 基准](../PLAN_FLOW_BASELINE_2026-10-18.md) 与现有记录、确认及日历规则保留。

- 来源：`6338897be1e302a9155b62e4ba8f75cb5c2d0f24`，已推送 `codex/ios-uxui-20260922`。
- 手机：默认 iPhone 14 Plus，`app.sideseat.mobile.preview / 1.0.0 (125)`，严格签名、安装及普通启动 PID **1671** 已核验。
- 验证：10 项单元、5 个呈现用例、原生 **254.052 秒** 与 Safari **150.256 秒**两条完整真机流程通过，**12 + 8 个 API 阶段**通过。最终真机为 6 项与 1 项两个成功批次。
- 修复：展开列表子卡片辅助功能标识被父容器覆盖；Safari 自动化动画等待通过重启测试会话解决，网站数据保留。失败/中止记录独立留存。
- 回收：4 个临时账号、3 个计划/链接删除；私有配置移除，QA runner 卸载，普通 SideSeat 97 保留。
- 后端/网页：保持 `dpl_6kZ6PYg8h4FUUxDxXwvBXYkVirRn`；无 API、Schema、迁移或网页部署，无 TestFlight / App Store 上传。

[完整 QA](../qa/2026-10-18-plans125.md)、
[横向等待卡片](../qa/evidence/2026-10-18-plans125/layout/shared-plan-117-horizontal-waiting-last.png)、
[展开全部](../qa/evidence/2026-10-18-plans125/layout/shared-plan-117-horizontal-view-all.png)、
[设备回执](../qa/evidence/2026-10-18-plans125/device-final.json)。
