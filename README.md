# SideSeat

> 让每一段校园时光，都有人同行。

SideSeat 是面向大学生的校园同行产品。用户从一个具体、短期的意愿开始，
先私密收藏或发送一条带意愿上下文的招呼，对方回复后继续聊天，确认 Plan，并把真实承诺写入双方日历。
长期目标不是制造更多匹配，而是让一次共同经历自然发展成下一次适合的同行，
让原本陌生的校园逐渐充满熟悉的人。

当前核心链路：

```text
Weekly Intent 发布
→ 自动推荐 / 主动寻找更多
→ 私密收藏（可选）
→ 一条招呼消息
→ 对方回复后持续聊天
→ Plan 提议与明确接受
→ 双方 Calendar
→ 双方独立 Outcome
→ 原聊天继续保留 / 新意愿寻找新同行

Meet Again / Repeat Opportunity：另受功能开关与发布验收控制
```

SideSeat 不提供人物广场、滑动匹配、课程大群、同学名单或公开社交关系图。
课程提供匹配与课表上下文；Calendar 是承诺的可靠承载层，不是推荐入口。

## Product surfaces

原生 iPhone App 使用五个稳定入口：

```text
Together / 同行   Plans / 计划   Calendar / 日历   Messages / 消息   Me / 我
```

- **Together**：我的意愿、推荐、我的收藏；发布后自动匹配，也可主动寻找更多推荐。
- **Plans**：首屏从「发起新活动」开始；先写想做什么，再选日期。已有计划按需要你处理和等待其他人展示下一步，
  分享填写、选时间邀请、逐人确认后同步日历，同时保留聊天计划与结束反馈。
- **Calendar**：个人日程、课程、确认后的 Plan、搜索以及 Apple Calendar 互操作。
- **Messages**：招呼与回复、持续聊天，以及 Plan 提议、接受、改期与取消。
- **Me**：完整基本资料、学生认证、课程、语言、主题/图标/个人展示样式、隐私、安全和设置。

