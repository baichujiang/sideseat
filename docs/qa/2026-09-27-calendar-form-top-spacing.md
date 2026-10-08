# 日程表单顶部间距（2026-09-27）

将添加／编辑日程表单滚动内容的顶部间距设为 16pt。第一组为智能填写或标题时均适用，保留分组间距及现有弹层高度。

iPhone 13 mini 模拟器验证：智能填写预览、编辑、保存通过；普通新建表单、分类、同行者选择和输入通过。已检查两种首卡截图。旧 UI 测试以标题纵坐标间接判断弹层高度，间距收紧后导致误报；已改为使用导航保存按钮的纵坐标，并检查标题位于按钮下方。

- [智能填写在首位](evidence/2026-09-27-calendar-form-top-spacing/smart-fill.png)
- [标题在首位](evidence/2026-09-27-calendar-form-top-spacing/title-first.png)

结果包：`/tmp/calendar-form-top-spacing-20260927.xcresult`（智能填写通过、旧布局断言失败）；`/tmp/calendar-form-top-spacing-verified-20260927.xcresult`（修正断言后普通表单通过）。使用 UI 测试数据，未部署。
