# 我的意愿：收紧寻找状态行上下留白

用户指出「我的意愿」卡片中「正在寻找」上下留白偏大。卡片内容顶部 inset 从 20pt 收紧到 12pt，详情纵向间距从 12pt 收紧到 8pt；保留左右与底部 20pt、状态胶囊样式，以及暂停/恢复按钮至少 44pt 的点击区域。已暂停和历史卡片共用同一详情布局。

默认 iPhone 14 Plus（UDID `00008110-001A69110CC1401E`）设备身份已核验。Preview 168 签名构建与现有 `testIntentionPauseResume` 真机用例通过：1 通过、0 失败、0 跳过。覆盖中文普通字号和德文深色最大辅助字号，完整执行正在寻找 → 暂停 → 已暂停 → 恢复 → 正在寻找；原生固定样例的操作没有进入编辑页。截图人工复查中文正常/暂停卡片与最大字号的原纵排布局。

本项只改原生布局，未新增测试用例，未重跑真实推荐 API。本项没有后端、网页、Schema 或生产数据变更。构建包含此前已提交的计划时间块实现 `00cc7c3d`，但本项未重新验收计划流程；其他聊天正在进行的后端/网页和计划测试编辑未纳入本项提交。

- [真机摘要](./evidence/2026-10-20-intent-status-spacing/phone-summary.json)
- [中文正在寻找](./evidence/2026-10-20-intent-status-spacing/phone-intention-resumed-zh-Hans.png)
- [中文已暂停](./evidence/2026-10-20-intent-status-spacing/phone-intention-paused-zh-Hans.png)
- [德文最大字号](./evidence/2026-10-20-intent-status-spacing/phone-intention-resumed-de.png)
- [签名、构建包哈希和相关源码](./evidence/2026-10-20-intent-status-spacing/phone-build-manifest.json)
