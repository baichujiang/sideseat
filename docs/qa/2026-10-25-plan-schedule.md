# Preview 215：日期层级与完整起止时间

2026-10-25，Europe/Berlin。默认iPhone14 Plus已安装并正常启动 **Preview215，PID8962**，普通97保留。最终17项单元测试、211.776秒日期布局、183.158秒三类卡片／导航专项均通过；39次最终原图捕获／28种像素已按原图和精确SHA等价类复核。

## 实现

日期栏由92加宽至112pt，已知时段使用醒目的月日、独立星期／必要年份及较强的时钟字重。同日起止尽量同行，放不下时每个完整时钟各占一行；跨天改为开始日期／时间和箭头连接的结束日期／时间，结束年份保留。xxLarge及以上整体纵排，普通横向等待分区和右下发起保留。

候选日期单列数量、完整首日、完整末日和「时间待定」，不把候选窗口当成最终时段。单日期／无日期回退保留。现有POSIX解析与排序只提取为`candidateDays`，原AX完整数量／范围、日期年份、时钟及时区语义保持；增加三语数量文案，无业务状态／请求／依赖／Schema或邀请／日历规则变化。独立最终最简审查无实质问题，原根页私有卡片之外逐字未变。

## 最终验证

| 验证 | 实际范围 |
| --- | --- |
| 原生单元 | 17项／1 suite／0.049秒，0失败／跳过；同日、候选数量／乱序日期／跨年端点、跨日／跨年时钟及DST等 |
| 真机日期布局 | 211.776秒，1通过；中文L浅色、中文xLarge浅色、英文L浅色、德文真实AccessibilityXXXL深色；4类卡片×4组合，精确日期／时钟／年份AX断言及完整可见分段 |
| 真机三类卡片及导航 | 183.158秒，1通过；中文普通／德文最大字号，原私聊邀请详情、分栏、创建取消、历史往返、普通横向等待及最大字号纵排 |
| 服务端保持 | 四个独立QA计划前后phase、精确起止、邀请版本／状态、人数和本人空闲完全一致；候选仍收集／0人／空提交／版本0 |

最终两例均0失败／跳过，分次执行。布局方法只做卡片布局，不声称完成发邀请链；导航使用既有受控离线旧记录，红网络提示属该fixture，不能当clean API首页。布局使用两个专用账号及四个API预置记录（三个兼容FIXED例、一个收集例），不新增产品「时间已定」入口或新发布规则。

初版468.885秒布局／详情往返和中间导航虽自动化通过，中文xLarge候选仍出现月份碎行。实图复核后修正候选数量／日期分组，重建App、重跑17项单元及上述最终两例；旧结果不计最终验收。此前16次多人详情打开／返回只属初版范围；最终布局用例删除重复详情往返，保留全部日期断言、严格视口、44pt控制和24pt重叠。原多人路由代码未改变。

最终24张布局＋15张导航捕获共39张、28种像素；像素相同者以完整SHA核验复用原图审查。最大长卡按连续分段阅读，不称全部同屏；系统AssistiveTouch局部遮住右侧图或CTA，另有记录。导航专项最大卡只验实际可见部分；原兼容聊天德文词内换行、原详情跨年头部不含年份属未改页面，不能作为新首页年份证据。本轮不重复完整邀请至双方日历API链、网页／领域／加载空store，也不宣称全App最大字号或人工性能已验收。

## 来源、手机与清理

源码 **`586e8f112e3fd4c9f1f951fb30ce232675ae9206` 已提交推送**。267项产品输入与活跃、隔离构建和该提交匹配，Local配置／严格签名／最终冻结二进制及最终两测试源码范围核验通过；初版产品在候选实图发现问题后被替换，最终验收期间不再改产品。默认设备UDID `00008110-001A69110CC1401E` 身份已核验，215无QA参数普通启动PID8962与真实进程匹配，Runner卸载，普通97保留。

2专用账号／4计划清理，2个token401、4条链接404；私密fixture／启动配置／生成工程移除。按name及lastModDate比较新增App报告0份。无本轮后端／网页／Schema发布，沿用此前记录的生产`dpl_3y9L5UfyX7v1hhUPsXGVg7Cg27zz`，不把旧记录称为本轮重新核验部署ID。

[执行范围](./evidence/2026-10-25-plan-schedule215/acceptance-runs.json)、[单元](./evidence/2026-10-25-plan-schedule215/unit-tests.json)、[最简复查](./evidence/2026-10-25-plan-schedule215/minimal-implementation-review.json)、[逐图](./evidence/2026-10-25-plan-schedule215/visual-review.json)、[预置端点](./evidence/2026-10-25-plan-schedule215/layout-fixtures.json)、[服务端前后](./evidence/2026-10-25-plan-schedule215/server-state.json)、[候选保持](./evidence/2026-10-25-plan-schedule215/picker-api.json)、[来源](./evidence/2026-10-25-plan-schedule215/native-build-manifest.json)、[设备](./evidence/2026-10-25-plan-schedule215/device-verification.json)、[清理](./evidence/2026-10-25-plan-schedule215/final-native-cleanup.json)。

[普通实图](./evidence/2026-10-25-plan-schedule215/schedule-normal.png)、[xLarge实图](./evidence/2026-10-25-plan-schedule215/schedule-xlarge.png)、[改前候选碎行](./evidence/2026-10-25-plan-schedule215/before-candidate-xlarge.png)、[英文](./evidence/2026-10-25-plan-schedule215/schedule-english.png)、[最大跨年上段](./evidence/2026-10-25-plan-schedule215/cross-year-max-part-1.png)、[中段](./evidence/2026-10-25-plan-schedule215/cross-year-max-part-2.png)、[下段](./evidence/2026-10-25-plan-schedule215/cross-year-max-part-3.png)、[交付](../releases/2026-10-25-preview215-readable-plan-schedule.md)。
