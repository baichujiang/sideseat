# Preview 166：收紧同行卡片资料行下方间距

- 实现 `cca0cd18` 已提交并推送到当前分支 `codex/ios-uxui-20260922`。
- 「推荐依据 / 查看资料」与收藏、打招呼之间移除叠加的 8pt 顶部 padding，间距从 16pt 收紧为 8pt；点击范围保留。
- 默认 iPhone 14 Plus（UDID `00008110-001A69110CC1401E`）已安装 **1.0.0 (166)**。现有真机用例 1 通过、0 失败、0 跳过，覆盖中文普通字号、德文深色最大字号、依据展开/收起和收藏往返；截图已复查。
- 严格签名、本项相关源码输入和构建包哈希通过；测试 Runner 移除，普通启动 **PID 4245** 与实际进程一致，普通 SideSeat 97 保留。
- 本轮只改原生布局。后端沿用记录的 `dpl_BVCgbmcppQWWQ1G4dA8xToHc1bNr`，没有后端或网页发布；测试使用原生固定样例，未重跑真实推荐 API。
- 其他计划页面、网页和工具生成的工作区编辑未纳入本项提交和验收。

[QA 与截图](../qa/2026-10-20-together-card-spacing.md)、[真机摘要](../qa/evidence/2026-10-20-together-card-spacing/phone-summary.json)、[安装与普通启动](../qa/evidence/2026-10-20-together-card-spacing/phone-delivery.json)、[签名和包哈希](../qa/evidence/2026-10-20-together-card-spacing/phone-build-manifest.json)。
