# Preview207：分栏边界手势

原SSSectionPager在首末页拒绝越界水平pan，多次历史／聊天返回后额外左滑可带出聊天层。206真机基线67.753秒复现。仅移除边界拒绝，让既有夹取保持原页并消费拖动；原方向阈值、屏边／VoiceOver／滑轨与输入排除、垂直滚动、有效切页、状态和路由保持，无新状态／组件／请求，最简实现复查通过。

源码 **f1b12449549414833dd5c4978267920f0e80f96d 已提交并推送**。207同包普通字号131.483秒、最大字号123.623秒、Shared滑轨／同行94.022秒三项分次通过，27张最终实图逐张复核。两轮历史／聊天返回、列表和真实卡片中部额外左滑、创建取消保留分栏、双向有效分页和同行首末边界均通过。中间最大历史卡高1018pt，测试强求整卡入屏失败；只修卡片真实可见交集定位，根导航／完整按钮44pt仍严格。Shared及完整helper调用图逐字相同，保留94.022秒；不称一次套件全过。

默认iPhone14 Plus安装207，无测试参数普通启动 **PID8448**，实际进程匹配，普通97保留。267输入／Local／严格签名／最终二进制一致；Runner／阶段私密文件清理，无新增App报告。使用离线导航夹具，无真实账号／计划／消息写入；两专用QA账号和布局计划仍留给本任务最后完整验收回收。无后端／网页发布，生产仍Ready dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7。第4–5项与最终补验继续。

[顺序QA](../qa/2026-10-24-sequential-reliability-fixes.md)、[真实失败图](../qa/evidence/2026-10-24-navigation207/before-extra-left-chat-overlay.png)、[最大字号根页保留](../qa/evidence/2026-10-24-navigation207/navigation-card-middle-extra-left-de-largest-dark.png)、[测试范围](../qa/evidence/2026-10-24-navigation207/acceptance-runs.json)。
