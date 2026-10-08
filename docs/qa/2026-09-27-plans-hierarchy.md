# 计划页面层级调整（2026-09-27）

## 页面与卡片

保留等待回应／即将开始／已结束三个分类。等待回应分组之间留 28pt，同组卡片间距 8pt；待我回应增加提示点和人数，等待对方使用次要文字。即将开始按本地日期分组，显示今天、明天或具体日期，同日卡片只显示时间，跨日计划保留起止日期。

卡片统一为名称、时间与地点、同行者三层。名称加粗，时间恢复正常字重，地点和同行者使用次要颜色，长文字自然换行。整卡继续进入对应聊天中的计划。移除重复的确认／等待标签与查看聊天／查看并回应文字，保留改期和结束状态。已结束名称降低视觉强调，原有完成反馈和修改答案功能保留。

## 验证与修复

在 iPhone 13 mini、iOS 26.5 上，以下 3 项针对计划页的 UI 测试最终通过（分批执行）：

- 中文普通字号：等待分组优先级、日期分组、同日排序、长地点、已结束反馈区域，以及进入聊天回应计划。
- 德文深色辅助功能大字体：三个分类切换、卡片横向边界。修复完成反馈问题文字不换行导致卡片超宽的问题。
- 深色长列表：顶部分类固定，切换分类与底部标签保持位置，进入聊天再返回保持位置。发现底部栏隐藏／恢复后列表位置偏移，增加仅用于计划列表的偏移记录，在返回完成时恢复。测试等待返回动画完成再比较相同卡片坐标。

结果包：`/tmp/plans-hierarchy-final-20260927.xcresult` 中前两项通过；最终滚动回归结果为 `/tmp/plans-hierarchy-return-20260927.xcresult`，通过。

更早选择的综合用例 `testTaskPagerAccessibleSelectorsAndReducedMotion` 在同行页面的控件定位阶段失败，尚未进入计划页。本次以直接进入计划的专项大字体用例完成验证，未修改该同行流程。

使用本地 UI 测试数据，未部署、未验证生产写入。

## 截图

- [等待回应](evidence/2026-09-27-plans-hierarchy/plans-waiting-groups-light.png)
- [按日期分组](evidence/2026-09-27-plans-hierarchy/plans-date-groups-light.png)
- [已结束](evidence/2026-09-27-plans-hierarchy/plans-ended-hierarchy-light.png)
- [德文大字体](evidence/2026-09-27-plans-hierarchy/plans-hierarchy-accessible-upcoming.png)
- [从聊天返回](evidence/2026-09-27-plans-hierarchy/pager-plans-after-chat-dark.png)
