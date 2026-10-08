# SideSeat 完整用户闭环测试报告

日期：2026-09-26  
结论：**本地真实客户端、API 和数据库的指定主闭环通过。** 未发现阻断此主路径的产品缺陷。本结论不等于生产发布、付费权益或真机推送已验收。

## 1. 测试范围与方法

验证链路：

**发布意愿 → 获得推荐 → 收藏 → 打招呼 → 对方回复 → 聊天 → 提议计划 → 对方接受 → 双方日历 → 计划结束 → 双方完成反馈 → 继续聊天 → 新意愿 → 新同行推荐。**

- 工作目录：`/Users/baichu/Desktop/项目/app开发项目/Sideseat-ios-uxui`，保留当前分支与已有未提交修改。
- 客户端：Development 原生 App，iPhone 17 Pro 模拟器，iOS 26.5，英文、普通字号、浅色。
- 服务端：当前工作目录的 Next.js API，`http://127.0.0.1:3033`。
- 数据库：独立本地 PostgreSQL `sideseat_loop_20260926`；未访问生产库。
- 三个新建测试账号：Alex、Mia、Lee。账号资料由夹具初始化；意愿、收藏、消息、计划、接受和完成反馈全部通过原生界面与真实 API 操作。
- 同一模拟器依次切换账号，包含多次退出重开，以检查保存后的状态；没有使用演示意愿、演示聊天或模拟成功响应。
- 自动匹配、灵活时间、探索功能启用；Meet Again 关闭。本轮“新同行”指第三个人，不等同于与同一人再次匹配。
- 时间处理：第一段计划接受后，先核对双方日历，再仅将这次测试计划及对应日历时间移至过去。没有直接写入完成反馈或共同经历。**没有等待真实计划时长，也没有验证后台自然到期通知。**

## 2. 逐步结果

| 阶段 | 实际操作与检查 | 结果 |
| --- | --- | --- |
| 意愿 | Alex、Mia 各自创建咖啡意愿，时间待商议；保存成功且无需旧版“开始匹配”按钮 | 通过 |
| 推荐 | Mia 看到 Alex 的意愿、学校、语言与操作按钮 | 通过 |
| 收藏 | 点击感兴趣后卡片离开推荐；进入我的收藏可找到原卡片；收藏归属只在当前账号 | 通过 |
| 首条消息 | 从收藏打招呼，发送后立即进入消息页；首条消息可见，回复前没有继续发送入口 | 通过 |
| 回复与聊天 | Alex 从消息入口打开请求并回复；转入正常聊天，首条消息和回复都保留 | 通过 |
| 意愿详情与计划 | 点击聊天顶部打开意愿卡片，再制定计划；标题继承，时间未定时必须明确确认提议时间 | 通过 |
| 接受与日历 | Mia 接受计划，两人分别登录查看日历，均出现同一计划 | 通过 |
| 完成与继续聊天 | 结束后两人分别在计划的“已结束”页选择已发生，再进入原聊天发送消息 | 通过 |
| 寻找新同行 | Lee 发布新意愿，Alex 再发布新意愿后得到 Lee 的推荐；原来的 Mia 不回到该推荐列表 | 通过 |
| 历史入口 | Mia 仍可从原收藏进入与 Alex 的聊天，看到完成后的消息 | 通过 |

数据库独立核对同时通过：

- 只有 **1 份计划提议、1 个已确认承诺、2 份日历投影**，两份投影分别属于参与者。
- 计划保留 `MUTUAL_OPPORTUNITY` 来源，没有丢失意愿上下文。
- 接受后原来的 **2 条来源意愿均为 ENDED**。
- 首条消息和回复各保存一次；收藏记录为 1 条。
- 完成阶段产生 **2 份 OCCURRED 反馈、1 条 SharedEncounter**。
- 原会话保持 ACTIVE，完成后的两条消息各保存一次。
- Alex 与 Lee 出现新的 PENDING 推荐；聊天总数仍为 1，新推荐没有自动建立新聊天。