当前安装、生产部署、开关与实际入口见 [已部署功能清单](./docs/DEPLOYED_STATE.md)。
Preview 126 是当前已安装开发版：计划详情以时间表为核心，活动/状态平面展示，确认进度在表下方，完整名单按需展开；底部突出当前阶段操作，复制链接为次要图标。25 项单元、原生 263.027 秒与 Safari 150.573 秒两条完整真机、47.175 秒首页回归及 12+8 阶段 API 通过。默认手机已安装，普通启动 PID 1741 核验；[详情交付与截图](./docs/releases/2026-10-19-preview126-timetable-detail.md)。
Preview 125：需要你处理的计划纵向集中，等待其他人的计划横向排列并可查看全部；已有计划入口去外层卡片，下一次见面改为紧凑日期摘要。10 项单元、5 个呈现用例、原生 254.052 秒与 Safari 150.256 秒两条完整真机流程、12+8 阶段 API 通过。默认 iPhone 14 Plus 已安装，普通启动 PID 1671 核验；[横向分区交付与截图](./docs/releases/2026-10-18-preview125-horizontal-plan-sections.md)。
Preview 124：计划列表、详情与聊天卡片重排为状态、活动、时间、参与进度和主要入口，已有计划时首页入口紧凑并排。流程已暂存为基准版本 1。10 项单元、4 个模拟器呈现用例及 280.006 秒真实 API 模拟器完整流程通过，12 个 API 阶段通过；实体机已安装、严格签名及普通启动 PID 1606 核验，真机 UI 自动化两次在用例前初始化超时。[卡片交付与截图](./docs/releases/2026-10-18-preview124-plan-cards.md)。
Preview 123：App 与分享网页收到邀请后直接显示只读时间表，高亮最终时段，并保留活动名称、地点、日期和时区；看清后明确确认参加。25 项 Swift 单元、3 项网页计算、12 组布局、候选/正式真实流程及两条完整真机流程通过；12+8 阶段 API、深色最大字号及普通启动 PID 1585 已核验。[交付与截图](./docs/releases/2026-10-18-preview123-invitation-timetable.md)。
Preview 122：发起人点击「选择最终时间」，直接在原时间表点选起止或拖选连续时段，再确认邀请名单并发送；返回调整时间保留名单，选时不改个人空闲。22 项单元、原生双账号和 Safari 游客两条完整真机流程、11+8 阶段 API 通过。[本次交付与截图](./docs/releases/2026-10-18-preview122-final-time-timetable.md)。
Preview 121：App 参与别人发起的征集计划时，直接在大家的时间表点选自己的空闲，保存和重开不再切换页面。自己的勾选、总人数与保存反馈同时可见，最终邀请仍需明确确认参加。19 项单元、双账号真机完整流程与八阶段 API 通过；深色最大字号的表格和完整时间标签已复查。[本次交付与截图](./docs/releases/2026-10-18-preview121-participant-timetable.md)。
分享网页已统一为直接填写：填名字后就在大家的时间表点选自己的空闲，同时看总人数；自动保存后保留表格，无需切换或完成。候选/正式各 6 组真实浏览器流程和默认 iPhone 14 Plus 连续流程通过；该网页发布阶段手机为 Preview 119。[网页交付与真机验收](./docs/releases/2026-10-18-shared-web-inline-timetable.md)。
Preview 119：发起人直接在大家的时间表中点选、取消或拖选自己的空闲；勾选表示自己有空，数字表示总人数，撤销/当天选择/自动保存和分享同时可用。19 项单元、完整连续真机流程及八阶段真实 API 通过。[本次交付](./docs/releases/2026-10-18-preview119-inline-timetable.md)。
Preview 118：征集计划创建后立即显示时间表，0 人、只有自己填写和朋友填写后都可见；分享随时可用，保存和重开保留表格。10 项单元、5 项真机创建专项、修复后的连续 App→空表→填写→分享→确认→日历及六阶段 API 通过。[本次交付](./docs/releases/2026-10-18-preview118-immediate-timetable.md)。
Preview 117：计划页、聊天卡片和顶部当前安排共用状态与下一步组件，统一明确确认参加；保留双人和手动多人各自的记录、确认与改期规则。27 项单元、2 项模拟器界面、7 项真机呈现及完整 App→网页→确认→日历流程通过。[本次交付](./docs/releases/2026-10-18-preview117-plan-presentation.md)。
Preview 116：首屏以三位朋友自习的示例解释「找个大家都能来的时间」。朋友的网页分开引导填名、选空闲、等待发起人及最终确认，并修复 Safari 填名后时间格被保存栏遮挡的问题。修复后的候选/正式网页各六组真实流程、五项真机呈现和连续 App→Safari→邀请确认→日历流程通过；默认 iPhone 14 Plus 已重新安装并普通启动。[本次交付与截图](./docs/releases/2026-10-18-preview116-purpose-and-share.md)。
Preview 115：首屏突出「发起新活动」，两段式新建和填写后的独立分享页说明下一步。中文真机完整流程两次通过，五项创建呈现及大字号最终复查通过；[当时交付与截图](./docs/releases/2026-10-18-preview115-clear-start.md)。
Preview 114：计划首页、创建、填写完成及确认页面提供明确步骤和下一步操作，分享与确认操作直接可见。60 项原生回归、小屏完整流程及候选/正式各五组线上流程通过；默认 iPhone 14 Plus 安装和普通启动已核验；后续首次进入→创建→系统分享/Safari 填写→邀请确认→日历的连续真机流程已通过，五阶段真实 API 断言通过。[真机补验](./docs/releases/2026-10-18-preview114-phone-acceptance.md)。[当时交付及验证范围](./docs/releases/2026-10-18-preview114-plan-guidance.md)。
113 的通知漏失、保存回滚和过期收尾修复继续保留；112 的消息顶部「新招呼」与「通知」、未读角标及详情跳转保留。
110 的一级「计划」提供发起计划和打开分享链接，集中展示等待确认、一起定时间与下一次安排。所有卡片、新建、消息/分享链接共用一层详情，完成填写后或直接返回均回到一级计划页。[110 交付](./docs/releases/2026-10-16-preview110-plans-root.md)、[该阶段真机验收](./docs/qa/2026-10-16-plans110.md)。
109 当时增加详情顶部层级、底部自动保存反馈和完成填写，后续直接填写取代完成按钮；[109 记录](./docs/releases/2026-10-16-preview109-availability-feedback.md)。
108 的完整人数时间表和手选半天/全天邀请保留；[108 记录](./docs/releases/2026-10-16-preview108-timetable.md)。
时间表继续以 30 分钟为一格；旧 15 分钟填写保留，半格显示部分已选，支持精确撤销。拖选、全天全选、撤销、保存重开和普通滑动的既有真机记录见 [30 分钟验收](./docs/qa/2026-10-16-half-hour-iphone14plus.md)。
可用时间以青绿表示已选、琥珀表示部分已选，提供图例并适配深色模式。
点星期/日期可全选当天，再点清空，支持撤销与自动保存；交付及真机验收见 [Preview 105](./docs/releases/2026-10-15-preview105-availability-colors.md)。
游客分享、昵称和网页确认沿用 103；[完整真机验收](./docs/qa/2026-10-15-iphone14plus-guest-flow.md)保留为独立记录。
游客在分享页输入之前的名字即可继续修改原填写，换浏览器或清除记录后同样有效；同名不增加人数，不同朋友请用可区分的名字。无需专属修改链接；[名字继续填写交付](./docs/releases/2026-10-16-guest-name-resume.md)。
分享网页默认中文，选时方式已与 App 统一：时间格点按/长按、当天全选、撤销、自动保存、青绿/琥珀配色及人数热图；保留 English 切换。[线上交付与验收](./docs/releases/2026-10-15-unified-share-ui.md)。
电脑端时间表在 1024px 起加宽，优先完整显示一周，参与者栏收窄；手机布局及选时方式保留。[桌面周视图交付](./docs/releases/2026-10-15-desktop-week-view.md)。
普通 SideSeat / TestFlight 97 为独立的旧分发版本。
多人时间征集位于「计划 → 发起新计划 → 时间还没定」；聊天中的「智能约时间」是个人日历空档推荐。

