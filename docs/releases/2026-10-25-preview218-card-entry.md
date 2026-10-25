# Preview 218：计划卡片整卡进入

默认 iPhone 14 Plus 已安装并正常启动 **Preview 218，PID 9025**，普通 SideSeat 97 保留。源码 **`144edd48f92927e95892c6408f361484722e2e2a` 已提交推送**。

移除卡片内「打开时间表」等重复的动作外观，三类卡片保留原人数摘要和按条件显示的箭头，卡片更紧凑。整张卡片继续使用原 Button／回调，收集阶段进入原时间表，其他阶段及私聊计划保留各自原详情；完整 AX 动作、日期、状态及邀请／日历规则不变。仅原生 UI 与构建号变化，无新增状态／请求／组件／依赖。

最终真实候选四组合 **232.292 秒**、离线三类卡片导航 **181.380 秒**分次通过；每组合从候选卡左侧进入原详情并返回，40 次原图捕获／35 种像素复核。最大真实候选有严格视口／分段检查，私聊最大字号导航仅计实际可见范围；未重跑三类完整最大卡、单元／领域／浏览器或完整邀请日历 API 链，不作全 App 最大字号／人工性能声明。

四个 QA 收集计划测试前后精确状态保持。267 输入／Local／严格签名／冻结二进制及默认设备普通启动核验完成；2 个 QA 账号 401／4 链接 404，Runner 和私密材料清理，新增 App 报告 0 份。无后端／网页／Schema 发布，生产沿用此前记录 `dpl_3y9L5UfyX7v1hhUPsXGVg7Cg27zz`。

[完整 QA](../qa/2026-10-25-card-entry.md)、[来源](../qa/evidence/2026-10-25-card-entry218/native-build-manifest.json)、[设备](../qa/evidence/2026-10-25-card-entry218/device-verification.json)、[普通效果](../qa/evidence/2026-10-25-card-entry218/candidate-normal.png)、[xLarge 效果](../qa/evidence/2026-10-25-card-entry218/candidate-xlarge.png)。
