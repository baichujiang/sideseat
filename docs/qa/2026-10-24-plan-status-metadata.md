# Preview211：共同计划状态并入时间表元数据

2026-10-24，Europe/Berlin。**最终同包专项154.962秒、完整原生流程368.720秒及8阶段API通过；实际原图复核、清理和手机211普通启动已核验。** 前两次测试定位失败单列保留，未计为最终通过。

## 本轮改动与保留范围

普通候选时间计划的 COLLECTING 详情，标题区域只保留活动名、分享和原有地点入口。原先位于地点左侧的状态胶囊移到时间表上方的日期／人数元数据区：左侧第一行日期，第二行灰色小状态点、caption 状态文字和时区；右侧仍为已填写人数及原头像入口。普通收集状态中文显示「收集空闲 · Europe/Berlin」；时区取实际计划值，不写死为 Berlin。新状态没有胶囊底、描边或点击动作。

- `PlanDetailHeading.showsStatus` 默认开启，只有 `PlanInlineInformation` 在 `COLLECTING && !hasFixedTime` 时隐藏标题区状态。
- `TimePollDetailView.collectionSurface` 在既有日期／人数自适应布局内放置局部状态；`.findingTime` 使用现有 `Collecting availability` 本地化键，活动待定等状态保留原状态文本。全局 `Finding a time` 文案及共享 `PlanStatusBadge` 样式未改。
- 中文值由「正在征集时间」改为「收集空闲」；德文值改为「Freie Zeiten sammeln」。日期／人数布局、头像名单、点击区及地点编辑保持原实现。
- FIXED 活动选择、INVITING／CONFIRMED／过期详情标题及状态覆盖保持。调整邀请复用时间表时按原 INVITING 状态显示，不插入收集状态。
- 创建后进入时间表、首次手动提交后分享、顶部可提前分享、后续修改、参与者提交、邀请版本和唯一日历规则不变。没有新增业务状态、请求、接口、依赖或数据迁移。

## 已确认的源码审查

[验收数据](./evidence/2026-10-24-status211/acceptance-runs.json) 记录独立只读精简审查通过，范围仅为普通收集详情的状态呈现。源码冻结后的测试定位修正未改变 App 源码或二进制；此项审查不替代真机验收。

保留 `time-poll-date-range`、`plan-display-status`，新增局部元数据容器标识 `plan-collection-metadata`，便于按实际日期、状态文字与人数的相对位置核对。状态的小点不承担按钮功能，也不应被当成文字元素测量。

## 前两次测试失败与定位修正

| 运行 | 实际结果 | 已确认原因与修正范围 |
| --- | --- | --- |
| 首轮专项，16.071 秒 | 1 失败，非验收通过 | any-type `firstMatch` 选中了与 Label 共享标识的装饰性 5pt AX Other，而非状态 StaticText。原始 PNG 显示实际布局正确；失败属于测试定位。 |
| 第二轮专项，20.952 秒 | 1 失败，非验收通过 | 测试错误假设状态文字在上述 Other 子树内。实际导出的 AX 显示小点 Other 与完整状态 StaticText 是元数据区内的同级元素；定位改为按稳定标识选择 StaticText。 |

定位修正保留发起人／参与者对应的状态文字、时区、完整可见范围、元数据相对几何和原有 44pt 操作区断言，没有改 App 或放宽这些要求。两次失败范围单独保留，不写作产品布局修复或最终全通过。

## 最终验收与交付

| 验证 | 本轮实际结果 |
| --- | --- |
| 状态布局专项 | 154.962秒，1通过、0失败／跳过。中文普通浅色0／8人、德文真实系统AccessibilityXXXL深色owner／participant四组合。精确状态与时区、完整视口、metadata分层、44pt、最终选时返回均通过。 |
| 完整原生好友流程 | 中文普通字号368.720秒，1通过、0失败／跳过。同一冻结App211创建、先填自己的空闲并提交分享、发送好友卡片、朋友填写、跨天23:00–次日01:00、名单核对／正式邀请、接受／发起人主动发布及双方Calendar。 |
| 实时API | 8阶段全通过；前3阶段填写人数0／1／1、卡片0／0／1，未定时前无邀请。双方精确空闲、邀请版本／接受人数、跨天2小时、最后各一条精确日历均核对。 |
| 原图 | 19张专项＋25张完整链逐张original查看。保留13张最终及1张首轮定位失败图；没有用合成效果图替代。 |
| 无意外写入 | 0／8人两份专项计划保持COLLECTING，owner／participant未填、无邀请／最终时段；测试最终选时取消只改本地草稿。 |
| 手机／来源 | 默认iPhone14 Plus安装211、无测试参数普通启动PID8696及实际进程一致；267受跟踪输入、Local、严格签名、冻结二进制核验。普通97保留，Runner／私密启动文件移除。 |
| 清理／诊断 | 两专用账号401、三链接404确认后删除夹具；本轮比较无新增App报告（含0崩溃退出），不扩展为旧CPU问题或纯人工性能优化结论。 |

最大字号长页需要滚动；部分头像截图人数第二行贴近底栏视口，不宣称每张图所有内容同时完整或有充足底部留白。系统AssistiveTouch浮层局部遮挡右侧，并非App排版。Calendar原图仅直接展示标题、地点及开始时间；精确结束和双方唯一性用API／原生断言另证。

未重跑未改动的unit／domain与浏览器参与流程；旧inline-header矩阵断言已更新但方法本轮没执行，由最终专项替代。邀请／日历业务规则不变，本轮无后端／网页／Schema发布；生产API部署仍Ready，见只读核验记录。不声明整App最大字号视觉验收或修复其他旧观察。

[验收运行](./evidence/2026-10-24-status211/acceptance-runs.json)、[8阶段API](./evidence/2026-10-24-status211/final-native-api.json)、[专项未改服务端](./evidence/2026-10-24-status211/layout-server-unchanged.json)、[图审范围](./evidence/2026-10-24-status211/visual-review.json)、[构建来源](./evidence/2026-10-24-status211/native-build-manifest.json)、[设备](./evidence/2026-10-24-status211/device-verification.json)、[清理](./evidence/2026-10-24-status211/final211-cleanup.json)、[生产只读核验](./evidence/2026-10-24-status211/production-check.json)。

## 实际效果

[中文普通0人顶部](./evidence/2026-10-24-status211/focused-zh-normal-zero-heading.png)、[8人元数据](./evidence/2026-10-24-status211/focused-zh-normal-eight-metadata.png)、[德文系统最大字号](./evidence/2026-10-24-status211/focused-de-systemmax-owner-metadata.png)、[最大字号最终选时](./evidence/2026-10-24-status211/focused-de-systemmax-owner-final.png)。

[提交后分享](./evidence/2026-10-24-status211/flow-submit-and-share.png)、[朋友填写](./evidence/2026-10-24-status211/flow-participant-availability.png)、[跨天最终时段](./evidence/2026-10-24-status211/flow-final-cross-day.png)、[正式邀请](./evidence/2026-10-24-status211/flow-formal-invitation.png)、[真实Calendar结果](./evidence/2026-10-24-status211/flow-participant-calendar.png)。
