# Preview 214：统一计划卡片的日期时间栏

验收于2026-10-24晚至25日（Europe/Berlin）完成，使用默认iPhone14 Plus。三类首页卡片共用左侧日期时间、右侧活动信息；普通字号与真实系统最大字号、完整好友到日历流程均通过。

## 实现与最简复查

- 待处理、等待他人、已确定使用同一布局：左侧日期／时间，右侧名称、灰点状态、有数据时的地点、人员／进度和原下一步；已有小型活动图移至右侧。
- 只有候选日期时保留原日期数量／范围并显示「时间待定」。已有具体时段的待确认私聊邀请保留真实时间，不按分栏强制改成待定。跨天结束日期、年份及时区沿用原formatter。
- 普通字号日期栏92pt；辅助字号改为上下排，无固定日期宽度或正文行数上限。原横向等待、最大字号纵排、右下创建、分组及路由均保留。
- 只改`PlansRootView.swift`的私有卡片区域，190行精简为160行；外部代码、输入参数和原formatter逐字不变。没有新增状态、请求、依赖或数据字段。shared列表没有地点字段，保留现有数据边界。
- 独立最简复查无实质问题。手动提交、分享、活动选择、邀请回应／主动发出及日历规则保持。

## 本轮真机执行

| 验证 | 实际结果与范围 |
| --- | --- |
| 普通／系统最大字号与首页导航 | 178.954秒，1通过；中文普通浅色、德文系统AccessibilityXXXL深色。已知时段精确断言，原邀请详情、分栏、创建取消、历史往返、普通横向等待／最大字号纵排 |
| 最大字号完整三类卡片 | 60.612秒，1通过；三类各两张原图，24pt连续重叠；任务／等待经滚动覆盖完整卡片，已定两图字节相同且本来完整可见；严格视口包含及44pt目标检查保持 |
| 完整真实好友链 | 365.633秒，1通过；创建→填写→提交并分享→好友卡→朋友填写→跨天23:00至次日01:00→核对名单／正式邀请→接受→主动发出→双方精确且唯一日历，8阶段API通过 |
| clean真实首页 | 19.004秒，1通过；筹划空页、真实跨天已确定卡、右下创建与取消返回 |
| 真实候选日期卡 | 51.902秒，1通过；同两字号组合，精确两日期／时间待定、无伪最终时段，原详情可达。API另证收集状态、0人、空提交和邀请版本0保持 |

最终接受的五个用例均通过、0失败／跳过，分次执行；此前两次最大卡截图定位失败57.095／46.471秒单独保留，不称一次套件全通过。测试最初要求近乎满屏的545pt卡在553.667pt视口精确对齐，短拖不滚及64pt校正越界导致振荡。仅修截图分段门槛／高度为0.6视口、最小64pt校正，保留24pt重叠、严格边界和44pt检查；产品二进制始终冻结。最后6次原图捕获和几何日志证明连续覆盖（已定两图像素相同），不宣称整卡同时处于首屏。

已知时段测试由相同fixture的Calendar日期／小时偏移精确计算；执行前修正10月25日夏令时切换造成的硬编码预期，不改变产品时间处理或放宽匹配。完整链使用未改的FirstUse测试；专项／候选执行后仅独立最大截图helper变化，重建前后源码SHA及未变的执行范围另有记录。

实际逐张查看 **15专项＋6最大分段＋25完整链＋4真实首页＋4真实候选＝54张新原始PNG**。受控离线旧私聊fixture的红网络条不作clean API首页；另真实首页／候选分别确认无该错误条。最大长页自然滚动阅读，候选最大图仅覆盖日期／待定／名称等当前视口，不称全详情页无裁切。系统AssistiveTouch局部覆盖单列；Calendar图不能单独证明结束时间和唯一性，由原生断言及API另证。旧兼容聊天德文状态词内换行在原聊天卡中保留，不扩大为本轮首页卡片问题。

本轮未重复未改的加载／空store213用例、unit／domain／browser；不宣称全App最大字号或纯人工性能验收，也不宣称修复既有CPU问题。

## 来源与证据

产品源码 **`0dcad2188b963914bdafdf4e98788976f9ec0a10` 已提交推送**。267项产品输入与活跃源码、隔离构建及该提交匹配；Local配置、严格签名、冻结二进制及执行测试范围分别核验。默认设备UDID `00008110-001A69110CC1401E` 安装前核验。Preview214无QA参数普通启动PID8926与真实进程匹配；普通97保留，Runner已卸载。2个专用账号／2个计划清理，2个token401、2条链接404；私密fixture／启动配置／生成工程已移除。按name／lastModDate比较新增App报告0份。

无本轮后端、分享网页或Schema发布；生产沿用此前记录的`dpl_3y9L5UfyX7v1hhUPsXGVg7Cg27zz`，不把旧部署记录作为本轮重新发布或重新核验部署ID。

[执行与初轮范围](./evidence/2026-10-24-plan-date-column214/acceptance-runs.json)、[最简复查](./evidence/2026-10-24-plan-date-column214/minimal-implementation-review.json)、[逐图记录](./evidence/2026-10-24-plan-date-column214/visual-review.json)、[完整API](./evidence/2026-10-24-plan-date-column214/final-native-api.json)、[候选未变](./evidence/2026-10-24-plan-date-column214/picker-api.json)、[测试来源](./evidence/2026-10-24-plan-date-column214/test-source-provenance.json)、[构建来源](./evidence/2026-10-24-plan-date-column214/native-build-manifest.json)、[设备核验](./evidence/2026-10-24-plan-date-column214/device-verification.json)、[账号链接清理](./evidence/2026-10-24-plan-date-column214/final-native-cleanup.json)。

[普通筹划卡（离线fixture）](./evidence/2026-10-24-plan-date-column214/home-normal-planning-offline.png)、[等待横排](./evidence/2026-10-24-plan-date-column214/home-normal-waiting-offline.png)、[真实候选卡](./evidence/2026-10-24-plan-date-column214/candidate-normal.png)、[真实已确定卡](./evidence/2026-10-24-plan-date-column214/home-live-confirmed.png)、[最大待处理上段](./evidence/2026-10-24-plan-date-column214/home-max-task-part-1.png)、[最大待处理下段](./evidence/2026-10-24-plan-date-column214/home-max-task-part-2.png)、[最大已定上段](./evidence/2026-10-24-plan-date-column214/home-max-confirmed-part-1.png)、[最大已定下段](./evidence/2026-10-24-plan-date-column214/home-max-confirmed-part-2.png)、[交付](../releases/2026-10-24-preview214-plan-date-column.md)。
