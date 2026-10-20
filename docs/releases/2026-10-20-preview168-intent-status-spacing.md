# Preview 168：收紧我的意愿寻找状态上下留白

- 实现 `87a5f32a` 已提交并推送到当前分支 `codex/ios-uxui-20260922`。
- 「正在寻找」所在内容区顶部从 20pt 收紧到 12pt，详情各行间距从 12pt 收紧到 8pt；左右、底部与暂停/恢复操作点击范围保留。
- 默认 iPhone 14 Plus（UDID `00008110-001A69110CC1401E`）已安装 **1.0.0 (168)**。现有真机用例 1 通过、0 失败、0 跳过，中文普通字号、德文深色最大字号暂停/恢复完整往返通过，截图已复查。
- 严格签名、本项相关源码输入和包哈希通过；本项测试 Runner 已移除，普通启动 **PID 4250** 与实际进程一致，普通 SideSeat 97 保留。
- 包含此前 `00cc7c3d` 的计划时间块实现，本项未重新验收计划流程。本项无后端/网页发布，阶段开始时记录的后端为 `dpl_BVCgbmcppQWWQ1G4dA8xToHc1bNr`；其他聊天正在进行的发布由各自记录维护。

[QA 与截图](../qa/2026-10-20-intent-status-spacing.md)、[真机摘要](../qa/evidence/2026-10-20-intent-status-spacing/phone-summary.json)、[安装与普通启动](../qa/evidence/2026-10-20-intent-status-spacing/phone-delivery.json)、[签名与包哈希](../qa/evidence/2026-10-20-intent-status-spacing/phone-build-manifest.json)。
