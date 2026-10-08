# 日历固定添加按钮

「＋ 添加日程」改成小圆角矩形文字按钮，放在周视图底部 3／5／7 天调整条右侧。日、月视图也在固定底栏展示，不再悬浮遮挡日历。按钮触控高度至少 44；大字体模式允许工具栏上下排列。

小屏实际验证发现日视图原有 420 的最小高度会把底栏挤到导航栏后面，已让时间轴按可用空间伸缩。

验证：Development 构建成功。常规尺寸模拟器和 iPhone 13 mini 的三个现有 UI 测试均通过：三种视图按钮布局与触控区域、新增日程编辑表单、周视图天数切换。已检查截图。

[周视图](evidence/2026-09-27-calendar-add-toolbar/week.png) · [小屏周视图](evidence/2026-09-27-calendar-add-toolbar/week-mini.png) · [小屏日视图](evidence/2026-09-27-calendar-add-toolbar/day-mini.png)
