# 同伴再次邀约：实施与回归

日期：2026-10-03。范围：[已批准的两项修复方案](2026-10-03-same-peer-loop-remediation-design.md)，对应第一闭环 `1 → 2 → 3 → 6 → 3`。

## 已实现

- 「计划 → 已结束」和聊天历史卡片新增 **再约一次**；未反馈也可使用，未发生时显示 **重新约时间**。已保存反馈保持私密且可修改。
- 草稿带入同伴、活动标题、类型和地点；备注不复制，时间必须重新选择。可手动选时间或使用现有空闲时间建议。取消无写入，发送后回到原聊天的新计划。
- 聊天顶部按 **待我回复 → 进行中／下次已确认 → 等待对方** 展示真实安排。旧来源标为 **相识意愿**；历史入口明确显示 **正在查看 · 已结束**，可以返回当前安排。
- 多计划列表将改期提案与仍有效的原时间放在同一组。数据由连接范围的完整分页接口提供，脱离已加载消息和原有用户总列表的 100 条上限。

## 实际闭环结果

使用两个新 QA 账号从发布意愿、推荐与收藏、招呼与回复开始，完成首次计划、双方日历、活动后反馈、原聊天再次邀约、接受和第二次日历。除把首次活动时间移到过去以进入反馈阶段外，写入均由真实原生 App 和本地 API 完成。

| 节点 | 验证结果与证据 |
| --- | --- |
| 首次计划及双方日历 | [阶段一：1 UI + 7 单元通过](evidence/2026-10-03-repeat-plan-fix/phase-1-summary.json)；[首次状态](evidence/2026-10-03-repeat-plan-fix/first-plan-state.txt) |
| 未反馈时直接再约，取消后填写反馈 | 两个账号均已执行；[未反馈草稿](evidence/2026-10-03-repeat-plan-fix/closed-loop-repeat-fix-before-feedback-loopqa_a.png) |
| 原聊天直接再次邀约 | [独立 UI 通过](evidence/2026-10-03-repeat-plan-fix/phase-2b-summary.json)；[已发送与顶部等待状态](evidence/2026-10-03-repeat-plan-fix/closed-loop-same-peer-14-second-plan-sent.png) |
| 未接受时 | 新日历 0 条，第一次的 2 条保留；[独立数据库断言](evidence/2026-10-03-repeat-plan-fix/second-pending-state.txt) |
| 对方接受、双方日历及历史回流 | [阶段三 UI 通过，15 项相关单元通过](evidence/2026-10-03-repeat-plan-fix/phase-3-and-units-tests.json)；[接受后](evidence/2026-10-03-repeat-plan-fix/closed-loop-same-peer-16-second-plan-accepted.png)、[A 日历](evidence/2026-10-03-repeat-plan-fix/closed-loop-same-peer-18-calendar-alex.png)、[B 日历](evidence/2026-10-03-repeat-plan-fix/closed-loop-same-peer-17-calendar-mia.png) |
| 最终持久化 | [核验通过](evidence/2026-10-03-repeat-plan-fix/final-state.txt)：1 个原聊天、2 个不同的已接受计划、4 条日历、首次 2 条反馈与 1 条共同经历；第二次无反馈。没有新意愿、新一轮匹配或第三个计划 |

第二个计划的 `originKind`、`originId`、`counterOfId` 和备注均为空，未消费原意愿或改期原活动。`V2_MEET_AGAIN_ENABLED=0` 全程保持关闭，证明直接邀约独立于再次匹配授权。

## 界面与历史定位复验

[重新打开聊天与历史切换测试](evidence/2026-10-03-repeat-plan-fix/history-touch-target-tests.json)通过；同时确认“查看当前安排”的点击区域至少 44pt。历史定位使用“正在查看的计划”，不再把第一次活动标为当前计划。

[中文浅色／德文深色最大辅助字号测试](evidence/2026-10-03-repeat-plan-fix/visual-final-summary.json)验证已结束入口、预填草稿、未选时间不能发送、选择时间后可发送以及聊天真实计划摘要。新增再约和选时间入口的可访问点击区域均至少 44pt。

| 中文 | 德文最大字号 |
| --- | --- |
| [再约草稿](evidence/2026-10-03-repeat-plan-fix/repeat-plan-draft-zh-Hans-light.png) | [再约草稿](evidence/2026-10-03-repeat-plan-fix/repeat-plan-draft-de-dark.png) |
| [当前安排](evidence/2026-10-03-repeat-plan-fix/repeat-plan-header-zh-Hans-light.png) | [当前安排](evidence/2026-10-03-repeat-plan-fix/repeat-plan-header-de-dark.png) |

