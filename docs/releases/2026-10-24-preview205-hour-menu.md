# Preview205：顺序修复1／每日时段菜单

Menu直接列出原48个时间按钮并勾选当前值，移除嵌套inline Picker。保留半小时步长、结束24:00、Int binding、校验／幂等／创建请求及原按钮样式和ID，无新状态、组件或请求；最简源码复查通过。

源码 **92910c5fce3a603e4fd747aa2af90ec05b58f77c 已提交并推送**。最终同包中普通浅色／德最大字深色完整专项 **230.727秒，1通过、0失败／跳过**：07／24真实滚动，5次选择各静置3秒且不纠正、位置稳定与精确值；无效／有效范围、菜单外关闭及日期／输入保留。24张实际图复核、5张保存。原生24末行边距较紧但可辨识。204单次基线34.602秒未复现旧间歇回顶，不将嵌套桥接原因写成已证明。旧入口、虚拟行定位和菜单内误点三次测试失败范围单独保留，App205未因其改变。

默认iPhone14 Plus已安装205，无测试参数普通启动 **PID8303**，实际进程匹配；普通97保留。267输入／Local／严格签名／二进制一致，Runner及私密材料清理，无真实账号／计划写入或新增App报告。无后端／网页发布，生产仍Ready dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7。本项不替代完整邀请API链／其他页面验收，第2–5项与最终补验继续进行。

[顺序进度及QA](../qa/2026-10-24-sequential-reliability-fixes.md)、[实际菜单](../qa/evidence/2026-10-24-hours205/hour-menu-stationary-time-poll-until-2400-zh-Hans-normal-light.png)、[最大字号保留](../qa/evidence/2026-10-24-hours205/hour-menu-retained-draft-de-largest-dark.png)。
