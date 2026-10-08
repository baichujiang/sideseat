# 日程编辑弹层稳定性（2026-09-27）

添加和编辑日程固定使用 large 弹层，移除新建时较矮的初始档位及切换状态。保留圆角、拖动关闭、取消／保存按钮与 16pt 表单顶部间距。

显式设置弹层、表单和导航栏背景为系统分组背景，表单行使用系统分组卡片背景。浅色为浅灰页面、白色卡片，深色使用对应系统颜色。键盘仍由系统避让，滚动表单而不切换弹层高度。

## 验证

在 iPhone 13 mini、iOS 26.5 模拟器上，3 项不同 UI 用例分批通过：

- 新建表单、分类、同行者选择与文字输入。
- 浅色／深色下标题、地点、备注输入；点击背景、滚动、完成按钮收起键盘；输入和收起键盘时保存按钮纵坐标保持一致（2pt 容差）；输入框位于键盘上方。已人工查看截图。
- 智能填写预览、进入草稿编辑并保存。

早期测试将多行备注定位为 TextView（实际为 TextField），以及从全应用查询嵌套表单中的同名日期控件，产生失败。已按实际控件类型与当前草稿表单范围修正，最终复测通过。

结果包：`/tmp/calendar-stable-sheet-20260927.xcresult`（新建表单通过）；`/tmp/calendar-stable-sheet-verified-20260927.xcresult`（键盘与智能填写最终通过）。使用 UI 测试数据，未验证生产写入、未部署。

## 截图

- [浅色输入前](evidence/2026-09-27-calendar-stable-sheet/light-before.png)
- [浅色输入时](evidence/2026-09-27-calendar-stable-sheet/light-keyboard.png)
- [备注自动滚动](evidence/2026-09-27-calendar-stable-sheet/light-notes.png)
- [深色输入前](evidence/2026-09-27-calendar-stable-sheet/dark-before.png)
- [深色输入时](evidence/2026-09-27-calendar-stable-sheet/dark-keyboard.png)
- [智能填写入口](evidence/2026-09-27-calendar-stable-sheet/smart-fill.png)
