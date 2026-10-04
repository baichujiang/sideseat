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

待执行：反馈状态块、编辑取消、保存状态和失败重试、计划页与聊天两入口、受影响闭环路径及最终辅助功能走查。
