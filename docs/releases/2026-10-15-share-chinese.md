# 分享网页默认中文 — 2026-10-15

分享计划首次打开默认中文，已有网站英文设置不再影响分享页。
保留 English 切换并单独记住用户选择，填写可用时间、编辑昵称和确认参加保持同一语言。
原分享链接刷新或重新打开即可使用。

实现与集成测试已提交、推送：`d3a787c2c5f79b60f46a7367836e7f97f2400a73`，
分支 `codex/ios-uxui-20260922`。

生产 **Ready**：`dpl_63iB9RynVCpBdPi68S3SmAezuTND`，
[部署](https://sideseat-osgqvqoky-baichus-projects.vercel.app)。
`api.sideseat.de`、`www.sideseat.de` 均核对到此版本；裸域保留路径跳转 www。
先发布不切域名的生产候选，真实游客验收通过后 promote 同一构建；两个正式域名再验收通过。

受控发布基于此前生产 `dpl_6Un8qZtCE26v7edqKd2UBexBUHLx`，全部 1,335 项原上传
源码逐项核对，保留生产差异；仅三项语言源码与发布配置/来源记录覆盖。
1,336 项最终上传哈希全部匹配。旧的一次性前置脚本不执行，数据库迁移显式跳过，
Schema 保持原样。支持游客的上一版部署保留为恢复点。

本地完整游客测试 1 项 / 21.7 秒、TypeScript、相关 ESLint 通过。
候选和正式双域名移动浏览器通过中文填写、改昵称、确认及日历姓名核验，
并验证英文浏览器/旧英文 Cookie 的中文默认和手动切换刷新记忆。
临时账号及计划删除，令牌 401。[完整 QA 与证据](../qa/2026-10-15-share-chinese.md)。

当前手机仍为 **SideSeat Preview 1.0.0 (105)**，原生来源 `f508e64`。
本次是服务器渲染的分享网页修复，无需重新安装 App，未重跑真机安装/交互。
默认测试机仍是 iPhone 14 Plus，UDID `00008110-001A69110CC1401E`；
此前 [105 真机验收](../qa/2026-10-15-availability-colors.md) 保持独立记录。
普通 SideSeat 97 保留，未进行 TestFlight/App Store 上传。
