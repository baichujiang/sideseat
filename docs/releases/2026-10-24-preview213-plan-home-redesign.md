# Preview 213：计划首页与右下发起入口

已安装默认iPhone14 Plus并正常启动 **Preview213，PID8883**，普通97保留。源码 **`595c3ba5210ecca6ac7e89b54645cc4934e5a5a5` 已提交推送**。

固定抬头／历史入口与两分栏保留，发起按钮移至底部导航上方右侧；safe-area独立留位，完整文案随字号展开。需要处理纵排、等待他人横排及查看全部保持，最大字号自动纵排。三类卡片缩小活动视觉，突出名称、日期／状态和单一步骤，已定卡采用日期块。复用原图、组件、状态和路由，无新数据／请求／依赖；原邀请及日历规则保持，独立最简复查通过。

五个真机用例均通过、0失败／跳过：加载／空store57.457秒、普通／真实最大字号及导航173.726秒、最大字号完整三类卡41.910秒、完整好友至双方日历368.518秒／8阶段API、真实clean首页19.354秒。53张本轮实际原图逐张审阅。受控离线fixture与clean真实首页分开，长页最大字需要滚动；不扩大为全App最大字号或人工性能验收。

267项产品输入与活跃／构建／提交一致，Local／严格签名／冻结二进制通过；213无QA参数正常启动且进程匹配，Runner移除。2个专用账号401、1链接404、私密fixture／启动配置／生成工程清理；新增App报告0份。无后端／分享网页／Schema发布，生产沿用已记录 `dpl_3y9L5UfyX7v1hhUPsXGVg7Cg27zz`。

[完整QA与范围](../qa/2026-10-24-plan-home-redesign.md)、[源码来源](../qa/evidence/2026-10-24-plans213/native-build-manifest.json)、[设备](../qa/evidence/2026-10-24-plans213/device-verification.json)、[真实首页效果](../qa/evidence/2026-10-24-plans213/home-live-confirmed.png)、[普通填充效果（离线fixture）](../qa/evidence/2026-10-24-plans213/home-normal-planning-offline.png)、[最大字号完整卡片](../qa/evidence/2026-10-24-plans213/home-max-task.png)。