旧 Capacitor 工程、When2meet 网页实现及过期演示工具已移入
[只读归档](./archive/2026-10-15-retired/README.md)，停止开发与执行。
旧网页、客户端接口和历史数据依赖按功能清单标为保留兼容，默认冻结。

2026-10-02 控件用色约定：普通按钮、分页、筛选和收藏使用清晰的中性色；
深红底白字仅用于少数强调操作，避免浅粉底红字。品牌标志与语义状态色保留。
2026-10-15：可用时间编辑使用青绿表示已选、琥珀表示当天部分已选，并保留图标和图例。

## Architecture

- `ios-native/`：SwiftUI 原生 iPhone 客户端，最低 iOS 17。
- `app/api/`：Next.js App Router HTTP API 与公开链接入口。
- `lib/`：服务端领域逻辑、匹配、Plan、Calendar、消息与安全规则。
- `prisma/`：PostgreSQL Schema 和仅前向迁移。
- `openapi/v1.json`：原生客户端 API 的契约来源。
- `ios-native/SideSeat/Generated/OpenAPI/`：由 OpenAPI 生成，不手工编辑。
- `tests/`、`e2e/`、`ios-native/SideSeatTests/`、`ios-native/SideSeatUITests/`：
  服务端、API、Swift 和 UI 验证。
- `docs/`：产品、工程合同、设计、发布与运维文档。

生产服务运行在 Vercel 与 PostgreSQL/Neon 上。原生客户端、公开兼容页面和 API
共享同一账号及数据来源。

## Documentation authority

开始产品或工程修改前先阅读：

1. [AGENTS.md](./AGENTS.md) — 本仓库开发方式与归档边界。
2. [Deployed state](./docs/DEPLOYED_STATE.md) — 真实安装、部署、开关、入口与兼容清单。
3. [Documentation index](./docs/README.md) — 文档状态和权威顺序。
4. [Product](./docs/PRODUCT.md) — 定位、对象、导航、冻结规则与非目标。
5. [User Flow](./docs/USER_FLOW.md) — 当前完整交互逻辑。
6. [Roadmap](./docs/ROADMAP.md) — 当前实施顺序和进入下一阶段的门槛。

实现状态以当前代码、Schema、OpenAPI 和可复现测试结果为准。带日期的历史测试或
发布记录不能替代当前验证。

## Local development

Requirements:

- Node.js 22+
- npm
- Xcode 26+
- 本地或隔离 PostgreSQL 测试数据库

```sh
npm install
npm run db:start
npm run prisma:generate
npm run dev
```

常用检查：

```sh
npm run lint
npx tsc --noEmit --incremental false
npm run test:v2
npm run test:openapi:v1
npm run check:openapi:v1
```

原生工程：

```sh
ios-native/scripts/generate-openapi-client.sh
ios-native/scripts/generate-project.sh
```

详细构建方式见 [Native iOS](./docs/IOS.md)。

## Deployment and release

生产数据库迁移、Vercel Production 部署、远程通知、签名和 TestFlight 上传都是
明确的发布操作，必须针对本次目标获得授权，并记录实际环境与结果。不要依赖普通
Preview 或本地构建隐式迁移共享数据库。

- 发布与生产配置：[Release](./docs/RELEASE.md)
- 隐私申报：[Privacy](./docs/PRIVACY.md)

任何凭据、数据库 URL、APNs 私钥、Sentry Token 或测试账号密码都不得写入仓库。