复验中的滚动脚本先误用通用拖动，再曾命中固定底栏后方的元素；最终改为滚动真实可见列表并检查元素位于底栏上方。测试保留实际点击与禁用状态断言。截图检查另外修正了最大字号时摘要状态被压缩截断的问题。

界面证据不等于完整 VoiceOver 朗读认证。最大字号下，既有反馈胶囊及系统导航标题仍有省略显示；这部分作为整体无障碍布局的后续项记录，没有改动既有反馈业务流程。

## 查询与兼容性

`GET /api/v1/plans?connectionId=…&cursor=…` 在验证连接成员与可见性后，只返回当前有效的 pending/accepted revision，每页 50 条，并用显式 `nextCursor` 表示结束。无 connectionId 的旧列表行为不变，无数据库迁移。

[真实 HTTP 合约测试](evidence/2026-10-03-repeat-plan-fix/query-contract.txt)通过：107 个有效 revision 跨 3 页无遗漏；排除其他连接、过期／取消记录、非当前 revision；改期与已确认时间同时保留；限制访问的 commitment 不泄露，非成员／已结束连接不可读取。

15 项相关原生单元覆盖再次邀约种子、原意愿继承兼容、显式时间选择、聊天定位、摘要优先级、过期过滤、稳定排序和改期分组。OpenAPI 结构校验与 [13 项契约测试](evidence/2026-10-03-repeat-plan-fix/openapi-tests.txt)通过，Swift 客户端重新生成；TypeScript、定向 ESLint 和三语言资源校验通过。

## 实测中修正的细节

1. 编辑活动标题时键盘遮住后续时间入口：编辑页增加键盘 **完成**，收起后继续选时间。测试的文字替换也改用全选，避免光标处于中间时残留旧标题。
2. 未反馈的低强调“再约一次”在可访问树中只有文字大小：明确设置整个 44pt 标签的点击形状。
3. 历史计划的正文定位标记仍叫“当前计划”：改为 **正在查看的计划**，与顶部历史状态一致。

保留失败证据：[首次阶段二](evidence/2026-10-03-repeat-plan-fix/phase-2-initial-summary.json)因键盘后的入口不可达停止，之前两次反馈和消息均已写入；修复后把反馈与再次提议拆成独立测试，继续同一数据库，避免重复写入。阶段三组合结果有 1 项点击区域失败，另外 16 项通过；该失败没有被计为成功，也没有通过删除断言绕过。

## 测试环境与发布边界

- 活跃工作区 `Sideseat-ios-uxui`，保持当前分支与既有未提交工作。
- iPhone 13 mini 模拟器、iOS 26.5、Development 原生 App；真实闭环使用英语。界面检查另用中文浅色和德文深色／最大辅助字号的本地 fixture；fixture 截图不能代替真实业务写入结果。
- 隔离 PostgreSQL `sideseat_repeat_fix_20261003`，147 个迁移；本地 API `127.0.0.1:3033`。APNs 关闭，未接触正式数据库。
- 本次没有发布后端或安装新的手机 Preview。发布时须先更新后端读接口，再分发原生版本；旧后端缺少分页完整性字段，新客户端会提示刷新失败，不会伪装成没有计划。
- 本轮 API 与数据库进程已停止，隔离数据保留；Next 自动产生的临时构建目录配置已恢复到本轮修改前。
- 两台实体手机的推送、正式消息时延和断网恢复仍需发布后验证；第二闭环 `1 → 2 → 3 → 6 → 1` 未在本次扩展测试。

复现代码：`scripts/qa-same-peer-loop.ts`、`scripts/qa-conversation-plans.ts`、`SocialLiveUITests`、`ConversationPlansTests`、`VisualQAScreenshotUITests.testRepeatPlanEntryAndDraftLocalizedAppearance`。新空库顺序：`seed → UI 01 → check-first → advance → UI 02 Outcomes → UI 02 Repeat → check-second-pending → UI 03 → UI 04 → verify`；不要向已保留测试数据的库重复 seed。


完整 xcresult 保留在本机 `/tmp/sideseat-repeat-fix-*-20261003.xcresult`。对应代码版本见[源文件哈希](evidence/2026-10-03-repeat-plan-fix/tested-source-hashes.json)，包含基线哈希的条目可与本轮改动前区分；生成客户端与此前已有的未提交工作均予以保留。

Git 归档时将种子脚本中的固定本地测试密码改为必填 `SIDESEAT_QA_PASSWORD`；该值须与本地 UI fixture 一致，不能提交真实账号凭据。此调整只影响准备空测试库，不改变已验证的 App 或 API。
