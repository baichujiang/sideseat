# 聊天计划栏与反馈修复实测

执行[补全方案](2026-10-04-chat-plan-accessibility-repair-plan.md)。基线 Preview 91，保持分阶段提交、推送和手机 Preview 交付。

## 阶段 A：聊天计划栏与导航

已实现：按可用高度及字号选择完整／紧凑摘要；紧凑栏保留短状态和完整读屏标签。历史计划来自原消息，不被只含当前计划的列表覆盖。返回当前计划与返回最新消息分开处理；离开底部即显示最新入口，并在滚动区域外占位。菜单取消保持选择，定位较高的计划卡片时从顶部显示。定位失败保留阅读位置并提供重试。输入框根据实际剩余高度调整可见行数，保留草稿和光标。

### 发现、修复与复测

- 先在 Preview 91 应用源码上复现：[旧版失败](evidence/2026-10-04-chat-plan-repair/baseline-bounds-summary.json)、[边界](evidence/2026-10-04-chat-plan-repair/baseline/chat-layout-bounds.txt)、[截图](evidence/2026-10-04-chat-plan-repair/baseline/closed-loop-chat-header-bounds-de.png)。此基线只增加测试，不改变应用实现。
- 初次修复的局部检查及 8 项计划模型测试通过，但扩展矩阵发现最新入口未显示：[扩展失败](evidence/2026-10-04-chat-plan-repair/stage-a-matrix-summary.json)。短聊天采用非惰性布局，既有底部 sentinel 用 onAppear 误判实际可见性。改为测量真实视口与底部坐标，避免历史阅读被误认为已到底部。
- 同轮多计划测试需要滚动到列表下方，原来的按文本子元素查询未找到目标。给真实选择按钮增加稳定标识，并在列表中滚动到可操作位置；未跳过选择动作。
- 修复后的 iPhone 13 mini / iOS 26.5：8 项模型测试及 2 个 UI 方法通过，0 失败、0 跳过：[结果](evidence/2026-10-04-chat-plan-repair/stage-a-matrix-retry-summary.json)。UI 方法覆盖中英德 × 普通浅色／最大字号深色；最大字号长草稿、键盘、无当前计划时返回最新；以及离线隔离 fixture 的历史／取消计划、多当前计划、关闭选择页、选择另一计划、返回最新。
- 测试中“返回最新”保留草稿并清除历史定位；有当前计划时恢复默认摘要，但消息停在最新处。长草稿输入后消息区仍有至少 112 pt 高度（最大字号约两行正文），输入区在键盘上方且发送可用。相关截图与边界位于 [stage-a](evidence/2026-10-04-chat-plan-repair/stage-a/)。
- 本地 QA 数据在阶段 A 前后完全相同：[之前](evidence/2026-10-04-chat-plan-repair/before-state.json)、[之后](evidence/2026-10-04-chat-plan-repair/stage-a-after-state.json)。未新增反馈、计划、日历、意愿或联系。
- 常规尺寸复测又发现入口偶发隐藏。截图与控件坐标证实历史卡片已经定位成功，但返回入口仍受旧的底部状态影响。将几何监听改为持续记录实际底部坐标，并直接以坐标和视口决定入口可见性；键盘收起后的显式定位单独排队，保留草稿。最终冻结源码在两台设备通过：iPhone 13 mini 共 10 项（8 模型＋2 UI），iPhone 17 共 2 个 UI 方法，均 0 失败、0 跳过；分别见 [mini](evidence/2026-10-04-chat-plan-repair/stage-a-final-mini-summary.json)、[常规屏](evidence/2026-10-04-chat-plan-repair/stage-a-final-regular-summary.json)。两个 UI 方法各覆盖 6 个语言／字号组合和 2 种历史计划状态，最终截图分别位于同名目录。提交一致性与手机交付见 Preview 92 发布记录。此次不声称已完成阶段 B 或完整闭环重跑。

## 阶段 B：反馈与最终回归

已实现反馈状态块、完整换行选项、局部取消修改、保存进度及未确认错误，并修复实测暴露的键盘、字号和实时接收问题。

- 首轮反馈矩阵在登录前被本地 QA 的 10 次／15 分钟登录限制阻止，未进入反馈页面；归为测试环境失败，不计为界面验收。仅将专用本地数据库的登录计数归零；没有修改产品限流或生产配置。后续两个模拟器通过不同本地测试来源隔离登录计数。
- 复查阶段 A 截图发现默认底部锚点在键盘开关时可能改变历史位置。补充“输入长草稿后原计划标题仍可见”的断言，并移除自动应用于尺寸变化的底部锚点；初始进入和用户显式返回最新仍由已有定位逻辑处理。新增阅读位置断言后已在最终小屏矩阵通过；旧版本只验证草稿保留的结果不作为此项证据。

