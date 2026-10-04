# Preview 93：两条主闭环完整复跑

日期：2026-10-04，Europe/Berlin。应用实现对应 `6ecd35884cb2f722196afa025c9e70d81a0d5b49` / Preview 93；本轮起点 `ab0994b`。

**两条主闭环均已从全新隔离数据完整通过：共 9 个原生 UI 方法，0 失败、0 跳过、0 重试，两套独立数据库核验通过。** 未发现新的产品故障或需要另行设计的重大问题；本次修改仅为测试库白名单、报告及证据。

## 阶段一：1 → 2 → 3 → 6 → 3

**完整通过。** 两个新测试账号从发布意愿、推荐收藏、招呼与回复开始，完成首次邀约、对方接受、双方日历、双方活动反馈、原聊天继续联系，再从原聊天发起第二次邀约。第二次接受后双方日历均保留两次活动，重登与历史计划切换通过。

| 实际操作 | 结果 |
| --- | --- |
| 发布 → 推荐／收藏 → 招呼／回复 → 首次计划 → 双方日历 | 1 个原生 UI 方法通过；独立数据库核验两条来源意愿 ENDED、一个计划、两条日历、尚无反馈 |
| 活动结束 → 未反馈先打开再约并取消 → 双方分别反馈 → 原聊天发消息 | 1 个 UI 方法通过；取消未产生额外计划 |
| 从原聊天再约，重新选择时间，发送第二次独立计划 | 1 个 UI 方法通过；数据库核验 PENDING 时新增日历为 0，首次两条日历保留 |
| 对方接受 → 双方日历 → 重登 → 旧计划进入聊天 → 再约取消 → 返回当前计划 | 1 个 UI 方法通过 |
| 重开聊天 → 最新计划可见 → 历史与当前计划切换 | 1 个 UI 方法通过 |

合计 **5 个 UI 方法通过，0 失败、0 跳过**，无中断恢复或失败重试。[测试汇总](evidence/2026-10-04-preview93-full-loops/same-peer-results.json)。

[首次状态](evidence/2026-10-04-preview93-full-loops/same-peer-first-state.json)、[第二次待接受](evidence/2026-10-04-preview93-full-loops/same-peer-second-pending.json)、[最终数据](evidence/2026-10-04-preview93-full-loops/same-peer-final-state.json)独立于 UI 文案核验：2 条原意愿、1 次推荐、1 个原聊天、2 个不同的 ACCEPTED 计划、4 条日历、首次双方 2 份 OCCURRED 与 1 次共同经历，第二次反馈为 0。没有重新匹配、覆盖原计划或把再约当成改期。

关键截图：[首次确认](evidence/2026-10-04-preview93-full-loops/same-peer-01/closed-loop-08-plan-confirmed.png)、[再次邀约](evidence/2026-10-04-preview93-full-loops/same-peer-02-repeat/closed-loop-same-peer-14-second-plan-sent.png)、[第二次确认](evidence/2026-10-04-preview93-full-loops/same-peer-03/closed-loop-same-peer-16-second-plan-accepted.png)、[Alex 日历](evidence/2026-10-04-preview93-full-loops/same-peer-03/closed-loop-same-peer-18-calendar-alex.png)、[Mia 日历](evidence/2026-10-04-preview93-full-loops/same-peer-03/closed-loop-same-peer-17-calendar-mia.png)。

本阶段未发现新的产品故障；只扩充本地核验脚本的专用测试库白名单，没有修改应用实现。

## 阶段二：1 → 2 → 3 → 6 → 1

**完整通过。** 在第二个全新数据库中，Alex 与 Mia 从发布、推荐、招呼及回复开始重新成约；双方反馈后，Alex 从已结束计划的「发布新意愿」入口创建新的图书馆咖啡意愿，进入与 Lee 的下一轮推荐，原关系与记录保留。

| 实际操作 | 结果 |
| --- | --- |
| 发布 → 推荐／收藏 → 招呼／回复 → 首次计划 → 双方日历 | 1 个原生 UI 方法通过；独立数据核验首次计划及双方日历 |
| 尚未反馈时，从计划页与聊天打开新意愿并取消；再约入口仍可用 | 1 个 UI 方法通过；标题预填、时间待定、类别须选择，取消后仍只有 2 条原意愿、1 个原计划、2 条日历、0 反馈 |
| 双方分别反馈活动发生，原聊天继续联系 | 1 个 UI 方法通过；两份 OCCURRED、一次共同经历、活动后双方消息均持久化 |
| Lee 发布 → Alex 从已结束计划发布新意愿 → 双方新推荐 → 重登 → 原收藏返回旧聊天 | 1 个 UI 方法通过；Alex 与 Lee 相互进入推荐，未重新推荐已结束意愿的 Mia；原收藏保持私密 |

合计 **4 个 UI 方法通过，0 失败、0 跳过**，无中断恢复或失败重试。[测试汇总](evidence/2026-10-04-preview93-full-loops/new-intent-results.json)。

