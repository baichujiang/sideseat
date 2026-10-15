# 已部署功能与归档边界

**状态：** 当前运行清单；最后核验 2026-10-15，Europe/Berlin。

本文件记录实际安装、部署、开关和入口，供维护时确认版本使用。
产品语义仍由 [Product](./PRODUCT.md) 和 [User Flow](./USER_FLOW.md) 管理；
源码里有声明、测试曾通过或讨论过一个方案，都不代表当前用户能进入该功能。

## 版本与核验依据

| 对象 | 实际状态 | 依据 |
| --- | --- | --- |
| 活跃项目 | `/Users/baichu/Desktop/项目/app开发项目/Sideseat-ios-uxui`，`codex/ios-uxui-20260922` | 工作区与 Git 根目录核对；本次实现前 fetch，基线 `a5904fc` 与远程 0/0、干净；功能提交 `7657176` 已推送 |
| 当前手机开发版 | `SideSeat Preview / app.sideseat.mobile.preview / 1.0.0 (100)` | 本次签名校验、设备安装和空参数启动；[本次交付](./releases/2026-10-15-preview100-unified-plans.md) |
| 默认真机测试设备 | iPhone 14 Plus / iOS 26.6.1，已安装 Preview 100 | 2026-10-15 重新签名、安装清单、空参数启动与登录首屏；联网授权与登录后业务验证待完成；[新手机安装记录](./releases/2026-10-15-preview100-iphone14plus.md) |
| Preview 100 原生源码 | `6d5e6b5137c78e49291805b1a9989ac462fb209f` | 当前分支已提交并推送；本次签名构建来自该源码 |
| 普通 SideSeat | `app.sideseat.mobile / 1.0.0 (97)` | 本次设备应用清单；独立安装，仍保留兼容；本次未重新核验 Apple 当前分发状态 |
| 生产 API | `https://api.sideseat.de` → `dpl_4vBvPch35jxdarqmgnxmvSsGSt6u`，Ready | 本次 Vercel inspect、公开配置与 HTTP 检查 |
| 生产源码 | 1,323 个上传文件均与受控发布目录 SHA-1 一致；基于原生产部署保留差异，22 项覆盖来自功能提交；排除 7 个归档原路径 | [发布清单](./qa/evidence/2026-10-15-unified-plans/source-manifest.json)、[上传核对](./qa/evidence/2026-10-15-unified-plans/uploaded-source-verification.json) |

此前审计与归档没有产生发布。之后用户明确批准统一计划，本次增加两项向前迁移、
发布后端并安装 Preview 100；没有上传 TestFlight/App Store。
Preview 99 的既有交付保留为[历史记录](./releases/2026-10-15-preview99-native-time-polls.md)。

## 当前功能和实际入口

| 功能 | 当前入口/行为 | 核验范围 |
| --- | --- | --- |
| 同行 | 我的意愿、自动推荐、主动寻找、私密收藏、带意愿上下文的招呼；回复后继续聊天 | 原生导航/源码、线上配置；本次未重跑完整匹配业务 |
| 计划 | **计划 → + → 发起计划**；可「一起定时间」或「直接选时间」。征集结果选择参与者后转邀请，逐人确认后写入各自日历。概览/即将进行/已结束共用入口；旧聊天双人计划与其改期/反馈继续保留 | 本次原生创建、填写、邀请、确认、重开及日历联调；[验收记录](./qa/2026-10-15-unified-plans.md) |
| 智能约时间 | **聊天 → 发起计划 → 智能约时间**；读取自己的已同步日历空档并填入草稿 | 已安装 Preview 99 实测中文名称；对应 `PlanCreateSheet` / `SmartTimeSuggestionSheet` |
| 多人时间征集 | **计划 → + → 一起定时间**；消息原入口、邀请链接也打开同一共享计划。15 分钟拖选/擦除、自动保存、热图、完整时长的共同时间/最多人数推荐、选择名单并邀请 | 本次五账号共同时间与四人推荐、排除第五人及保存重开；Sideseat 原生界面和自有数据服务 |
| 日历 | 个人日程、课程、已确认计划投影、搜索、智能输入、订阅与导入/导出 | 当前导航/源码、线上配置；本次未逐项重跑 |
| 消息 | 新招呼、已有双人聊天、计划协商、分享链接与原生时间征集入口 | 当前导航/源码，实际消息页与征集入口实测 |
| 我 | 资料、学生认证、课程管理、语言、外观、会员、隐私、安全和设置 | 当前导航/源码；会员身份与邀请码不等于 StoreKit 已启用 |
| 原生账号、远程通知 | 账号 API 与 APNs 开关已开启 | 公开线上配置；本次没有重做登录写入、通知投递和符号化测试 |
| 公开网页与管理后台 | iPhone 引导、隐私/支持、批准的分享/征集链接、AASA；后台及其登录保留 | 线上 HTTP、middleware allowlist；未进行管理员登录 |

「一起定时间」现已纳入「计划」，与直接定时间共用邀请、确认和取消生命周期。
填写有空不等于确认；仅全部选中的参与者接受同一版邀请后，才同步到各自 Sideseat 日历。
人数最多的四人结果由发起者明确选择四人邀请，第五人保留答复、不获得日历记录。
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
本次发布从该生产源码逐项校验重建，保留运行库差异，再覆盖本次 22 项依赖；
上传后全部 1,323 文件的 SHA-1 均与发布目录一致。后续发布继续从当前线上部署对照，
不可把整个 Git 工作区直接当作生产快照。
