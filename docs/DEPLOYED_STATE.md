# 已部署功能与归档边界

**状态：** 当前运行清单；最后核验 2026-10-16，Europe/Berlin。

本文件记录实际安装、部署、开关和入口，供维护时确认版本使用。
产品语义仍由 [Product](./PRODUCT.md) 和 [User Flow](./USER_FLOW.md) 管理；
源码里有声明、测试曾通过或讨论过一个方案，都不代表当前用户能进入该功能。

## 版本与核验依据

| 对象 | 实际状态 | 依据 |
| --- | --- | --- |
| 活跃项目 | `/Users/baichu/Desktop/项目/app开发项目/Sideseat-ios-uxui`，`codex/ios-uxui-20260922` | 本次工作区/Git 根目录/fetch 核对，基线 `fed9ab2` 干净；一级计划页和统一导航源码 `01d6350` 已提交并推送 |
| 当前手机开发版 | `SideSeat Preview / app.sideseat.mobile.preview / 1.0.0 (110)` | 默认真机复现 109 返回隐藏列表后完成修正；七个不同 UI 用例最终通过，21 项导航单元测试通过；严格签名、安装及空参数普通启动 PID 1026 已核验；[110 交付](./releases/2026-10-16-preview110-plans-root.md) |
| 默认真机测试设备 | iPhone 14 Plus / iOS 26.6.1 / UDID `00008110-001A69110CC1401E` | 全部真机命令明确指定该 UDID，CoreDevice `D906CC6D-3EC6-50A2-8D93-A6602521362A`；用户解锁后实际执行通过 |
| Preview 110 原生源码 | `01d6350` | 已推送；一级计划创建/打开链接、确认/征集/下次安排分组。卡片、新建成功、消息和 deep link 都是一级计划页上方的一层详情；保存后刷新卡片，109 详情和自动保存保留 |
| 普通 SideSeat | `app.sideseat.mobile / 1.0.0 (97)` | 独立安装、保留兼容，未进行 TestFlight/App Store 上传 |
| 生产 API 与分享网页 | `https://api.sideseat.de`、`https://www.sideseat.de` → `dpl_EAJLd9xMRuyCx6fnoVeFphGtUmE1`，Ready | 双域名 inspect、候选及正式 Chromium/WebKit 的保存/完成/返回修改、昵称、邀请确认和两账号日历核验；[109 交付](./releases/2026-10-16-preview109-availability-feedback.md) |
| 生产源码 | 真实生产 1,343 项校验重建；保留 1,340 项原内容，仅覆盖三个 UI 文件并新增来源记录；最终 1,344 项上传 SHA-1 全匹配 | 网页来源 `167cb5f`；无 API/Schema 变化，迁移显式跳过；[发布清单](./qa/evidence/2026-10-16-feedback109/source-manifest.json)、[上传核对](./qa/evidence/2026-10-16-feedback109/upload-verification.json) |

110 将共享计划集中在一级「计划」页：发起计划、打开分享链接、等待确认、一起定时间和下一次安排。
原卡片打开的 `TimePollSheet` 隐藏列表已从当前入口移除；现有卡片、新建成功、消息/分享链接共用
一层详情。完成填写后或直接返回都回到一级计划页。原 109 问题已在真机复现，七个 UI 用例最终通过，
21 项导航单元测试通过，见 [当前验收](./qa/2026-10-16-plans110.md)。
本次仅更新原生 Preview，无后端/API/Schema/迁移变化；网页仍为下表的既有生产构建。

109 重新排列共享计划顶部的状态、标题、日期、地点和时区，收紧昵称区并统一「我的时间」。
选时底部持续显示实际保存状态及天数/小时汇总；服务器确认后才能「完成填写」，进入结果并提示可返回修改。
填写完成不等于接受邀请，不改变征集阶段。慢保存/失败重试、两种浏览器及真机浅深色完成流程通过；
普通滑动仍不改选时，见 [109 验收](./qa/2026-10-16-availability-feedback109.md)。

108 的结果页直接展示「大家的时间表」和每格人数，移除共同时间/人数最多推荐卡片。
征集不再要求活动时长；发起人看表后选择日期、开始和结束时间及受邀名单，半天、全天均可。
邀请确认后，日历按实际起止时间保存。候选/正式两种浏览器、独立模拟器三项、真机三项
及日期语言修正后单项复查通过；实际 API 核对 4 小时和 12 小时日历，本地另验 24 小时跨日。
九个线上临时计划和两个账号已回收，QA runner 已卸载，108 已普通启动；
见 [108 验收](./qa/2026-10-16-timetable108.md)。

