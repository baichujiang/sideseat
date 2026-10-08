# 计划总览（2026-10-02）

默认页改为「总览」：优先显示待我回应的邀请（先展示两条，可展开全部），接着显示最近一次已确认的见面；等待对方的邀请默认收起并显示数量。「查看全部」进入现有按日期排序的即将开始列表，已结束记录及私人反馈保留。

计划卡片分开显示时间、地点和同行人。收到的邀请显示邀请人及「查看并回应」，进入原聊天中的回应流程；已确认计划使用文字状态标识。总览内点击计划时保存总览的滚动位置。未更改后端或计划确认规则。

## 验证

- 最终 Development 构建与 4 项 MVPPlanPresentationTests 通过。
- 最终 3 项 UI 测试通过：中文总览/邀请展开收起/完整日程/历史反馈入口/进入聊天；德文深色最大辅助字号的三类页面；没有待回应邀请时直接展示下一次见面并可进入聊天返回。
- 同轮初次验证中的空白/加载/错误导航及长列表位置/聊天返回共 2 项 UI 测试通过。初次验证发现总览的无障碍容器覆盖子按钮标识，已修复后通过上述最终测试；同时修复大字号图标占位不足。
- 浅色、深色和大字号截图已检查。三语言字符串格式和 diff 检查通过。

最终结果包：`/tmp/sideseat-personalization-derived/Logs/Test/Test-SideSeat-Development-2026.10.02_16-57-44-+0200.xcresult`。
日志：`/tmp/sideseat-plans-overview-20261002/`。

使用本地 UI fixtures，未写入真实计划。已构建并安装手机 Preview 80；未发布后端。

[浅色总览](evidence/2026-10-02-plans-overview/overview-light.png) · [没有待回应邀请的深色总览](evidence/2026-10-02-plans-overview/overview-no-incoming-dark.png) · [完整日程](evidence/2026-10-02-plans-overview/upcoming-light.png) · [大字号](evidence/2026-10-02-plans-overview/overview-accessible-de.png)。
