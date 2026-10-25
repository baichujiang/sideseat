# Preview 218：整张计划卡片作为入口

2026-10-25，Europe/Berlin。默认 iPhone 14 Plus 已安装并正常启动 **Preview 218，PID 9025**，普通 SideSeat 97 保留。最终真实候选卡片／离线三类卡片导航专项分别 **232.292／181.380 秒**；40 次最终原图捕获、35 种像素已复核。

## 实现

按用户要求移除卡片内部「打开时间表」等重复的按钮外观，整张卡片继续作为原入口。原动作是父级 Button 内的样式化文字，并非嵌套 Button；本次删除该视觉标签、仅服务该布局的任务底栏 `ViewThatFits` 和动作显示辅助。三类卡片共用原人数摘要及按既有条件显示的箭头，减少卡片高度。

父级 Button、完整 AX 动作描述、日期／状态判定和原回调不变。收集空闲的计划原本就由整卡进入时间表；其他阶段及既有私聊计划继续走各自原详情路由。仅改 `PlansRootView` 与 Preview 构建号，无新增状态、请求、组件或依赖，邀请／日历规则保持。

## 最终验证与限制

| 专项 | 实际范围 |
| --- | --- |
| 真实候选卡片 | 232.292 秒；七天短标题、七天长标题、稀疏两天、跨年两天；中文 L 浅色、中文 xLarge 浅色、英文 L 浅色、德文真实 AccessibilityXXXL 深色；精确 AX 日期／实际数量／时间待定、无虚构时钟，保留严格视口／44pt／连续分段检查 |
| 整卡入口 | 每组合从首张候选卡左侧进入原详情并返回，点击位置不依赖旧动作标签；手机专项不填写或提交 |
| 三类卡片导航 | 181.380 秒；既有受控离线记录，中文普通／德文最大字号；原私聊详情、分栏、创建取消、历史往返及普通横向等待／最大字号纵排 |
| 服务端保持 | 两个专用 QA 账号、四个 COLLECTING 计划；前后 phase、chosenStart／chosenEnd、participantCount、mySlotIds、invitationVersion 完全一致 |

沿用既有测试，测试源码未改；真实 API 候选与受控离线导航分开，后者的红色网络提示属于 fixture。最大真实候选卡片通过严格视口及必要的重叠分段阅读；私聊卡最大字号导航只验证实际可见部分，本轮未重跑三类完整最大卡片专项。40 次最终捕获／35 种像素，完全相同者按 SHA 复用原图审查；系统浮层和详情可见范围以逐图记录为准。

本轮未重跑单元／领域／网页／浏览器或完整邀请至双方日历 API 链，不作全 App 最大字号或人工性能声明。未改变的 formatter／状态契约沿用已有范围，旧单元结果不计作本轮执行。

## 来源、手机与清理

源码 **`144edd48f92927e95892c6408f361484722e2e2a` 已提交并推送**。267 项产品输入、Local 配置、严格签名和最终冻结二进制与活跃源码／隔离构建／提交核验一致。默认设备 UDID `00008110-001A69110CC1401E` 身份、无 QA 参数普通启动 PID 9025 与真实进程匹配，普通 97 保留。

两个专用 QA 账号／四条计划链接已清理，账号 token 401、链接 404；Runner、私密 fixture／启动配置／生成工程移除。按报告名称及 lastModDate 比较新增 App 报告 **0 份**。本轮仅原生 UI，无后端／网页／Schema 发布；生产沿用此前记录的 `dpl_3y9L5UfyX7v1hhUPsXGVg7Cg27zz`，不作为本轮重新核验部署结果。

[执行记录](./evidence/2026-10-25-card-entry218/acceptance-runs.json)、[逐图](./evidence/2026-10-25-card-entry218/visual-review.json)、[最简复查](./evidence/2026-10-25-card-entry218/minimal-implementation-review.json)、[服务端之前](./evidence/2026-10-25-card-entry218/server-before.json)、[服务端之后](./evidence/2026-10-25-card-entry218/server-after.json)、[来源](./evidence/2026-10-25-card-entry218/native-build-manifest.json)、[设备](./evidence/2026-10-25-card-entry218/device-verification.json)、[清理](./evidence/2026-10-25-card-entry218/final-native-cleanup.json)。

[真实候选普通](./evidence/2026-10-25-card-entry218/candidate-normal.png)、[真实候选 xLarge](./evidence/2026-10-25-card-entry218/candidate-xlarge.png)、[需要处理／离线](./evidence/2026-10-25-card-entry218/task-normal-offline.png)、[等待他人／离线](./evidence/2026-10-25-card-entry218/waiting-normal-offline.png)、[已确定／离线](./evidence/2026-10-25-card-entry218/confirmed-normal-offline.png)、[交付](../releases/2026-10-25-preview218-card-entry.md)。