时间表现以 30 分钟为显示和编辑单位：09:00–21:00 从 48 行减为 24 行，保留 44px/pt
触控高度。旧 15 分钟填写不自动改写；半格选中显示琥珀/部分状态，点按补齐整格，
全选格再点清空，撤销恢复精确旧值。热图按同一人完整覆盖半小时计数。电脑一屏七天的
布局、手机滑动/长按、昵称和确认流程保留。网页已正式发布；用户解锁后，106 的
拖选/擦除/撤销、当天全选/清空/重开、旧半格保留及普通滑动四项真机检查全部通过。
检查中发现保存提示错误，修正并安装 107；中文浅/深色保存与重开单项复查通过，
真实 API 保存值全部匹配。四个新临时计划及账号已回收，令牌 401、分享链接 404，
QA runner 已卸载，107 当时已普通启动并核验运行。见 [30 分钟真机验收](./qa/2026-10-16-half-hour-iphone14plus.md)。
此前独立模拟器的 5 项模型/保存、4 项 UI 及网页验收保留在 [106 QA](./qa/2026-10-16-half-hour.md)。

游客名字继续填写已正式发布：按用户 2026-10-16 的熟人分享决定，输入已有游客名字即
继续同一份填写，换浏览器、清除记录后也可恢复；新名字才新建游客。名字首尾去空白、
忽略大小写，匹配限定当前计划。页面提供「开始 / 继续填写」、找到原记录提示和「切换填写人」。
同名返回不增加人数，不重置填写或参加确认；不同人应使用可区分的名字。旧浏览器仍可修改，
原随机凭据保留兼容。无需专属修改链接、注册或下载。候选/正式两种浏览器真实流程通过；
四个临时计划和账号已回收，旧令牌 401、公开链接 404。该阶段仅更新网页/后端，当时默认手机
实际安装 Preview 107；[该阶段验收及边界](./qa/2026-10-16-guest-name-resume.md)。

分享网页在电脑宽度 1024px 起优先加宽时间表、收窄参与者栏。候选与正式网页在
1024/1280/1440/1920px、中/英文、个人/结果视图均可同时显示一周七天而无需左右滑动；
320/390px 手机宽度及 768px 布局保留，手势代码不变。上一桌面布局阶段的浏览器数据由本地响应提供，
没有生产业务写入或新的真机验收，详见 [桌面周视图 QA](./qa/2026-10-15-desktop-week-view.md)。

10 月 15 日统一选时交付使用 15 分钟格，后续由 106 改为上述 30 分钟显示。两端仍保留点按/长按、当天全选和清空、
一次撤销、自动保存、相同青绿/琥珀状态色与只读人数热图；该阶段的结果推荐卡片已由 108 移除。
默认中文及单独记忆的 English 切换保留。候选和正式 www/API 的真实游客、确认及日历流程通过，
见 [统一选时 QA](./qa/2026-10-15-unified-share-ui.md)。该阶段没有数据库迁移或原生功能变更，手机当时为 Preview 105。
同一台默认 iPhone 14 Plus 的正式 Safari → Preview 105 → 网页确认 → Calendar 完整链路已通过，
确认前无日历、确认后同一游客身份及姓名均已核验；临时数据删除、QA runner 卸载，Preview 已正常启动。

Preview 105 使用青绿标识已选时段/全天全选，用琥珀标识当天部分已选；未选时段保留空白，提供图例、勾选/部分图标及浅深色配色。默认 iPhone 14 Plus 的浅/深色选时、撤销、重开、保存与普通滑动验证通过，见 [105 QA](./qa/2026-10-15-availability-colors.md)。本次没有后端发布。

Preview 104 增加星期/日期标题的当天全选和取消全选：部分选择时补全当天，其他日期保持不变，支持撤销、自动保存及重开。全选覆盖计划中配置的当天时段；结果页仍只读。已在默认 iPhone 14 Plus 通过三项真机回归及真实 API 持久化核验，见 [104 QA](./qa/2026-10-15-day-selection.md)。本次没有后端发布。

Preview 103 增加免下载、免注册的游客分享网页，可填写可用时间、编辑本次计划中的昵称并直接确认参加。网页与 App 共用昵称、参与者、邀请版本和结果；所有选中人员（包括游客）确认后，注册用户的 Sideseat 日历才写入计划，游客保留网页链接查看。102 的滚动/长按选择/撤销及 101 的单层新增修复继续保留。后续已恢复 XCTest 并完成 Preview 103 的 Safari/原生/日历真机验收，创建及 102 手势回归也通过；[独立验收记录](./qa/2026-10-15-iphone14plus-guest-flow.md)保留初次连接失败及后续通过的区别。

