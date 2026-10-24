# Preview 214：统一计划卡片日期栏

已安装默认iPhone14 Plus并正常启动 **Preview214，PID8926**，普通97保留。产品源码 **`0dcad2188b963914bdafdf4e98788976f9ec0a10` 已提交推送**。验收跨2026-10-24晚至25日（Europe/Berlin）。

待处理、等待和已确定卡片共用左日期／时间、右名称／状态／已有地点／人员／下一步，右侧保留小活动图。候选日期显示「时间待定」，已有具体邀请保留真实时段；跨天日期、年份及时区沿用原formatter。辅助字号上下排，原横向等待和右下发起保留。仅改私有卡片区域，190→160行，无新状态／请求／依赖或邀请／日历规则变更，独立最简复查通过。

最终五例分次通过：178.954秒普通／真实系统最大字号及导航、60.612秒最大卡连续分段、365.633秒完整好友到双方日历／8API、19.004秒clean真实首页、51.902秒真实候选日期卡。54次新原图捕获逐张查看（53种像素，已定最大两图字节相同）；最大任务／等待经滚动完整读取。此前两次截图定位失败单列，仅修测试helper，冻结App不变。不扩大为全App最大字号、无遮挡或纯人工性能验收。

267项产品输入与活跃／隔离构建／该提交一致，Local／严格签名／冻结二进制及测试执行范围核验通过。默认手机214正常进程匹配且无QA参数，Runner清理。2个专用账号401／2条链接404，私密fixture／启动配置／生成工程移除，新增App报告0份。无本轮后端／网页／Schema发布，沿用此前记录的生产`dpl_3y9L5UfyX7v1hhUPsXGVg7Cg27zz`；未重新发布或重新核验部署ID。

[完整QA与范围](../qa/2026-10-24-plan-date-column.md)、[来源](../qa/evidence/2026-10-24-plan-date-column214/native-build-manifest.json)、[设备](../qa/evidence/2026-10-24-plan-date-column214/device-verification.json)、[真实候选卡](../qa/evidence/2026-10-24-plan-date-column214/candidate-normal.png)、[真实已定卡](../qa/evidence/2026-10-24-plan-date-column214/home-live-confirmed.png)。
