# 意愿分享后端与手机 Preview 验收（2026-10-02）

用户明确授权「上线所需后端并安装 Preview」。意愿分享后端已上线；手机当前的 Preview 83 完整包含分享入口，已确认版本并启动。

## 后端与数据库

- 生产部署：`dpl_E7gKLADCsaYt57px2kqAdqNj9tsJ`，构建地址 `https://sideseat-kob1t3vzm-baichus-projects.vercel.app`。候选构建通过后执行 promote，确认 `api.sideseat.de` 与 `www.sideseat.de` 均解析到本部署。
- 来源：`a273a55cbd98aee8533a03c841904dc8ebf43c96` 加本次分享功能的受控快照。原生产部署 `dpl_HheJbQRRDLjEJcrZBYyuggf5j1Dg` 中 `lib/analytics/layer2-outcome-pilot.ts` 和 `lib/media/private-blob.ts` 的现有差异原样保留。未发布工作区中另一项个人资料外观后端或迁移。
- 迁移批次仅 `20261002200000_intent_share`，增加可空 `WeeklyIntent.shareToken` 及唯一索引；迁移后状态正常。构建阶段显式跳过数据库迁移。
- Neon 恢复点：`release-backup-20261002-intent-share` / `br-square-king-ap1ow7vt`，从生产 main 于 22:14:05 CEST 创建，保留数据与结构、无自动到期。临时生产环境凭据文件已移除。
- 22:28 CEST 生产流程验证通过 10 项。使用隐藏且不参与发现的临时 QA 用户，验证真实分享链接从 `sideseat.de` 跳转至 `www.sideseat.de` 后的匿名联系、原生消息请求与回复、注册保留对话、日程保存、原生登录与撤销。测试用户和相关数据已清理。
- API 配置、AASA、隐私及支持页面检查通过。首次候选构建的忽略规则误排除了 `app/ios`，修正为根目录匹配后重建通过；失败候选未接管正式域名。

## 手机 Preview

- 本次签名构建 `app.sideseat.mobile.preview` / `1.0.0 (82)` 成功，289 个源文件、签名、生产 API 地址和设备授权校验通过。
- 安装前发现另一项更新已将手机从 81 升级至 83。比较两份冻结清单，差异仅 `ChatsRootView.swift` 与 Preview 版本号，分享代码一致，因此保留已安装的 83。
- 本次通过设备回读再次确认 iPhone 16 Pro Max 上为 `1.0.0 (83)`，并于 22:28 CEST 成功启动。未将手机降级到 82。
- 真机检查范围为应用身份、版本、授权和启动。功能流程通过生产 HTTP/API 与本地移动浏览器端到端测试验证；真机界面的手动体验留给用户反馈。
- 未进行 TestFlight/App Store 上传，未进行 Production archive 或 Sentry dSYM 上传。

在手机打开「一起 → 我的意愿」，点击已发布意愿卡片的分享按钮。外部访客可以查看活动及空闲时间、匿名发消息；注册后可保留联系并添加日程。首版快速注册为用户名与密码，日程保存为个人提醒。

[发布、迁移与生产验证证据](../qa/evidence/2026-10-02-intent-share-production/) · [Preview 82 构建证据](../qa/evidence/2026-10-02-preview82/) · [Preview 83 安装记录](2026-10-02-preview83.md)