[取消后](evidence/2026-10-04-preview93-full-loops/new-intent-after-cancel.json)、[反馈后](evidence/2026-10-04-preview93-full-loops/new-intent-after-outcomes.json)、[最终数据](evidence/2026-10-04-preview93-full-loops/new-intent-final-state.json)核验：4 条意愿（原 2 条 ENDED、新 2 条 ACTIVE）、2 次推荐、原 1 个聊天、原 1 个计划及 2 条日历、2 份反馈、1 次共同经历、0 再次同行许可。新意愿的时间为 UNDECIDED，未继承旧日期；新推荐没有自动创建聊天、计划或日历。

关键截图：[取消前的新草稿](evidence/2026-10-04-preview93-full-loops/new-intent-06-cancel/closed-loop-return-flow-02-independent-draft.png)、[新意愿发布](evidence/2026-10-04-preview93-full-loops/new-intent-07-publication/closed-loop-return-flow-16-new-publication.png)、[新同伴推荐](evidence/2026-10-04-preview93-full-loops/new-intent-07-publication/closed-loop-return-flow-17-new-company.png)、[原聊天保留](evidence/2026-10-04-preview93-full-loops/new-intent-07-publication/closed-loop-return-flow-18-original-chat-retained.png)、[原收藏返回](evidence/2026-10-04-preview93-full-loops/new-intent-07-publication/closed-loop-return-flow-21-saved-history-chat.png)。

本闭环结束于发布新意愿并进入下一轮推荐，未向 Lee 发招呼或创建第二个计划；后者是下一轮活动，不冒充为本次覆盖范围。

## 环境和证据边界

- 活跃目录 `Sideseat-ios-uxui`，保持 `codex/ios-uxui-20260922` 与原有未提交工作。原生测试使用已有冻结 Development 模拟器构建；294 个构建输入均与冻结清单一致，当前工作区与交付快照仅有两个既有测试／scheme 文件差异，应用实现与 Preview 93 一致。[源码核对](evidence/2026-10-04-preview93-full-loops/source-baseline.json)。
- iPhone 13 mini 模拟器，iOS 26.5，英语、浅色、普通字号。真实原生界面调用活跃工作区 API `127.0.0.1:3033`，并读写独立 PostgreSQL；没有使用内存计划或聊天 fixture。[本地后端基线](evidence/2026-10-04-preview93-full-loops/backend-baseline.json)。
- 第一库 `sideseat_preview93_same_peer_20261004`，第二库 `sideseat_preview93_new_intent_20261004`，均从空库应用 147 个迁移。脚本只预置完整 QA 账号，业务记录由 App 创建。
- 仅将首次已接受计划与对应两条日历的时间移到过去，以进入活动反馈；不合成反馈或共同经历。[第一条时间压缩](evidence/2026-10-04-preview93-full-loops/same-peer-time-compression.json)。
- 原生测试需要反复登录切换角色；分阶段将该独立库的登录限流计数清零，记录在 `*-login-reset.json`。不修改产品限流实现、业务数据或生产配置；本轮不验证登录限流。
- 两轮本地 API 共记录 547 个请求，全部为 200／201，0 个 HTTP 4xx／5xx：[第一条](evidence/2026-10-04-preview93-full-loops/same-peer-api-summary.json)、[第二条](evidence/2026-10-04-preview93-full-loops/new-intent-api-summary.json)。本地编译与串行测试耗时不能用作生产消息时延结论。
- 不包括双实体手机同时在线、生产 APNs、后台／断网恢复、群聊完整流程、游客注册联动或真实 VoiceOver 焦点。此前真机 UI 回归与本次真实本地后端闭环测试分别计证据，不能相互替代。
- 本轮没有产品源码修复，因此继续使用手机上已交付的 Preview 93；没有新安装、生产后端部署或迁移。阶段提交与交付状态见[记录](../releases/2026-10-04-preview93-full-loop-verification.md)。
- 两条闭环的本地 API 及本轮启动的 PostgreSQL 均已停止，测试库与证据保留；Next 自动生成的 `next-env.d.ts`／`tsconfig.json` 变动已恢复，其余既有未提交工作保留。[完成记录](evidence/2026-10-04-preview93-full-loops/completion.json)。

## 复现

原生用例位于 `SocialLiveUITests`；数据库核验使用 `scripts/qa-same-peer-loop.ts` 和 `scripts/qa-new-intent-loop.ts`。先为每条路径建立全新专用空库，设置仅用于该库的登录凭据和本地 API，再执行：

- 第一条：`seed → UI testClosedLoop01… → check-first → advance → UI testSamePeerLoop02Outcomes… → UI testSamePeerLoop02Repeat… → check-second-pending → UI testSamePeerLoop03… → UI testSamePeerLoop04… → verify`。
- 第二条：`seed → UI testClosedLoop01… → check-plan → advance → UI testNewIntentLoop06… → check-plan → UI testNewIntentLoop02… → check-return → UI testNewIntentLoop07PublishFromCompletedPlan → verify`。

完整 xcresult、运行脚本、API 日志保留于本机 `/tmp/sideseat-preview93-full-loops-20261004/`，仓库只保留选择的截图、结构化结果和无凭据数据核验。不对已完成的证据库再次 seed。
