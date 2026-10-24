# Preview208：日历元信息与活动标题可读

周／日日历日期和时间刻度在固定宽度内限制至xLarge，Day补44pt点击区；辅助字号活动卡头图标／标题纵排，普通布局保持。完整日期辅助标签、事件／选择／路由及邀请日历规则不变，无新状态／请求／组件。源码 **ee243bf2968fe7e36e95df014e8f622e3f02c9ae 已提交并推送**，最简实现交叉审查通过。

最终同包同次两专项 **42.296／41.022秒，2通过、0失败／跳过**：中文普通浅色、德文系统最大深色，14周日期实际OCR、Day44与完整数字、双位小时17–20／10–11完整、源活动标题完整词、真实最大字号弹层收件人标题63.333pt、提出计划取消和意愿卡操作不重叠。7张最终原图逐张核对，保存7最终＋5before。其余表单仍可滚动，不称全部首屏。字体预算、外层AX覆盖的测试定位、Day34pt／ellipsis和前包通过均保留实际范围，最终另重跑。

默认iPhone14 Plus安装208、无测试参数普通启动 **PID8498** 与实际进程一致，普通97保留。267输入／Local／严格签名／最终二进制一致；Runner／阶段私密清理，无新增App报告或真实账号／计划／消息写入。两专用QA账号与布局计划仍供本任务最后验收回收。无后端／网页发布；13:57UTC重新核验生产Ready dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7。第5项和最终补验继续。

[顺序QA](../qa/2026-10-24-sequential-reliability-fixes.md)、[最大周日历](../qa/evidence/2026-10-24-typography208/typography-week-dates-de-largest.png)、[最大日历日期条](../qa/evidence/2026-10-24-typography208/typography-day-strip-de-largest.png)、[聊天卡](../qa/evidence/2026-10-24-typography208/typography-chat-source-header-de-largest.png)、[真正最大弹层](../qa/evidence/2026-10-24-typography208/typography-source-propose-form-de-largest.png)。
