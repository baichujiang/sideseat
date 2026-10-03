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

待阶段一交付后实施：能放下时保留横向分页；辅助字号或宽度不足时显示当前栏目按钮，展开栏目选择。空意愿页减少重复文字，使用简短添加按钮及完整读屏标签。局部调整，不缩小系统辅助字号，不全局修改共享按钮。

## 验证边界与问题记录

本轮使用隔离本地 API，未写正式用户数据，APNs 关闭；不据此声称已验证生产推送时延。手机 Preview 单独记录安装和启动，完整业务闭环在原生模拟器验证。工作区已有的资料／日历后台改动未纳入本次提交或发布。

原报告的 ENDED 历史语义仍是单独产品议题：删除和被计划消费共享状态，本次用计划入口解决再次发布，不恢复已删除意愿。
