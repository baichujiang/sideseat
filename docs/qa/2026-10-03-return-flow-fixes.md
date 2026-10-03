# 第二闭环：入口与辅助字号修复复测

基线：`7ebc4f8` / Preview 87。对应 [第二闭环原报告](2026-10-03-new-intent-loop.md) 的两项 P2 问题。

## 阶段一：活动结束后发布新意愿

计划页与聊天的已结束计划卡片统一提供「与某人再约」和低强调的「发布新意愿」。后者在原页面打开独立草稿，取消返回原位置；发布成功后切到「我的意愿」，展示已发布状态及「查看推荐」入口。

草稿仅带活动标题，以及能确定的活动类别。历史 CUSTOM 类型不能区分咖啡、探索等类别，明确要求选择，不根据标题猜测。时间默认待定；旧时间、对方、消息、地点、私人备注与计划来源不进入新意愿。原删除／ENDED 历史策略保持原样。

### 验证

- iPhone 13 mini 模拟器 / iOS 26.5；真实 Development App → 活跃工作区本地 API `127.0.0.1:3033` → 独立数据库 `sideseat_return_flow_20261003`；完整复跑使用新库 `sideseat_return_flow_retry_20261003`。
- 三个 QA 账号，原始业务记录通过 App 创建；只有第一次计划和双方日历被压缩到过去，以触发活动后反馈。
- 首次意愿、收藏、招呼、回复、计划确认与双方日历通过；8 项计划／草稿模型测试通过，0 跳过：[结果](evidence/2026-10-03-return-flow-fixes/stage1-first-plan-summary.json)。
- 未填写任何活动反馈时，计划页和聊天均能打开新意愿；标题预填、时间待定、未知类别待选。填写再取消，原页面和历史保留；「与原同伴再约」仍打开对应计划表单：[结果](evidence/2026-10-03-return-flow-fixes/stage1-cancel-before-feedback-summary.json)、[双入口](evidence/2026-10-03-return-flow-fixes/closed-loop-return-flow-01-both-paths-before-feedback.png)、[草稿](evidence/2026-10-03-return-flow-fixes/closed-loop-return-flow-02-independent-draft.png)。
- 完整复跑最终通过：8 项模型测试，加首次成约、反馈前双入口取消、双方反馈及原聊天、从计划发布并进入新推荐等 4 个 UI 方法，0 跳过。期间失败及恢复方式见下文：[复跑首次成约](evidence/2026-10-03-return-flow-fixes/stage1-retry-first-plan-summary.json)、[复跑取消](evidence/2026-10-03-return-flow-fixes/stage1-retry-cancel-summary.json)、[反馈通过／首次输入失败](evidence/2026-10-03-return-flow-fixes/stage1-retry-complete-summary.json)、[最终发布及历史检查通过](evidence/2026-10-03-return-flow-fixes/stage1-resume-publication-summary.json)。
- [最终数据核验](evidence/2026-10-03-return-flow-fixes/stage1-final-state.json)：4 条意愿（2 条原 ENDED，2 条新 ACTIVE）、2 条机会、1 条原聊天、1 个原计划、2 条日历、2 个发生反馈、1 次共同经历、0 个再次同行许可。新意愿时间待定，未继承旧日期。原收藏隐私、双方消息和重登持久化通过。
- [发布后的我的意愿](evidence/2026-10-03-return-flow-fixes/closed-loop-return-flow-16-new-publication.png)、[新同伴推荐](evidence/2026-10-03-return-flow-fixes/closed-loop-return-flow-17-new-company.png)。
- 编译、三语言 strings 格式、QA 脚本 lint 和 diff 空白检查通过。[测试源文件哈希](evidence/2026-10-03-return-flow-fixes/stage1-tested-source.json)。交付见 [Preview 88](../releases/2026-10-03-preview88.md)。

### 首次复测发现并修复

新发布的首次 UI 测试失败，反馈测试通过：[原始结果](evidence/2026-10-03-return-flow-fixes/stage1-return-loop-summary.json)。UI 层级证明已跳到我的意愿，入口确实可见，但成功提示容器的 accessibilityIdentifier 传播到子按钮，覆盖了独立标识。已把容器声明为包含独立子元素，保持按钮语义及定位。

同时发现测试脚本直接按删除键依赖插入光标位于末尾，实际上没有完整替换预填标题。首次尝试系统「全选」菜单，但模拟器未打开该菜单，复跑停在提交前。最终改为点击文本末尾，再清空，并在提交前分别断言空内容和新全文一致。没有改变产品文字编辑逻辑。首个失败库保留；新隔离库从意愿、联系、确认、反馈完整重跑。第二次失败后，独立核验确认只有 Lee 已发布、Alex 尚未写入，再从 Alex 草稿阶段继续，避免重复发布。

## 阶段二：同行页大字号布局

能放下完整标签时保留横向分页；辅助字号或宽度不足时显示当前栏目按钮，展开栏目选择，读屏保留完整名称和选中状态。空意愿页只显示简短标题、添加按钮和说明，按钮读屏名称仍为完整的「添加意愿」。保持各栏目的独立滚动位置；不缩小系统辅助字号，不全局修改共享按钮。

首次隔离测试发现两处问题：[失败结果](evidence/2026-10-03-return-flow-fixes/stage2-isolated-layout-summary.json)。德语普通字号触发窄屏选择器，但 `.accessibilityElement(children: .ignore)` 把带标识的控件变成 Other，实际按钮变成无标识子元素；移除该包装，使用标准按钮语义。德语最大字号的表单已成功打开，但输入框在首屏之外；测试改为在实际表单滚动区域寻找字段，不把惰性加载造成的离屏内容误判为未打开。

