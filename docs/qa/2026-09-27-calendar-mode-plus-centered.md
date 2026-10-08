# 日历按钮位置修正（2026-09-27）

按用户澄清，“＋”位于月/周/日切换栏右侧，与搜索等工具按钮使用相同的中性灰底、图标字号、圆角和 44pt 点击区域，移除上个版本的顶部蓝色入口。

底部宽度选择和“今天”收拢到居中的最大 300pt 控件组，不再通过 Spacer 撑向两边。大字体保留纵向适配。

iPhone 13 mini 模拟器上 4 项检查全部通过：三种视图布局、新日程表单、回到今天、浅深色图标对比度。已检查截图。

- [周视图](evidence/2026-09-27-calendar-mode-plus-centered/week.png)
- [日视图](evidence/2026-09-27-calendar-mode-plus-centered/day.png)

结果包：`/tmp/calendar-mode-plus-centered-20260927.xcresult`。
