# Preview 181：活动提议快捷填入

- 默认推荐「逛展、火锅、羽毛球」可点选填入；部分输入后按 Tab 补全第一个匹配项，仍由右侧确认发布。无匹配项/完整推荐时正常移焦，组合键与网页 IME 保留正常行为。补全完全在本地，不调用服务、不使用剪贴板。App/分享网页同步，原有两列卡片、邀请和 Calendar 规则保留。
- 实现 `94c71f74` 已提交推送。最大字号点击问题修复后单独真机 **27.042 秒**复验通过；最终完整真机流程 **208.527 秒/七阶段 API** 通过。网页候选/正式 Chromium、WebKit 四组最终完整流程通过、零页面错误；补全阶段监听到的提议提交请求为零，真实提议数为零。初轮失败与修复范围在 QA 分开记录。
- 默认 iPhone 14 Plus（`00008110-001A69110CC1401E`）已安装 **1.0.0 (181)**，247 个原生输入、严格签名及普通启动 **PID 5991** 核验，普通版 97 保留。
- 分享网页 **READY / Production**：`https://sideseat-nbgci223n-baichus-projects.vercel.app`，`dpl_9WUXBm5orPvRbgpnvbJh8kczs5sR`。原生产全部 1,389 项源码核验后只改一个活动 UI 文件，1,388 项字节保留；新增来源标记后最终上传 1,390 项核验，测试后提升同一 Production 构建，三个正式域名确认。无服务端逻辑、Schema 或迁移改动。
- 14 个专用账号、19 个计划链接、Runner 及私密测试配置清理，401/404 核验。未上传 TestFlight/App Store。

[QA、修复与截图](../qa/2026-10-23-activity-completion.md)、[原生来源](../qa/evidence/2026-10-23-plans181/native-build-manifest.json)、[生产来源](../qa/evidence/2026-10-23-plans181/source-verification.json)、[正常启动](../qa/evidence/2026-10-23-plans181/normal-launch.json)。
