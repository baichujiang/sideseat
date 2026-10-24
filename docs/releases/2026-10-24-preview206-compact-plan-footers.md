# Preview206：紧凑计划底栏与截图观察更正

空闲填写状态在辅助字号上下排列状态／已选时长，与最终选时元信息一致限制至accessibility1；普通字号保留横排。最终时间摘要同日日期仅出现一次，跨日／跨年保留两端信息，辅助名称仍读取完整日期。原文案、状态ID、手动提交、点选／取消／拖选及邀请／日历规则保持，无新状态或请求；最简实现复查通过。

源码 **aa816c088acd790dca9dfde5c0ef0581719752db 已提交并推送**。最简最终同包两项真机 **53.286／446.529秒，2通过、0失败／跳过**：中德普通／最大字号深色、14次真实像素检查、跨日拖选与反向擦除、空闲保留、返回／重启草稿、44pt、元信息完整不重叠及最大字底栏低于40%屏高。27张最终实图逐张核对，保存7张最终及1张真实旧高底栏图。中德英×同日／跨日／跨年9项另属Foundation格式样例，不计额外真机组合。

**更正旧空白观察：** 193／205及206实验原PNG均有完整不透明时间文字和选中边框，先前图片查看误判已用原像素纠正。触摸层／逐行overlay／isOpaque实验全部撤回，TimePollGrid至文件末尾与205逐字一致；不声称修复了已证明的绘制缺陷。所有中间AX／框精度／slot测试／凭证中断及已撤销实验包的结果与最终包分开记录。

默认iPhone14 Plus安装206，无测试参数普通启动 **PID8417**，实际进程匹配，普通97保留。267输入／Local／严格签名／最终二进制一致；Runner／本阶段私密JSON和xctestrun清理，无新增App报告。两个专用QA账号和独立布局计划暂留给本任务后续完整流程，服务器仍COLLECTING／0响应／0邀请版本，无真实用户写入。无后端／网页发布，生产仍Ready dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7。第3–5项及最终补验继续进行。

[顺序QA](../qa/2026-10-24-sequential-reliability-fixes.md)、[最终最大字空闲底栏](../qa/evidence/2026-10-24-timetable206/timetable-availability-restored-de-largest-dark.png)、[最终时间摘要](../qa/evidence/2026-10-24-timetable206/timetable-final-selected-de-largest-dark.png)、[原PNG审计](../qa/evidence/2026-10-24-timetable206/png-content-audit.json)。