[计划状态证据](evidence/2026-09-26-closed-loop/plan-state.txt) · [最终状态证据](evidence/2026-09-26-closed-loop/final-state.txt) · [时间压缩记录](evidence/2026-09-26-closed-loop/time-compression.txt)

## 3. 自动化验证

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 原生编译 | 通过 | `/tmp/sideseat-loop-build.log` |
| 第一段真实 UI：意愿至双方日历 | 1 通过，0 失败，0 跳过 | [摘要](evidence/2026-09-26-closed-loop/phase-1-summary.json)；`/tmp/sideseat-loop-01-ready.xcresult` |
| 第二段真实 UI：完成至新同行与旧聊天 | 1 通过，0 失败，0 跳过 | [摘要](evidence/2026-09-26-closed-loop/phase-2-summary.json)；`/tmp/sideseat-loop-02.xcresult` |
| 相关 PostgreSQL 回归 | 11 通过，0 失败，1 跳过 | [完整结果](evidence/2026-09-26-closed-loop/domain-tests.txt) |
| TypeScript 类型检查 | 通过 | `/tmp/sideseat-loop-tsc-final.log` |
| 修改格式检查 | `git diff --check` 通过 | 本地执行 |

数据库回归覆盖：私密收藏、首条消息竞争/重复提交、回复创建唯一聊天、未授权访问、屏蔽/不可用意愿、收藏和已联系卡片过滤、计划接受后的来源关闭，以及同一人的再次同行领域逻辑。

跳过项为 Meet Again 的可选 HTTP 路由测试：没有提供它要求的 `LAYER3_LOCAL_HTTP_URL`。其领域测试通过，但这不能替代该 HTTP 测试。本轮真实 App 主闭环没有跳过步骤。

本轮没有重跑全仓库测试、全部旧版 UI 用例、全语言/字号矩阵或性能压力测试。

## 4. 本轮遇到的问题及处理

| 问题 | 分类与处理 | 复验 |
| --- | --- | --- |
| 新安装时系统通知授权弹窗干扰自动登录后的断言 | 测试准备问题；真实登录辅助流程增加系统弹窗处理，没有绕过登录、校园身份或业务校验 | 两段真实 UI 通过 |
| 新建账号缺少在读状态，被正确引导到校园背景设置 | 测试数据问题；补全账号的在读状态，且修正可复现初始化脚本 | 后续真实登录和匹配通过 |
| README/PRODUCT/USER_FLOW 仍有“无收藏、先双向感兴趣”的旧描述 | 文档问题；按用户已确认的收藏、首条消息、回复后聊天和主动寻找流程同步。未改动收费、披露或历史策略 | 文档链接与修改格式检查通过 |
| 首次 XCTest 执行返回成功但实际发现 0 个测试 | 工具执行问题；核对测试发现结果后重新执行，只把有真实执行计数的结果记为通过 | 摘要分别记录 1 个实际通过测试 |

本轮没有发现需要重构聊天、计划或数据模型才能完成指定闭环的问题，因此没有为了测试更改现有产品机制。上次“寻找更多”任务中修复的列表布局卡顿属于前一轮修改，不重复列为本轮修复。

本轮新增/调整：`scripts/qa-closed-loop.ts`、`LiveLoginSmokeUITests.swift` 中两段真实闭环用例与通知弹窗处理、README/PRODUCT/USER_FLOW 的既有产品决定同步、本报告及证据文件。

## 5. 不完美之处与必须人工决定的事项

后续管理工具：[邀请码网页后台](2026-09-26-invitation-admin.md)本地验证通过，支持共享/独立批次、额度与截止时间、兑换/操作记录和停用。Pipi 的固定账号授权已配置于当前开发环境，线上尚未发布生效。