此前审计与归档没有产生发布。Preview 100 阶段按授权增加统一计划的两项向前迁移、发布后端并安装手机；Preview 103 阶段仅增加游客迁移，没有上传 TestFlight/App Store。
Preview 99 的既有交付保留为[历史记录](./releases/2026-10-15-preview99-native-time-polls.md)。

## 当前功能和实际入口

| 功能 | 当前入口/行为 | 核验范围 |
| --- | --- | --- |
| 同行 | 我的意愿、自动推荐、主动寻找、私密收藏、带意愿上下文的招呼；回复后继续聊天 | 原生导航/源码、线上配置；本次未重跑完整匹配业务 |
| 计划 | 一级页直接发起计划、打开分享链接；概览分组显示等待确认、一起定时间及下一次安排。卡片/新建/消息与分享链接打开同一层详情，完成后或普通返回均回一级页；即将开始、已结束和旧聊天计划/反馈保留 | [110 真机验收](./qa/2026-10-16-plans110.md)；七个不同 UI 用例最终通过，初批失败与定向修正分别记录 |
| 游客分享参与 | **分享计划链接 → 输入名字开始或继续填写**，已有游客名字跨浏览器恢复原记录，新名字新增；默认中文、可切 English，昵称编辑、切换填写人、30 分钟选时及网页确认；无需下载、注册或专属修改链接；电脑端一周加宽 | 本次候选/正式 Chromium/WebKit 同名修改与确认/日历通过，见 [名字继续填写 QA](./qa/2026-10-16-guest-name-resume.md)；既有桌面布局和真机记录保留 |
| 智能约时间 | **聊天 → 发起计划 → 智能约时间**；读取自己的已同步日历空档并填入草稿 | 已安装 Preview 99 实测中文名称；对应 `PlanCreateSheet` / `SmartTimeSuggestionSheet` |
| 多人时间征集 | **计划 → + → 一起定时间**；消息原入口、邀请链接也打开同一共享计划。30 分钟点按/长按拖选、旧填写部分状态、点星期全选当天、撤销、自动保存；结果直接看完整人数热图，发起人手选日期、起止时间及名单并邀请 | 当前网页、原生创建/结果/半天全天邀请和日历见 [108 QA](./qa/2026-10-16-timetable108.md)；既有手势记录见 [30 分钟真机 QA](./qa/2026-10-16-half-hour-iphone14plus.md) |
| 日历 | 个人日程、课程、已确认计划投影、搜索、智能输入、订阅与导入/导出 | 当前导航/源码、线上配置；本次未逐项重跑 |
| 消息 | 新招呼、已有双人聊天、计划协商、分享链接与原生时间征集入口 | 当前导航/源码，实际消息页与征集入口实测 |
| 我 | 资料、学生认证、课程管理、语言、外观、会员、隐私、安全和设置 | 当前导航/源码；会员身份与邀请码不等于 StoreKit 已启用 |
| 原生账号、远程通知 | 账号 API 与 APNs 开关已开启 | 公开线上配置；本次没有重做登录写入、通知投递和符号化测试 |
| 公开网页与管理后台 | iPhone 引导、隐私/支持、批准的分享/征集链接、AASA；后台及其登录保留 | 线上 HTTP、middleware allowlist；未进行管理员登录 |

「一起定时间」现已纳入「计划」，与直接定时间共用邀请、确认和取消生命周期。
填写有空不等于确认；仅全部选中的参与者接受同一版邀请后，才同步到已注册参与者的 Sideseat 日历；游客不创建账号或个人日历记录。
受邀名单由发起者明确选择；未选中的填写人保留答复，不获得本次邀请的日历记录。
「智能约时间」继续是聊天双人计划中读取自己日历空档的独立辅助工具。
新的手动多人计划不激活 Discovery Pod、旧群聊、双人 Outcome 或 Repeat 资格。

`CommunityChatView` 内有征集菜单的源码，但当前 `MVPRoutePolicy` 阻止群聊/课程群聊
路由；不能把这段源码算作 Preview 100 已开放的群聊入口。消息页的征集和邀请链接可用。

## 线上开关

本次读取 `/api/v1/client-config`；值和原始服务器时间保存在
[client-config.json](./qa/evidence/2026-10-15-deployment-audit/client-config.json)。

