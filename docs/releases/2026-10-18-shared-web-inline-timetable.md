# 分享网页 · 时间表直接填写

2026-10-18，Europe/Berlin。

朋友填名字后，直接在同一张人数时间表点选自己的空闲；保存和重开保留表格，省去填写/结果切换和完成按钮。
保留自动保存、撤销、当天选择及下一步说明，最终邀请仍需明确确认参加。

| 发布项 | 实际状态 |
| --- | --- |
| URL / 目标 | `https://www.sideseat.de/time-polls/{token}`，production；原有分享链接继续可用 |
| 状态 | **READY**，候选验收后提升同一构建，无重建 |
| 来源 | `9f3d9f1d`，`codex/ios-uxui-20260922`，已提交推送 |
| Framework / 构建 | Next.js 15.5.23，约 128 秒 |
| 部署 | `dpl_APapk63YMWww6wjmBxVxHUKbDNrj`；API、www、apex 均核验 |
| 前生产基线 | `dpl_7DwPLdanvVjFSiAK96AQQxH4x7ZB`，1,348 项全部校验；保留 1,345 项，更新三个网页 UI 文件及来源记录，1,349 项上传全匹配 |
| 数据库 / API | Schema/API 保留，迁移显式跳过 |
| 验证 | 8 组隔离布局、候选/正式各 6 组真实流程；连续真机 135.202 秒和八阶段真实 API 通过 |
| 发布后日志 | 本部署最近 20 分钟 error 日志 0 条 |
| 手机 | 默认 iPhone 14 Plus，保留 Preview **119** 并普通启动 PID **1286**；未重编/安装原生包 |
| 清理 | 1 个账号、9 个计划/链接回收；令牌 401、链接 404；QA runner/私有配置移除，普通 SideSeat 97 保留 |
| 分发 | 未上传 TestFlight / App Store |

[完整验收与截图](../qa/2026-10-18-share120.md)。