后续实施进展：[会员身份与邀请码兑换](2026-09-26-membership-invites.md)已在本地通过真实 API、数据库与原生 UI 验证；邀请码支持可配置兑换上限。推荐配额、曝光与 AI 权限仍属后续接入，不能用此结果替代权益验收。

2026-09-26 审查进展：用户已确认内测自动赠送会员、每批 3 张、免费首次加 1 批共 6 位，以及 Plus 增加曝光和独享日程 AI 添加。Plus「再点击 3 次」与「共 24 位」存在算术差异，待澄清；[会员方案草案](2026-09-26-membership-design.md)已更新。赠送期限、曝光权重和收费方式仍是建议，尚未实现或验收，不改变下表的测试事实。

下表是**产品规则的待定项**，不代表本轮主流程失败。涉及收费、身份披露和用户历史，不能仅凭技术实现替代产品决定。

| 优先级 | 当前事实 / 不足 | 建议方案 | 需要人工明确的决定 |
| --- | --- | --- | --- |
| 上线前 | 免费原生预设 5 张、Plus 预设 10 张；Plus 仍为 DEBUG 预览，正式服务端封顶 5 张。“重新寻找”刷新同一结果集，没有游标分页，可能继续显示同一批人 | 先统一服务端权益与计数规则，再实现继续加载或换一批；重复看到同一人不重复扣额度 | 免费/付费具体人数；按次、按日还是按意愿计数；“重新寻找”应刷新还是换一批 |
| 上线前 | 推荐卡片已有昵称头像；额外探索来源仍保留不同的身份披露规则，未联系时部分卡片只有活动、学校和语言 | 在“发布意愿”中明确公开字段；统一卡片样式时保留真实的披露边界 | 公开意愿是否允许所有符合条件的人在打招呼前看到昵称头像；不能仅因合并页面而扩大披露 |
| 产品确认 | 时间未定的意愿可以没有到期时间；本轮确实使用该路径。它与“每张卡片都有固定时间、不会复用”的最初设想并不完全相同 | 保留时间待商议，同时设置明确有效期或定期由创建者确认仍在寻找 | 是否允许长期未定时间意愿；若不允许，有效期多久、到期如何提示 |
| 产品确认 | 收藏实际上是私密保存，但已收藏按钮英文仍为 “Interest shown”，可能让人以为对方已收到兴趣通知 | 状态文案改成明确的“已收藏”；初始“感兴趣”是否保留由产品统一 | 收藏按钮是否统一叫“收藏/已收藏”，还是继续保留“感兴趣”表述 |
| 产品确认 | “计划结束”与“确实发生”是两件事；当前要等计划时间结束再各自反馈，只有双方均报告发生才形成共同经历 | 保留双方独立反馈；可以优化反馈入口与提醒，但不把时间到期自动算作完成 | 是否允许提前完成；单方反馈如何呈现；是否需要提醒及提醒频率 |
| 产品确认 | 计划列表 API 当前只返回最近 14 天的已结束计划，尚无完整历史分页；收藏则可能长期累积 | 近期反馈与长期历史分开，历史入口分页；已失效收藏保留原因和聊天入口 | 计划历史应展示多久；已过期/删除意愿的收藏保留、折叠或清理规则 |
| 发布验收 | 本轮是单模拟器轮换真实账号，APNs 投递关闭；没有两台真机同时在线、断网重连、杀进程后的推送点击验证 | 保留当前通过结果，发布候选版本再做双真机验收 | 由谁验收哪个签名版本；确认前不能把本报告当作上线批准 |

规则来源：

- 数量和刷新：`ExploreIntentModels.swift` 的 `ExploreAccessTier`、`ExploreIntentStore.load`、`TogetherRootView.loadExploration`，服务端 `lib/v2/explore-intents.ts`。
- 身份披露：`lib/v2/mutual-opportunities.ts` 的 `hideExploreIdentity`，以及额外探索返回字段。
- 未定时间生命周期：`lib/v2/weekly-intents.ts`、`lib/v2/intent-timing.ts`；本次来源意愿在计划接受时结束。
- 收藏文案：`SSFlowCard.swift` 的 `SSIntentionActionRow`。
- 完成反馈与历史范围：`lib/api/v1/plans-service.ts` 的 `recordPlanOutcome` 和 `listPlansForUser`。

