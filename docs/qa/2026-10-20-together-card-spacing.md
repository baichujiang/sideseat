# 同行推荐卡片：收紧资料行下方留白

用户指出「推荐依据 / 查看资料」下方空白偏大。移除操作区额外的 8pt 顶部 padding，保留外层 8pt 间距；该行与收藏/打招呼按钮之间从 16pt 收紧为 8pt。文字、按钮点击范围及推荐依据展开/收起行为保持原状。

默认 iPhone 14 Plus（UDID `00008110-001A69110CC1401E`）已核验设备身份，Preview 166 签名构建及现有 `testRecommendationContextAndActions` 真机用例通过，1 通过、0 失败、0 跳过。覆盖中文普通字号、德文深色最大辅助字号的依据展开/收起、打招呼按钮可达且高度至少 44pt、收藏往返；附带公开意愿来源场景通过。新增收起状态截图，未新增用例。中文截图人工复查下方间距和完整操作区；最大字号内容按现有方式纵排滚动，操作可达。

这是原生布局与固定样例交互验收，未重跑真实推荐 API 或发送真实招呼。本轮无后端、网页、Schema 或生产数据变更。构建期间出现的其他计划页面和网页编辑保留在工作区，未纳入本次提交和验收；签名与包哈希、与本项有关的源码输入核对见下方清单。

- [真机摘要](./evidence/2026-10-20-together-card-spacing/phone-summary.json)
- [中文收起状态](./evidence/2026-10-20-together-card-spacing/phone-recommendation-context-collapsed-zh-Hans.png)
- [中文展开状态](./evidence/2026-10-20-together-card-spacing/phone-recommendation-context-zh-Hans.png)
- [德文最大字号](./evidence/2026-10-20-together-card-spacing/phone-recommendation-context-collapsed-de.png)
- [签名、包哈希与本项源码](./evidence/2026-10-20-together-card-spacing/phone-build-manifest.json)
