# Preview 217：计划卡片动作位置与内容精简

2026-10-25，Europe/Berlin。默认 iPhone 14 Plus 已安装并正常启动 **Preview 217，PID 9008**，普通 SideSeat 97 保留。最终候选卡片、三类卡片导航、最大字号完整卡片专项分别 **254.545／182.700／64.702 秒**；49 次最终原图捕获、39 种像素已复核。

## 问题与实现

用户指出「打开时间表」位置不合适，右侧装饰图无实际作用。原任务卡底栏把整个 `HStack` 固定成内容宽度，`Spacer` 无法把动作推到右侧。现在仅让数量和动作各自按内容尺寸布局，恢复中间弹性留白；普通宽度可容纳时动作靠右下，空间不足仍使用既有纵向回退，不额外占一行。

移除卡片右侧装饰图及仅供该图渲染使用的 `isChoosingActivity` 参数／属性。删除不再使用的图片／回退 View 实现，保留原 `activityTopic` 静态判断供卡片着色使用，`PlanHomePeople` 不变，已有资源文件不删除。

整张卡片仍是原父级 Button，原动作标题、AX、路由、状态判定、日期选择器和邀请／日历规则保持；无新增请求、状态、依赖或业务组件。独立只读最简审查无实质问题，实际像素另按下方专项验收。

## 最终验证与范围

| 专项 | 实际范围 |
| --- | --- |
| 真实候选卡片 | 254.545 秒；七天短标题、七天长标题、稀疏两天、跨年两天，中文 L 浅色、中文 xLarge 浅色、英文 L 浅色、德文真实 AccessibilityXXXL 深色；原精确 AX 日期／实际数量／时间待定及无虚构时钟断言，首张卡进入原详情并返回 |
| 三类卡片与导航 | 182.700 秒；既有受控离线记录，中文普通／德文最大字号；原详情路由、分栏、创建取消、历史往返和横向等待分区／最大字号纵排 |
| 最大字号完整卡片 | 64.702 秒；沿用完整卡片用例，连续分段覆盖需要处理、等待他人、已确定三类，保留严格视口、44pt 和分段重叠断言 |
| 服务端保持 | 两个专用 QA 账号、四个 COLLECTING 计划，测试前后 phase、chosenStart／chosenEnd、participantCount、mySlotIds、invitationVersion 完全一致；手机专项不填写或提交 |

沿用既有测试，测试源码未改；以上为分次专项，不把离线记录的红色网络提示当作真实 API 首页。最大长卡以有重叠的连续原图阅读，不声称全部信息同屏；49 次最终捕获／39 种像素，完全相同者按 SHA 复用原图审查。系统浮层和具体可见限制以逐图记录为准。

本轮未重跑单元／领域／浏览器、完整邀请至双方日历 API 链，也不作全 App 最大字号或人工性能声明。`PlanPresentation` 与 216 逐字一致；216 的 20 项／0.054 秒单元结果仅保留原范围，不计为 217 新执行。

## 来源、手机与清理

源码 **`e8cbc4bab14dd821a8a18d94a6c732450cbc7d10` 已提交并推送**。267 项产品输入、Local 配置、严格签名和最终冻结二进制与活跃源码／隔离构建／提交核验一致。默认设备 UDID `00008110-001A69110CC1401E` 身份、无 QA 参数普通启动 PID 9008 与真实进程匹配，普通 97 保留。

两个专用 QA 账号／四条计划链接已清理，账号 token 401、链接 404；Runner、私密 fixture／启动配置／生成工程移除。按报告名称及 lastModDate 比较新增 App 报告 **0 份**。本轮仅原生 UI，无后端／网页／Schema 发布；生产沿用此前记录的 `dpl_3y9L5UfyX7v1hhUPsXGVg7Cg27zz`，不作为本轮重新核验部署结果。

[执行记录](./evidence/2026-10-25-card-actions217/acceptance-runs.json)、[逐图](./evidence/2026-10-25-card-actions217/visual-review.json)、[最简复查](./evidence/2026-10-25-card-actions217/minimal-implementation-review.json)、[服务端之前](./evidence/2026-10-25-card-actions217/server-before.json)、[服务端之后](./evidence/2026-10-25-card-actions217/server-after.json)、[来源](./evidence/2026-10-25-card-actions217/native-build-manifest.json)、[设备](./evidence/2026-10-25-card-actions217/device-verification.json)、[清理](./evidence/2026-10-25-card-actions217/final-native-cleanup.json)。

[真实候选普通](./evidence/2026-10-25-card-actions217/candidate-normal.png)、[真实候选 xLarge](./evidence/2026-10-25-card-actions217/candidate-xlarge.png)、[需要处理／离线](./evidence/2026-10-25-card-actions217/task-normal-offline.png)、[等待他人／离线](./evidence/2026-10-25-card-actions217/waiting-normal-offline.png)、[已确定／离线](./evidence/2026-10-25-card-actions217/confirmed-normal-offline.png)、[交付](../releases/2026-10-25-preview217-card-actions.md)。