### 辅助功能验收的证据边界

原生自动化验证完整标签、私有状态值、选中语义、最小触区和布局。另尝试开启 macOS 旁白并通过模拟器进行实际导航，但当前控制环境未能把旁白焦点送入 App 内容，无法确认朗读或关闭表单后的真实焦点落点。系统旁白已恢复原先关闭状态。真实 iPhone VoiceOver 走查仍待完成，不能用自动化标签测试替代或声称已通过。

10 月 4 日续验确认当前工具链为 Xcode 26.6（17F113），其 XCTest／XCUIAutomation 头文件没有 VoiceOver 测试接口。[Apple 的 Xcode 27 发布说明](https://developer.apple.com/documentation/xcode-release-notes/xcode-27-release-notes?changes=_5_1_2) 将驱动旁白、检查朗读及焦点的 `XCUIVoiceOverService` 列为 27 beta 3 新增功能。本轮没有重复更改 Mac 旁白或升级开发工具链。手机用户随后实际确认历史计划摘要的名称和时间读完整；其余朗读与真实旁白焦点未核实。原生 XCTest 已能直接操作这台 iPhone 的 Preview，操作结果与旁白结果分别记录。见[读屏验收记录](evidence/2026-10-04-chat-plan-repair/voiceover-attempt.json)。

### 补充测试发现的问题

- 最大字号下，引用回复、键盘和当前计划摘要同时出现时，常规屏的消息区仅 10 pt，测试准确失败。修复为：单个更多图标与换行状态并列；大字号输入期间引用预览改为短入口，完整引用保留在读屏值中，收起键盘恢复完整预览。草稿和引用关系不变。此变更在 Preview 93 交付，另做双尺寸复测。
- 首次严格反馈截图测试的小屏慢速滚动次数不足，未走到长聊天后面的反馈控件。保留失败结果，改用实际屏幕边界、按目标距离调整的拖动，并增加完整状态块进入视口的断言；不通过跳过滚动或删除断言掩盖问题。

- 引用回复的小屏复测仍失败，补充边界证据发现 UITextView 只有 64 pt，但已隐藏的德语占位文字仍撑开外层容器，消息区只剩 10 pt。将占位文字改为不参与测量的 overlay，并同步限制可见输入高度；这是实际界面缺陷，不降低原验收阈值。修复后重新执行小屏引用回复与键盘回归。

- 小屏最大字号＋历史计划仍有当前计划＋键盘场景，日期／选中提示和最新入口进一步占用空间。卡片定位改为正文锚点，字号变化保存当时阅读的消息；输入期间“最新”使用输入行的 44 pt 向下入口，收起键盘恢复完整文字。空间预算改用随 SwiftUI 字号实时更新的正文行高。
- 真实双账号新消息测试发现消息未进入原生聊天。用独立本地 SSE 响应证实 `URLSession.AsyncBytes.lines` 会略去空行，原解析器一直等不到事件终止符。共享解码器改为逐字节保留空行，并支持完整 UTF-8 与 CRLF；私聊和同样使用该解码器的群聊接收入口同步接入，后端无需改动。增加解析测试与真实账号复测，失败记录保留。

- 截图复查发现回到最新消息后，来源意愿栏仍沿用大字号完整描述，占用过多固定空间。补齐同样的紧凑入口，完整来源、标题和时间保留于读屏标签及详情页；再补中英德双尺寸的键盘与详情返回测试。

## 最终验收记录

以下为本轮原生测试；不把旧报告的完整闭环结果算作本轮从头复跑。

| 验收范围 | 结果与证据 |
| --- | --- |
| 计划页、聊天反馈完整可见，中英德 × 普通／最大字号，编辑取消 | 小屏 1 个 UI 方法通过，常规屏 28 模型＋1 UI 方法通过；UI 方法各包含 6 组、两个入口。[小屏](evidence/2026-10-04-chat-plan-repair/stage-b-visible-feedback-mini-summary.json)／[常规屏](evidence/2026-10-04-chat-plan-repair/stage-b-visible-feedback-regular-summary.json) |
| 未回答、发生／未发生、私有值、深浅色与普通引用回复 | 前述矩阵及 20 模型＋2 UI 专项回归通过。[专项结果](evidence/2026-10-04-chat-plan-repair/stage-b-scroll-regression-summary.json) |
| 提交失败 → 原值保持 → 重试 → 聊天一致 → 恢复 → 重新登录 | 1 个真实后端 UI 方法通过，代理只对本地 QA 计划注入一次 503。[结果](evidence/2026-10-04-chat-plan-repair/stage-b-post-failure-summary.json)／[注入记录](evidence/2026-10-04-chat-plan-repair/post-failure-events.json) |
| 提交成功、读回失败 → 未确认提示 → 重试与重新登录 | 1 个真实后端 UI 方法通过，没有把提交成功直接当成界面确认。[结果](evidence/2026-10-04-chat-plan-repair/stage-b-readback-failure-summary.json)／[注入记录](evidence/2026-10-04-chat-plan-repair/readback-failure-events.json) |
| 键盘打开期间，系统字号普通 → 最大 → 普通 | 1 个小屏 UI 方法通过；检查真实环境字号、原计划正文可见、至少 112 pt 消息区、发送可达、草稿保持；恢复模拟器原字号。[结果](evidence/2026-10-04-chat-plan-repair/stage-b-runtime-size-inline-summary.json)／[切换记录](evidence/2026-10-04-chat-plan-repair/runtime-size-final-events.json) |
| SSE 分隔与多字节字符、真实新消息、历史位置及草稿 | 2 模型＋1 UI 方法通过。Mia 通过本地 API 发送，Alex 原生 App 实际接收；验证提示数量、位置 ±12 pt、原计划选择及点击最新后的消息可见。[结果](evidence/2026-10-04-chat-plan-repair/stage-b-realtime-final-summary.json) |
| 最终小屏键盘／引用／计划选择回归 | 3 个 UI 方法通过，含 6 组语言／字号、两种历史状态、多当前计划、引用草稿；最拥挤引用场景消息区为 141.33 pt，输入一行为 64 pt。[结果](evidence/2026-10-04-chat-plan-repair/stage-b-final-layout-mini-summary.json)／[边界](evidence/2026-10-04-chat-plan-repair/stage-b-final-layout-mini/chat-layout-bounds-quote.txt) |
| 两条闭环受影响路径与常规屏引用回复 | 3 个 UI 方法通过，0 失败、0 跳过；覆盖新意愿取消、来源保留、新推荐、再约取消与引用草稿。[结果](evidence/2026-10-04-chat-plan-repair/stage-b-final-continuations-regular-summary.json) |
| 返回最新后的来源意愿入口、键盘与详情返回 | 小屏、常规屏各 1 个 UI 方法通过；每个方法覆盖中英德最大字号、至少 112 pt 消息区、发送可达、完整来源标签及关闭详情后的草稿。[小屏](evidence/2026-10-04-chat-plan-repair/stage-b-context-mini-summary.json)／[常规屏](evidence/2026-10-04-chat-plan-repair/stage-b-context-regular-summary.json) |

反馈提交和读回失败测试使用专门的本地代理，生产后端及其限流、配置、数据没有被改动。测试临时把 Alex 的已发生反馈改为未发生，再恢复已发生；Mia 的反馈不变。对比前后原计划 ID／内容／状态／时间、双方日历 ID／时间／投影状态及七条原消息完全一致；两个最终意愿仍未做同行决定，Meet Again 权限仍为零。新消息测试仅新增两条带 `[chat-repair-qa]` 前缀的消息，分别来自失败复现与修复验证。见 [数据核对](evidence/2026-10-04-chat-plan-repair/stage-b-data-verification.json)。

本轮覆盖两条闭环中受影响的反馈、原聊天续行、再约／新意愿表单取消、新推荐和历史保留路径。未从全新数据重复执行两条完整闭环；没有据此宣称完整新闭环从头通过。共享 SSE 解码器的群聊接入通过编译及解析测试，未增加群聊端到端验收声明。

### 剩余事项

真实 VoiceOver 只确认了历史计划摘要的名称和时间朗读，其余顺序与返回焦点尚未完成。自动化标签、选中状态、触区及真机页面操作已覆盖，但不能替代实际旁白焦点验收。以下保留为未完整覆盖的读屏范围，不再要求用户继续手工执行：

1. 先从“计划 → 已结束”选择一条历史计划进入聊天，确保该计划摘要可见。开启旁白后，从聊天导航依次进入计划入口、当前计划／更多、消息与最新入口、输入和发送，确认完整朗读及可操作性。直接进入没有当前计划的聊天并不保证出现计划栏。
2. 在同一会话有多条当前计划、确实显示更多入口的前提下，打开再关闭“更多计划”，确认焦点返回入口；选择计划后确认焦点到目标卡片，返回最新后到最新消息区域。没有此数据时记录未覆盖，不为了验证向真实联系人发邀请。
3. 在已有个人反馈的历史计划中，确认已保存反馈能读出完整结果及私有属性；“修改 → 取消”保留原反馈并把焦点送回入口。保存后也需检查确认状态与焦点。

局部读屏结果只计对应场景，不能据此将上述全部项目标为通过。真机自动化通过的菜单关闭和反馈取消只确认页面行为、选择及数据保留，没有断言实际旁白落点。

用户已在手机开启旁白。首次回复“朗读不完整或入口找不到”，随后明确为“聊天页面上也看不到计划入口”，最终确认“已结束”列表为空，没有可选计划。因此首次检查缺少历史计划这一前置条件，未建立 VoiceOver 漏读／不可聚焦缺陷，不能记为通过或产品失败。

为补齐前置条件，10:40:25（Europe/Berlin）使用 Preview 93 已有的 DEBUG 导航 fixture 重新启动：一条历史计划 `nav-old`、两条当前计划 `nav-current`／`nav-later`，均为内存测试数据；同时使用 `--ui-testing-ephemeral-credentials`，不覆盖正常账号的持久登录凭据。用户确认“能找到摘要，计划名称和时间都读完整”。用户要求由代理直接操作后，停止人工走查，10:45:24 恢复普通启动，再接入真机 XCTest。没有为此修改应用实现或创建生产计划。

真机测试还产生一条 `_UIReparentingView` 视图重新挂载运行时警告，未导致断言失败；所留截图未见对应异常，来源尚未定位。作为非阻塞观察项保留[原始警告](evidence/2026-10-04-chat-plan-repair/device-ui/runtime-warning.txt)，不据此修改产品代码。Xcode 的诊断包收集另有错误，不影响结构化测试结果和三张自留截图。

### 10 月 4 日手机续验

10:27:47（Europe/Berlin）系统成功启动 `app.sideseat.mobile.preview`，此前锁屏限制已解除。10:30:22 再次查询，启动返回的同一个进程仍在运行，间隔 155.5 秒；10:31:44 读回安装版本仍为 `1.0.0 (93)`。这是系统启动及进程存活证据，不代表已检查手机屏幕内容或真实读屏行为。这次启动重试未重装应用，未改动应用源码。见[续验证据](evidence/2026-10-04-chat-plan-repair/preview93/launch-followup.json)。

随后完成直接真机操作：iPhone 16 Pro Max／iOS 26.0.1，中文界面，原交付 Preview 93 签名包。新增专用用例 `SocialLiveUITests/testPreviewDevicePlanNavigationAndFeedback`，Preview scheme 的 TestAction 改为 Preview 并接入 UI 测试目标。仅测试代码和测试配置变化，应用实现仍为 `6ecd358`；实际测试目标的可执行文件 SHA-256 仍为 `cba45a270d5392d6404161246d8d02edfeeb9c74a0124c966e8677c7be9d00fd`。

- 历史计划入口点击后原卡片可见；打开／关闭计划列表保留历史选择；从列表切换计划，再返回默认当前计划和最新消息。
- 在内存 fixture 中提交“发生了”，打开修改再取消，确认原反馈值不变、修改入口仍可操作。
- 最终结果为 **1 项通过、0 失败、0 跳过**：[结构化结果](evidence/2026-10-04-chat-plan-repair/device-ui/summary.json)。截图：[历史计划](evidence/2026-10-04-chat-plan-repair/device-ui/history-plan.png)、[返回最新](evidence/2026-10-04-chat-plan-repair/device-ui/latest-message.png)、[反馈取消后](evidence/2026-10-04-chat-plan-repair/device-ui/feedback-cancel.png)。这是真机 UI 操作回归，业务数据来自本地内存 fixture，不是生产账号或完整闭环的端到端重跑。
- 首轮实际操作发现测试前置假设不适合这台 440 × 956 pt 手机：切换到较晚计划后，最新消息已经可见，因此“最新”入口按设计隐藏。测试改为显式返回较早的当前计划，再验证返回最新。保留此前 0 用例筛选失误、临时构建配置／资源问题和该失败，不将其计入通过；见[执行记录](evidence/2026-10-04-chat-plan-repair/device-ui/attempts.json)。
- 测试结束自动清除启动参数并重启 Preview，10:59:39 再读回版本仍为 `1.0.0 (93)`；正常账号界面未另行截图验收。见[恢复记录](evidence/2026-10-04-chat-plan-repair/device-ui/restoration.json)、[原签名包身份](evidence/2026-10-04-chat-plan-repair/device-ui/tested-app-identity.json)和[测试源码核对](evidence/2026-10-04-chat-plan-repair/device-ui/source-verification.json)。

## 交付

阶段 A：`46b08ee1390b1710b1fe21f7dfbd7f9f9251a0b3` 已推送，Preview 92 已安装启动。

阶段 B：`6ecd35884cb2f722196afa025c9e70d81a0d5b49` 已推送，Preview 93 已安装并读回版本；10 月 4 日续验已成功启动，并确认同一进程在 155.5 秒后仍运行。294 个原生源码／资源文件与提交和签名包一致。没有后端部署、数据库迁移、TestFlight 或 App Store 发布。见 [Preview 93 发布记录](../releases/2026-10-04-preview93.md)。本轮启动的本地 QA API／故障代理已关闭；仅撤销测试服务器生成的 Next.js 配置改动，保留其他未提交工作。
