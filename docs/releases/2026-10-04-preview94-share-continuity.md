# Preview 94：分享注册接续与时间预填

2026-10-04，Europe/Berlin。

两项修复已提交并推送 GitHub，所需后端已上线，Preview 94 已覆盖安装到手机并正常启动。

修复：分享注册用户登录 App 后可继续原聊天、计划和日历；校园资料与认证仅限制校园入口。分享选中的时间独立保存并预填计划草稿，保留发布者确认及过期提示。

## 源码与验证

- 源码：`d8bff3c2e837682fdef63e31de373d8f0a60b34d`，分支 `codex/ios-uxui-20260922`，已推送。
- 完整分享获客闭环：五个原生 UI 阶段通过，浏览器注册原地升级、接受邀请与双向日程接续通过。
- 10 项后端、10 项原生模型、13 项 OpenAPI、1 项浏览器过期恢复测试通过。类型检查、定向 lint、OpenAPI 契约检查通过。
- 候选及正式域名分别完成七项 HTTP 验收，均通过；本次测试创建的账号均已删除。
- 详见[测试报告](../qa/2026-10-04-share-continuity-repair.md)。

## 后端

- 部署：`dpl_J84PyBHUAkJ29LZFVVdC6FbXXhHs`，状态 `READY`，正式 API `https://api.sideseat.de` 已指向本部署。
- 候选地址：`https://sideseat-l8bhzqe55-baichus-projects.vercel.app`。候选通过后执行 promote，再在正式域名复验。
- 基线及回滚部署：`dpl_5PfSBjdqFonYm4BhyMfFpvEyBTkG`。
- 受控发布包比对 1861 个基线文件，只含八个相关后端文件变更。无数据库 schema / migration 变更；云构建确认现有 146 个迁移全部已应用。
- API 配置、隐私和支持页面、AASA 检查通过。根域名按现有设置跳转到 www；App 实际关联的 `www.sideseat.de` AASA 直接返回 200，并含 Preview 标识。
- 发布验收后查询最近 15 分钟 error 日志为 0 条，仅代表此次短时检查。

## 手机交付

- 设备：iPhone 16 Pro Max，iOS 26.0.1。
- App：`app.sideseat.mobile.preview`，版本 `1.0.0`，Build **94**，连接正式 API。
- 签名和设备描述文件核验通过；238 个受版本控制的原生构建输入与源码提交一致，无额外未跟踪构建输入。
- 13:44 覆盖安装成功，保留原 App 数据；13:45 正常启动，无 UI 测试参数。设备回读确认 Build 94，随后回读确认进程 PID 24778 仍在运行。
- 真机交付验证为安装、版本及启动检查；完整交互闭环在模拟器配合真实本地 API 完成，不计作真机全流程或 VoiceOver 验收。

[交付证据](../qa/evidence/2026-10-04-share-continuity-repair/delivery.json) / [候选验收](../qa/evidence/2026-10-04-share-continuity-repair/candidate-smoke.json) / [正式验收](../qa/evidence/2026-10-04-share-continuity-repair/production-smoke.json)。
