# 计划首页创建入口 — Preview 199

首页「发起计划」从两个分栏里的整行深色提交按钮，移到固定抬头右侧。复用中性的 `SSActionButtonStyle(size: .toolbar)`、浅底／文字色和轮廓；普通字号显示「＋ 发起计划」，xxxLarge 及以上显示加号并保留完整辅助功能名称。历史移到左侧，原品牌抬头与两个分栏保留。入口只有一份，加载、空数据、有数据以及切换／滚动时位置一致。

删除原 `planActions` 包装，沿用原创建状态、primary/unified 标识、sheet、关闭刷新与打开新计划逻辑；未新增状态、颜色、组件、请求或依赖。日期默认值、创建、填写、活动提议、邀请及日历规则均未修改。独立实现／测试与实图复查完成。

## 实际验收

默认 iPhone 14 Plus `00008110-001A69110CC1401E`，实际安装同一 **199** 产品包：

| 检查 | 实际通过结果 |
| --- | --- |
| 首用打开创建／取消 | 11.284 秒 |
| 空数据加载到入口 | 19.934 秒 |
| 有数据加载到入口 | 11.469 秒 |
| 消息页转计划／创建／取消 | 15.938 秒 |
| 真实 API：无筹划活动、已确定有卡片、创建取消保留分栏 | 19.016 秒 |
| 中德普通／最大字号 × 空／有 PlansStore 数据，8 组合 | 89.739 秒 |
| 德文 xxLarge 最后完整文字分支 | 19.850 秒；宽度 145.667 → 170.333pt，字号确实生效 |
| 长列表真实位移、固定入口、历史／聊天往返、创建取消 | 最后定界复测 35.587 秒 |
| 完整好友创建到双方日历 | 连续 369.816 秒，8 个 API 阶段 |

顶部专项检查唯一导航入口、44pt 点击范围、左右次序、导航范围、标题与按钮不交叠，以及两个内容列表没有重复创建按钮。普通中文创建控件约 **118 × 44pt**，最大字号加号约 **52 × 44pt**。44pt 断言只容许 0.001pt 的浮点表示误差，远小于一个物理像素。

**8 组合与 xxLarge 使用受控离线协调接口和本地 PlansStore 夹具，只验收顶部布局。** 图中红色错误是刻意离线，不代表真实 API 失败，也不能称清洁全页空态。九张布局图逐一查看：中德普通文字完整，大字号加号和轮廓完整；德文普通／xxLarge 标题由 UIKit 放得更靠左，但与两侧动作有间距。真实 API 的清洁页面另行验证。

[真实筹划空页](./evidence/2026-10-24-plan-create-entry199/home-live-planning.png)、[真实已确定／取消返回](./evidence/2026-10-24-plan-create-entry199/home-live-confirmed-after-cancel.png)、[实际创建表单](./evidence/2026-10-24-plan-create-entry199/home-live-create.png)。[中文普通有数据布局](./evidence/2026-10-24-plan-create-entry199/home-toolbar-zh-Hans-normal-populated-store.png)、[中文最大字号](./evidence/2026-10-24-plan-create-entry199/home-toolbar-zh-Hans-largest-populated-store.png)、[德文普通](./evidence/2026-10-24-plan-create-entry199/home-toolbar-de-normal-populated-store.png)、[德文 xxLarge](./evidence/2026-10-24-plan-create-entry199/home-toolbar-de-xxLarge-populated.png)、[德文最大字号](./evidence/2026-10-24-plan-create-entry199/home-toolbar-de-largest-populated-store.png)。

完整流程由手机完成创建、原位修改／取消／保存、点选／取消／拖选／手动提交、好友卡片发送与去重、双方填写、跨天最终时间、名单／正式邀请、接受、发起人发布和日历；Mac 仅准备专用联系人及读取 API。六次 owner／participant × COLLECTING／INVITING／CONFIRMED 分享权限检查通过，计划卡片始终一条，双方日历各一条且起止准确。[API 8 阶段](./evidence/2026-10-24-plan-create-entry199/entry199-api.json)、[连续流程结果](./evidence/2026-10-24-plan-create-entry199/phone-summary.json)、[跨天邀请](./evidence/2026-10-24-plan-create-entry199/invitation-continuous-across-midnight.png)、[真实日历](./evidence/2026-10-24-plan-create-entry199/contacts-calendar-result.png)。

## 失败轮次与未解决观察

初轮七项中四项通过，三项失败，未记为整套通过。布局两项在精确 44pt 被表示成 `43.99999999999999` 时失败（8.477／9.521 秒）；另一项因查询 predicate 不支持 `hittable` 失败（8.361 秒）。仅修测试为浮点容差与取出元素后使用公开 `isHittable` 属性，产品未改。[初轮结果](./evidence/2026-10-24-plan-create-entry199/layout-initial-summary.json)。

第二轮 8 组合和德文 xxLarge 通过，历史专项 **36.206 秒失败**：历史／聊天两次返回后，测试额外对最后分栏左滑，截图出现聊天层重新覆盖根页；根因未证明，不能称为系统前进手势或已修复。最终仅验收本次入口所需的历史→聊天→返回→直接创建／取消，第二次返回明确定位历史导航栏，35.587 秒通过，检查实际可点与布局。移除额外左滑是限定本轮验收范围，**不代表修复该边界导航／手势**。[第二轮结果](./evidence/2026-10-24-plan-create-entry199/layout-second-summary.json)、[额外左滑实际现象](./evidence/2026-10-24-plan-create-entry199/history-extra-left-swipe-observation.png)、[定界复测结果](./evidence/2026-10-24-plan-create-entry199/history-summary.json)。

手机没有新增 App 崩溃，但完整流程详情／最终选时阶段出现 **1 份 CPU resource 报告**：02:20:23–02:22:24 CEST，121.33 秒平均 74% CPU；系统 `Action taken: none`，流程之后完成。原因及本次抬头调整的因果关系未证明，本轮未修复，不写成无资源报告。[脱敏资源观察](./evidence/2026-10-24-plan-create-entry199/cpu-resource-observation.json)。

最大字号验收仅首页顶部入口。先前德文详情最大字号格子、较高固定底栏与长时段菜单回顶未修改或重新验收；无网页／后端、领域／单元／浏览器、活动提议或过期业务重复测试。

## 构建与交付证据

[逐轮及各项最终结果](./evidence/2026-10-24-plan-create-entry199/acceptance-runs.json)明确记录分批复测，不能误称一次完整布局套件全通过。所有修测试／限定范围期间产品包保持一致。

[构建来源](./evidence/2026-10-24-plan-create-entry199/native-build-manifest.json)：248 App／18 配置脚本与 project.yml／1 共享资源从活跃工作区刷新到隔离生成工程，逐字节一致；私密 Local 配置相等，二进制 hash 与严格签名复验。连续流程、初始布局、矩阵和最终历史测试源码 hash 分别记录。

[手机核验](./evidence/2026-10-24-plan-create-entry199/device-verification.json)：Preview **199**，无测试参数普通启动 **PID 7839** 与进程 executable 相符，普通 **97** 保留。Runner／私密夹具／xctestrun／设备 JSON 清理，日志 0600，结果及附件 0700；手机系统原始报告未删除。[专用数据清理](./evidence/2026-10-24-plan-create-entry199/entry199-cleanup.json)：两账号、两 token 401、一链接 404。

无后端／网页发布；[api/www 只读重验](./evidence/2026-10-24-plan-create-entry199/production-status.json)仍为 Ready `dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7`。无关 `tsconfig.json` 保留且不提交。