| 状态 | 开关 |
| --- | --- |
| 开启 | `nativeAuthentication`、`naturalLanguageSchedule`、`apnsDelivery`、`apnsSandboxDelivery`、`apnsProductionDelivery` |
| 开启 | `v2WeeklyIntent`、`v2MutualOpportunity`、`v2ActivityFit`、`v2FlexibleTiming`、`v2AutomaticMatching`、`v2DiscoveryMatching`、`v2ExploreIntents`、`v2MeetAgain` |
| 关闭，保留兼容 | `v2ActionInterest`、`v2PlanInheritance`、`v2SocialPreferences` |
| 关闭，未开放 | `v2Recommendations`、`v2SmallGroupPilot`、`storeKitSupport` |

开关开启不替代逐账户权限、导航限制、同意流程或本次未执行的业务验证。
`v2DiscoveryMatching` 指当前意愿匹配；不表示旧公开 Discover 广场重新开放。

## 保留兼容：原地冻结

这些内容仍有历史记录、旧客户端、运行依赖或共同编译的需要，不能据名称中的
`legacy`、旧日期或单一关闭开关判断为可以删除。除用户明确点名要求外，停止修改、
重构、重新开放或搬迁；也不为了“清理”去修改迁移/生产数据。

| 范围 | 当前位置 | 保留原因 |
| --- | --- | --- |
| 旧公开 Discover、发布器、帖子详情、人物/联系人、小组/课程群聊界面 | `DiscoverRootView`、`DiscoverCreateViews`、`DiscoverDetailViews`、`MyPostsView`、`PublicProfileView`、`ContactsView`、`GroupCreateSheet`、`CommunityChatView`、`GroupInfoView`、`CreateChooserSheet` 等旧界面 | 当前 `MVPRoutePolicy` 拦截对应入口；代码仍在原生目标内编译。共享模型/工具按实际当前调用保留；旧界面不是当前产品入口 |
| 旧浏览器产品页面 | `app/(app)/` 中的 discover、profile、home、inbox、courses、groups、connections、settings、onboarding、users 等页面及专属组件 | 生产网页冻结；本次 `/discover`、`/profile`、`/courses`、`/calendar`、`/chats` 均 307 到 `/ios`。管理后台、API、公开分享和原生引导仍在使用，不按整目录删除 |
| 旧 Action/B-light、Activity、群聊与旧 Plan 数据/API | `lib/v2/action-coordination/`、`lib/plans/legacy-plan-commitment-compat.ts`、相关 API/模型；[兼容合同](./LEGACY_ACTION_COMPATIBILITY.md) | 既有记录、旧客户端的安全收尾及共用 Plan/Safety 语义仍需保留 |
| 历史迁移、Schema、OpenAPI 及生成代码 | `prisma/migrations/`、`prisma/schema.prisma`、`openapi/`、原生生成客户端 | 新旧数据共同使用；迁移只向前，生成物按工具维护，禁止作为废弃代码移走 |
| 旧日期的功能合同/测试/QA | 现有 feature docs、tests、`docs/releases/`、`docs/qa/` | 日期不等于废弃。仍约束当前能力的合同和回归保留；历史验收不作为当前功能入口证据 |
| 通用开发测试账号/隔离数据库工具 | `prisma/seed.ts`、`scripts/seed-test-accounts.ts`、`scripts/with-local-test-db.mjs` | 当前 CI/本地测试仍引用；没有执行或改变其数据 |

共享的 Profile、Calendar、计划模型和 Safety 依赖继续由当前功能维护；冻结针对上表的
旧入口/兼容分支，不把整个 `lib/`、`components/` 或 Profile 模块判为废弃。

## 已明确归档

[只读归档与逐文件清单](../archive/2026-10-15-retired/README.md)包含：

- Capacitor iOS 包装工程、网页壳和配置；
- 原 When2meet 网页 Swift 实现、单元/UI 测试、Preview 98 真机 runner、发布/验收和截图；
- 已过期的九月 Together 演示及旧 Discover/账号/聊天演示 seed 工具；
- 原路线图的完整历史副本，保留旧 Build 34–40 的记录。

既有 [早期视觉归档](./archive/visual-qa-pre-together/README.md)也冻结。
所有归档均停止执行、开发和部署。恢复某一项须有用户新的明确指令。
活跃 npm 脚本已移除旧 Capacitor/Discover 展示命令；归档目录从默认源码搜索、
TypeScript、ESLint、Vercel 输入中排除，原生目标仅读取 `ios-native/SideSeat`。

## 生产源码差异的处理