第二次运行中，六种同行页组合（中英德 × 普通浅色／最大辅助字号深色）全部通过，包括栏目选中状态、三栏目切换、添加入口首屏可点击／完整读屏标签／最小触区，以及收藏页滚动位置保留：[结果](evidence/2026-10-03-return-flow-fixes/stage2-layout-retry-summary.json)、[德语最大字号](evidence/2026-10-03-return-flow-fixes/closed-loop-adaptive-empty-de-dark.png)。计划续行测试在寻找时间控件时仍失败；改为滚动 `intent-editor-fields` 后也未通过，未把这些失败算作成功：[第二次诊断](evidence/2026-10-03-return-flow-fixes/stage2-final-plan-layout-summary.json)、[控件信息诊断](evidence/2026-10-03-return-flow-fixes/stage2-form-diagnostic-summary.json)。完整层级和截图显示表单停在多行活动输入框，时间控件尚未进入可见区域。测试进一步把拖动起点移到表单边缘，避免手势落入输入框自己的滚动区域。

同一轮检查发现新草稿分支绕过了编辑器原有的大字号短文案逻辑，德语底部发布按钮占约 249 pt。已让「从已结束计划新建」在辅助字号／键盘聚焦时使用已有的短发布文案，普通字号保留完整文案；没有全局改动共享按钮。保留[修复前截图](evidence/2026-10-03-return-flow-fixes/closed-loop-before-short-dock-de.png)。

最终计划／表单回归通过，0 失败、0 跳过，覆盖中文普通浅色与德语最大辅助字号深色：已结束计划打开草稿、标题保留、时间入口可操作、取消回到原页面，再进入新意愿与 Lee 的新推荐：[结果](evidence/2026-10-03-return-flow-fixes/stage2-short-dock-final-summary.json)、[修复后表单](evidence/2026-10-03-return-flow-fixes/closed-loop-adaptive-new-draft-de.png)、[最大字号新推荐](evidence/2026-10-03-return-flow-fixes/closed-loop-adaptive-new-company-de.png)。

## 最终整合版本复跑（2026-10-04）

最终测试与 Preview 90 使用相同的 294 个已提交源码／资源文件，逐一哈希与 `e0c7ca303ed2854e7546ff455b8a430a57d506c2` 一致：[来源核验](evidence/2026-10-04-return-flow-final/tested-source.json)。包含另一个任务已提交的智能输入更新。

全新隔离库 `sideseat_return_flow_final_20261004` 从 3 个账号、0 条业务记录开始。8 项模型测试和首次发布—推荐—收藏—招呼—回复—计划确认—双方日历 UI 测试通过，0 失败、0 跳过：[测试结果](evidence/2026-10-04-return-flow-final/final-first-plan-summary.json)、[成约后数据库核验](evidence/2026-10-04-return-flow-final/first-plan-state.json)。之后只压缩该计划及两条日历的时间，以触发活动后反馈；反馈和再次发布两个 UI 方法也通过，0 失败、0 跳过：[闭环结果](evidence/2026-10-04-return-flow-final/final-return-loop-summary.json)。最终版本共 8 项模型测试 + 3 个业务 UI 方法全部通过；这次从全新库连续完成，未使用恢复发布测试。

[最终数据库核验](evidence/2026-10-04-return-flow-final/final-state.json)确认：双方发生反馈各 1 个，共同经历 1 条；原聊天、私有收藏、原计划与两条日历保留。2 条原意愿仍为 ENDED，2 条新意愿为 ACTIVE 且时间待定；出现与 Lee 的新机会，但聊天仍为 1、计划仍为 1、日历仍为 2、再次同行许可为 0，没有隐式创建新的联系或计划。发布成功提示、跳转查看推荐和重登持久化通过，截图已复核。

最终交付：[Preview 90](../releases/2026-10-04-preview90.md)，手机已安装并启动，源码和验收证据分别提交到 GitHub。

## 验证边界与问题记录

本轮使用隔离本地 API，未写正式用户数据，APNs 关闭；不据此声称已验证生产推送时延。手机 Preview 单独记录安装和启动，完整业务闭环在原生模拟器验证。未完成的资料功能改动未纳入本次提交或发布。Preview 88 不含同期日历更新；最终客户端已保留另一个任务已经提交的日历更新，具体源码及后台版本以最终发布记录为准。

原报告的 ENDED 历史语义仍是单独产品议题：删除和被计划消费共享状态，本次用计划入口解决再次发布，不恢复已删除意愿。

### 新发现并记录：计划页的最大字号空间占用（P2，后续已修复）

在 iPhone 13 mini、德语、Accessibility XXXL 下，计划页仍把三个栏目纵向固定在内容上方；「与原同伴再约」「发布新意愿」等长标签占多行，德语长单词出现不理想的断行。入口本身可点，表单实际已打开；不把此问题记为发布失败。新草稿底部的长按钮文案问题已在本轮作局部修复，详见上文。

[计划页截图](evidence/2026-10-03-return-flow-fixes/closed-loop-adaptive-plan-continuation-de.png)。建议下一阶段给计划页应用同样的当前栏目选择器，并重新设计计划操作的简短可见文案，保留完整读屏说明。它涉及计划和聊天多个共享入口，按用户要求记录后再设计，不在本轮同行页布局里全局改动。

2026-10-04 后续状态：上面描述的是 Preview 90 的历史发现；当前栏目选择器与简短续行文案已在 Preview 91 实现并通过局部回归，详见[修复及新增问题记录](2026-10-04-plan-accessibility.md)。聊天固定摘要溢出和已保存反馈标签截断单独记录，未纳入本项完成结论。