README/PRODUCT/USER_FLOW 中与本轮已确认交互直接冲突的旧说明已同步；历史发布记录仍保留原版本事实。上述待定规则没有借文档更新被默认为已批准。

## 6. 视觉证据

截图为本轮真实本地 API 流程，账号和内容均为测试数据。

| 阶段 | 截图 |
| --- | --- |
| 收藏 | [原卡片进入收藏](../visual-qa/closed-loop-03-saved.png) |
| 首条消息 | [等待回复的聊天页](../visual-qa/closed-loop-04-first-message.png) |
| 双方聊天 | [首条消息与回复](../visual-qa/closed-loop-05-replied-chat.png) |
| 计划 | [确认提议时间](../visual-qa/closed-loop-07-plan-proposal.png) · [对方接受](../visual-qa/closed-loop-08-plan-confirmed.png) |
| 双方日历 | [Mia](../visual-qa/closed-loop-09-calendar-mia.png) · [Alex](../visual-qa/closed-loop-10-calendar-alex.png) |
| 完成反馈 | [Alex](../visual-qa/closed-loop-11-outcome-loopqa_a.png) · [Mia](../visual-qa/closed-loop-11-outcome-loopqa_b.png) |
| 继续聊天 | [完成后发送消息](../visual-qa/closed-loop-12-continued-chat-loopqa_b.png) |
| 新同行 | [出现 Lee 的新推荐](../visual-qa/closed-loop-13-new-company.png) |
| 旧收藏入口 | [仍可打开原聊天](../visual-qa/closed-loop-14-saved-history-chat.png) |

## 7. 复现入口

测试源：`ios-native/SideSeatUITests/LiveLoginSmokeUITests.swift`。

1. 使用独立的本地 `sideseat_loop_20260926` 数据库，应用当前 Prisma 迁移。初始化脚本只允许这个本地库，`seed` 只接受空账号库；重跑时不要清理其他开发库。
2. 执行 `LOCAL_TEST_DB_NAME=sideseat_loop_20260926 node scripts/with-local-test-db.mjs npx tsx scripts/qa-closed-loop.ts seed`。
3. 在该数据库上启动当前代码的 API；启用 `V2_WEEKLY_INTENT_ENABLED`、`V2_MUTUAL_OPPORTUNITY_ENABLED`、`V2_ACTIVITY_FIT_ENABLED`、`V2_FLEXIBLE_TIMING_ENABLED`、`V2_AUTOMATIC_MATCHING_ENABLED`、`V2_DISCOVERY_MATCHING_ENABLED`、`V2_EXPLORE_INTENTS_ENABLED`。Meet Again 保持关闭。
4. 原生 `build-for-testing` 时传入 `SIDESEAT_LIVE_UI_TESTS=1`、`SIDESEAT_LIVE_API_BASE_URL=http://127.0.0.1:3033`，随后使用生成的 xctestrun。
5. 先执行 `SocialLiveUITests/testClosedLoop01IntentBookmarkGreetingPlanAndCalendars`。
6. 在同一隔离库执行脚本 `check-plan`，再执行 `advance`。这是明确的测试时间压缩步骤。
7. 执行 `SocialLiveUITests/testClosedLoop02OutcomesContinueChatAndFindNewCompany`，最后执行脚本 `verify`。
8. 必须检查 xcresult 实际测试计数、失败与跳过状态；单凭命令退出码不能证明闭环通过。

没有提交、推送、生产迁移、部署或 TestFlight 上传。本轮证据证明当前本地代码的指定主闭环可用。