9 项差异是本次审计基线 `e168acf` 与线上上传源码的对照，不能理解为本次归档造成。
其中运行库的差异为：

- `lib/analytics/layer2-outcome-pilot.ts`：线上额外排除一个内部 QA 账号；保留线上行为。
- `lib/calendar/smart-input-policy.ts`：注释措辞差异。
- `lib/media/private-blob.ts`：尾部空行差异。

其余为 `.vercelignore`、`AGENTS.md`、`README.md`、`eslint.config.mjs`、日历时区检查脚本
和仅线上存在的发布来源 JSON。完整路径/哈希及所需源码快照见
[审计记录](./qa/2026-10-15-deployment-and-retirement.md)。此前归档没有覆盖这些生产文件。
Preview 100 发布曾保留这些生产差异。Preview 103 再从真实生产 `dpl_4vBvPch35jxdarqmgnxmvSsGSt6u` 的 1,323 个文件逐项校验重建，覆盖 20 项本次依赖；上传的 1,335 个文件全部匹配受控目录。后续发布继续从当前线上部署对照，
不可把整个 Git 工作区直接当作生产快照。

分享页中文修复继续从真实生产 `dpl_6Un8qZtCE26v7edqKd2UBexBUHLx` 的 1,335 项
逐文件校验重建，保留 1,331 项原内容；覆盖三个语言文件和发布配置，新增来源记录。
最终 1,336 项上传哈希均匹配。旧发布前置脚本不执行，构建显式跳过迁移，Schema 不变；
新部署为 `dpl_63iB9RynVCpBdPi68S3SmAezuTND`，支持游客的上一版部署保留为恢复点。

统一网页选时继续从上述 1,336 项真实生产源码重建，保留 1,333 项原内容；覆盖五项
选时网页文件并新增来源记录，全部 1,339 项上传哈希匹配。API、Schema 和旧入口不变，
没有执行数据库迁移。新部署为 `dpl_Eq19xTZsKQCckjdv8Py6x94E2jtS`，上一版保留为恢复点。

桌面时间表从该部署的 1,339 项真实源码校验重建，保留 1,338 项原内容；只覆盖
`shared-time-poll.tsx` 并新增来源记录。最终 1,340 项上传全部匹配，数据库迁移显式跳过。
2026-10-16 候选检查通过后 promote 同一构建至 `dpl_6JpdrfEay16wvWzMnzPT5o3zxEPF`，
www/API 双域名均已核验，上一统一选时部署保留为恢复点。

30 分钟时间格再从上述 1,340 项真实源码校验重建，保留 1,337 项原内容；覆盖三个
网页文件并新增来源记录。最终上传 1,341 项 SHA-1 全匹配，迁移显式跳过，API/Schema 不改。
候选验证后 promote 同一构建至 `dpl_JA6CDQp3JCxLfUnMmZaMm5QHRAQ5`，上一桌面周视图
部署保留为恢复点；原生 Preview 106 直接使用既有服务，无新后端依赖。

游客名字继续填写再从该部署的 1,341 项真实源码校验重建，保留 1,335 项原内容，覆盖
六个本次服务/接口/网页文件并新增来源记录。六个文件的旧版本也逐项核对与当前分支修改前
一致，最终上传 1,342 项 SHA-1 全匹配。Schema 不变，迁移显式跳过；候选真实流程通过后
promote 同一生产构建至 `dpl_6gNEve6aFMsmzWFD4rJpNgBB4fUH`。上一 30 分钟部署保留为恢复点。

完整时间表再从该部署的 1,342 项真实源码校验重建，保留 1,338 项原内容，覆盖
网页结果、邀请请求 Schema、邀请服务和 OpenAPI 四项源码，新增来源记录。最终上传
1,343 项 SHA-1 全匹配。Schema 不变，构建显式跳过迁移；候选完整流程通过后 promote
同一生产构建至 `dpl_HHqbc44TnSUitJCAgKUjNrCxNt4s`，上一名字继续填写部署保留为恢复点。
原生最终源码 `362daab` 的日期语言修正不增加后端依赖。

保存反馈发布从上述 1,343 项真实源码校验重建，仅覆盖共享页面、CSS、时间表编辑组件三项 UI 文件，
保留 1,340 项原内容，新增来源记录。最终 1,344 项上传 SHA-1 全匹配，迁移显式跳过；
候选验证后 promote 同一生产构建至 `dpl_EAJLd9xMRuyCx6fnoVeFphGtUmE1`。
上一完整时间表部署保留为恢复点；最终原生 `4ed4e2f` 的按钮文字对比修正无后端依赖。
