# Preview 174：受邀时间表只保留日期和时段

- 实现 `07cecc3f` 已提交推送。App 和分享网页移除时间表标题、说明及表格内重复活动信息，直接显示日期、起止时间和高亮块；流程和规则保留。
- 默认 iPhone 14 Plus 已安装 **SideSeat Preview 1.0.0 (174)**。严格签名、准确源码输入、无测试参数普通启动 **PID 4326** 及实际进程已核验，普通版 **97** 保留。
- 最终两个真机测试覆盖普通/深色最大字号下的连续、非整点和跨午夜时段，六场景 **40.549 秒**通过，截图已复查。初次大字号滚动断言失败及修正记录在 QA 中。
- 候选/正式网页各六项显示检查通过。同一已测 Production 构建 `dpl_HFaJwZhU8fVXgpk1yYRK4bjXkdKw` 已提升，三个生产域名一致；完整生产源码仅改两个显示文件，API/Schema/依赖不变。
- 两个临时账号、三个计划链接、本轮 Runner 和私密启动文件清理。本轮验证范围为显示调整，未重新执行完整业务链，未上传 TestFlight/App Store。

[完整 QA 和实际截图](../qa/2026-10-21-plans174.md)、[构建与签名证据](../qa/evidence/2026-10-21-plans174/native-build-manifest.json)、[正式网页检查](../qa/evidence/2026-10-21-plans174/production-web-layout.json)。
