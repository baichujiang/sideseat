# 个人资料与个性化验证

日期：2026-10-02。源码：`Sideseat-ios-uxui`，保留当前 `codex/ios-uxui-20260922` 分支及既有未提交更改。

## 结果

- 基本资料摘要、完整度提示、编辑与语言入口已接入「我」。完整度不要求填写性别或联系方式，也不替代学生认证。
- 设置及个性化页支持设备级跟随系统／浅色／深色主题。
- 个人配色、装饰图标、卡片样式和资料页 Plus 徽标开关可预览、保存、重新读取；既有基本资料 PATCH 不覆盖样式。
- 服务端校验真实 Plus 资格，拒绝 Free 保存专属样式；到期后公开资料回退免费样式，本人保存值保留。
- 昵称独占一行，徽标和图标排在下方。德文最大辅助字号使用纵向预览，保存仍可点击。

## 验证证据

- `npm run test:profile`：13 项通过（新增数据库用例单独运行，见下）。
- `npm run test:openapi:v1`：13 项通过；最终 `npm run check:openapi:v1` 通过，180 项接口匹配。
- `npx tsc --noEmit --incremental false`：通过。
- 修改的服务端及测试文件 ESLint、`git diff --check`：通过。
- 隔离数据库 `sideseat_appearance_20261002` 上前向迁移成功。
- `appearance-postgres.test.ts`：真实数据库保存／重新读取、Free 拒绝、Plus 公共展示、过期回退、原选择保留、基本资料更新保留样式均通过。
- iOS 26.5 独立 iPhone 13 mini 模拟器：`ProfileAppearanceTests` + `ProfileStoreTests` 共 18 项通过；`ProfileAppearanceUITests` 共 3 项通过。
- 界面验证覆盖：Free 预览 Plus 但仅可保存免费样式、Plus 保存并重新打开相同选项、德文／深色／最大辅助字号。
- 初轮 Free 测试暴露预览容器缺少辅助功能分组，已添加容器分组并全组复验通过；视觉核对修正海洋配色和昵称拥挤。

最终 Xcode 结果：`/tmp/sideseat-personalization-derived/Logs/Test/Test-SideSeat-Development-2026.10.02_15-32-17-+0200.xcresult`。

## 截图

[中文个人资料页](evidence/2026-10-02-profile-personalization/profile-zh.png) · [中文个性化预览](evidence/2026-10-02-profile-personalization/editor-zh.png) · [德文深色最大字号](evidence/2026-10-02-profile-personalization/editor-de-large-dark.png)

## 发布边界

本轮未部署 API、未迁移生产数据库、未上传 TestFlight。需要先应用 `20261002140000_profile_appearance` 迁移，再发布 API 与客户端。App 主题为本机设置；图标为个人资料装饰图标，不是桌面 App 图标。功能契约见 [个人资料与个性化](../PROFILE_PERSONALIZATION.md)。
