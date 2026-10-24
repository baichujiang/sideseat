# Preview 215：更清楚的日期与起止时间

默认iPhone14 Plus已安装并正常启动 **Preview215，PID8962**，普通97保留。源码 **`586e8f112e3fd4c9f1f951fb30ce232675ae9206` 已提交推送**。

左侧日期加大，星期／必要年份分开；同日保留完整时钟，跨天以箭头连接开始、结束两组，跨年结束年份保留。候选数量和完整首末日期分行；普通112pt日期栏，xxLarge及以上纵排，原横向分区／右下发起保持。只改原生呈现及小型formatter显示辅助／三语文案，无新状态／请求／规则，独立最终最简复查通过。

最终17项单元／0.049秒、四组合日期布局211.776秒和三类卡片／导航183.158秒通过；39次捕获／28种像素复核。初版实图发现中文xLarge候选碎行，已修并替换App重验；旧通过结果不冒充最终包。最大长卡通过连续分段阅读，系统浮层限制单列；未重复完整邀请日历API链或全App最大字号／人工性能验收。

267输入／Local／严格签名／最终二进制及测试来源核验，215无QA参数正常进程匹配，Runner清理。2QA账号401／4链接404，私密fixture／启动配置／生成工程移除，新增App报告0份。无后端／网页／Schema发布，生产沿用此前记录`dpl_3y9L5UfyX7v1hhUPsXGVg7Cg27zz`。

[完整QA](../qa/2026-10-25-plan-schedule.md)、[来源](../qa/evidence/2026-10-25-plan-schedule215/native-build-manifest.json)、[设备](../qa/evidence/2026-10-25-plan-schedule215/device-verification.json)、[普通效果](../qa/evidence/2026-10-25-plan-schedule215/schedule-normal.png)、[xLarge效果](../qa/evidence/2026-10-25-plan-schedule215/schedule-xlarge.png)。
