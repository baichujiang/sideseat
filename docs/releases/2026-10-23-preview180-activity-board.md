# Preview 180：紧凑活动提议布告栏

- 活动改为两列小卡片；「＋提议活动」在「活动待定」行右侧。点击后在全部提议上方输入，右侧变为「确认」，取消只清除草稿。大字号单列，标题和确认文字精简。App 与分享网页同步，已有记录、兴趣、选活动、邀请及日历规则保留。
- 网页实现 `74a8be75`、最终原生精简 `94d33f43` 已提交推送。179 第一轮真机 194.468 秒；最终 180 完整流程 **194.030 秒/七阶段 API** 通过，含四项提议、输入/取消、两列与深色最大字号、App 好友卡片、选活动/邀请、明确接受、正式发出及双方唯一日历。网页候选/正式站 Chromium、WebKit 合计四组完整流程通过。
- 分享网页已上线 **READY**：`https://sideseat-pitj1fed2-baichus-projects.vercel.app`，Production 构建 `dpl_Gsjh8qTdCVimd1FYZnCpKCkht48D`。从原生产 1,388 项源码核验后只覆盖两个活动 UI 文件，1,386 项字节保留；加来源标记后上传 1,389 项核对一致，测试后提升同一构建，三个正式域名确认。不涉及服务端逻辑或迁移。四组浏览器页面错误为零。
- 默认 iPhone 14 Plus / `00008110-001A69110CC1401E` 已安装 **1.0.0 (180)**。247 个原生输入、严格签名、无测试参数普通启动 **PID 5895** 及实际进程核验；普通 SideSeat **97** 保留。12 个临时账号、18 个计划链接、Runner 和本轮私密测试配置清理；未上传 TestFlight/App Store。

[完整 QA 与截图](../qa/2026-10-23-activity-board.md)、[最终构建](../qa/evidence/2026-10-22-plans179/final-native-build-manifest.json)、[源码/部署](../qa/evidence/2026-10-22-plans179/source-verification.json)、[启动](../qa/evidence/2026-10-22-plans179/normal-launch.json)。
