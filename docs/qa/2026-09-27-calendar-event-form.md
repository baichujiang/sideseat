# 添加与编辑日程表单重排（2026-09-27）

按确认方案调整为标题、时间（开始／结束／重复）、补充信息（地点／日历分类／同行者）、备注四组，以间距分组。重复截止设置按需出现，备注标注选填。添加和编辑页面分别显示对应标题，保存仍在右上角。

智能填写压缩为单行，保留 PLUS 标识。同行者使用独立的整行勾选列表，返回表单显示已选人数。修复验证中发现的选择后人数未更新问题，改用直接状态绑定，并验证返回、重新进入和取消选择。

## 验证

5 项不同的原生 UI 用例通过，分批执行：

| 用例 | 结果与设备 |
| --- | --- |
| 新建表单分组、分类选择、同行者选择／返回／重入／取消选择 | 通过，iPhone 13 mini |
| 智能填写预览、编辑并保存 | 通过，iPhone 13 mini |
| 编辑重复日程与三种更新范围 | 通过，SideSeat UX QA |
| 缺少标题时提示并保留纠正入口（英文／德文） | 通过，SideSeat UX QA |
| 点击背景和滚动收起键盘 | 通过，SideSeat UX QA |

最后一轮小屏测试 2/2 通过，已检查分组、智能填写和同行者截图。以上使用 UI 测试数据及智能填写测试响应，不代表生产 API 或线上数据库验证。未部署。

结果包：

- `/tmp/calendar-event-form-verified-mini-20260927.xcresult`：最终新建与智能填写验证。
- `/tmp/calendar-event-form-groups-fixed-20260927.xcresult`：重复日程编辑通过；该轮同行者人数断言失败，已在最终轮修复并通过。
- `/tmp/calendar-event-form-groups-20260927.xcresult`：标题校验、键盘和智能填写通过；早期表单和重复日程入口失败已修复。

## 截图

- [表单分组](evidence/2026-09-27-calendar-event-form/grouped-form.png)
- [单行智能填写](evidence/2026-09-27-calendar-event-form/smart-fill.png)
- [同行者选择](evidence/2026-09-27-calendar-event-form/companions.png)
- [编辑重复日程](evidence/2026-09-27-calendar-event-form/edit-recurrence.png)
