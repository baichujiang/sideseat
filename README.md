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
- **Plans**：从「发起计划」直接填写活动、地点和时间，创建后在时间表填写空闲或直接选最终时间生成正式邀请，朋友逐人确认到日历；
  活动还没想好或时间已经确定时，在同表单使用次要入口。已有计划按需要你处理和等待其他人分区，保留聊天计划与结束反馈。
- **Calendar**：个人日程、课程、确认后的 Plan、搜索以及 Apple Calendar 互操作。
- **Messages**：招呼与回复、持续聊天，以及 Plan 提议、接受、改期与取消。
- **Me**：完整基本资料、学生认证、课程、语言、主题/图标/个人展示样式、隐私、安全和设置。

当前安装、生产部署、开关与实际入口见 [已部署功能清单](./docs/DEPLOYED_STATE.md)。
Preview **156** 已安装到默认 iPhone 14 Plus：「让朋友提议活动」和「时间已定」可同时开启，保留全部输入；选定活动后再发正式邀请，App 和网页共用已定时段展示。真实双账号完整流程、七阶段 API、组合切换及深色大字号复验见[当前交付与截图](./docs/releases/2026-10-20-preview156-fixed-time-activity-ideas.md)。

此前 Preview **155** 已安装到默认 iPhone 14 Plus：「让朋友提议活动」改为原表单中的勾选项，勾选/取消保留全部输入，底部统一「发起计划」。5 项真机用例、两种状态实际创建及 API 核对通过，普通启动 PID 3958；本轮无后端/网页发布。[当前交付与截图](./docs/releases/2026-10-20-preview155-friend-suggestion-checkbox.md)。
此前 Preview **154** 已安装到默认 iPhone 14 Plus：名称、地点、日期、时区按左右同排收进一组；昵称、参与状态、邀请复核与调整入口一起收紧，长内容及辅助功能字号自动纵排。最终 3 项真机、9 个真实 API 阶段通过，普通启动 PID 3920；本轮仅改原生布局。[当前交付与截图](./docs/releases/2026-10-20-preview154-compact-plan-editors.md)。
此前 Preview **153** 已安装到默认 iPhone 14 Plus：共同计划详情明确区分活动信息、个人昵称、时间表与当前操作；活动建议在标题下原位展开，最终选时与核对邀请保留草稿和返回选择。分享汇总 App 联系人、网页链接与复制，取消/删除采用明确的双选确认。42 项单元、3 项最终真机及 9 个真实 API 阶段通过，普通启动 PID 3874；后端已上线。[当前交付与验证范围](./docs/releases/2026-10-20-preview153-plan-detail-hierarchy.md)。
此前 Preview **152** 已安装到默认 iPhone 14 Plus：发起计划后直接选择 App 联系人发送计划卡片，朋友从私聊或计划列表填写空闲、查看最终邀请并明确确认。最终双账号完整流程 165.526 秒、8 个真实 API 阶段和深色最大字号复验通过；后端同一候选提升正式，普通启动 PID 3802 核验。[当前交付与验证范围](./docs/releases/2026-10-20-preview152-app-contact-plans.md)。

此前 Preview **151**：计划首页只保留「发起计划」，移除手动打开链接按钮、粘贴弹窗及相关引导。App 已收到的计划从卡片/聊天邀请/通知进入，网页分享保留。6 项真机界面检查通过，普通启动 PID 3744 核验；该阶段无后端或网页发布，未重跑真实 API 完整流程或实际通知投递。[151 交付与验证范围](./docs/releases/2026-10-20-preview151-native-plan-entry.md)。

Preview **150**：恢复与同行等主页面相同的固定品牌抬头，历史移到右上角；两个分栏、底色和间距与同行统一，内容在下方独立滚动。8 项真机界面及长列表实际滚动补验通过，普通启动 PID 3689 核验。本轮无网页或后端发布，未重跑真实 API 完整流程。[当前交付与验证范围](./docs/releases/2026-10-20-preview150-plans-heading.md)。

Preview **149**：计划卡片彩色标题区只保留活动名称和插画，时间、参与人、进度与操作在下方保留。5 项真机界面检查、三类截图和深色最大字号复核通过，普通启动 PID 3666 核验；本轮仅改原生呈现，未重跑真实 API 完整流程，无后端或网页发布。[当前交付与验证范围](./docs/releases/2026-10-20-preview149-plan-title-only.md)。

Preview **148**：计划首页改为「筹划中 / 已确定」两个分栏，移除顶部导航栏，创建/打开链接放入页内，历史使用时钟入口。20 项单元、12 项真机界面、353.061 秒双账号完整流程及 13 个 API 阶段、3 项最终历史/分栏复验通过；无后端或网页发布。[当前交付与验证范围](./docs/releases/2026-10-20-preview148-two-plan-tabs.md)。

Preview **147**：首次读取期间显示统一加载状态，修复提前显示空计划布局的闪屏；清理旧宣传文案、无调用引导/分区与欢迎图片。11 项真机界面回归通过，最终清理包复验慢加载和横向分区；当时无后端或网页发布。[147 交付与验证范围](./docs/releases/2026-10-20-preview147-plan-loading-cleanup.md)。

Preview **146**：移除无计划时的欢迎式介绍，直接显示「发起计划」和「打开计划链接」。4 项真机界面检查及普通启动通过；本轮无后端或网页发布。[146 交付与验证范围](./docs/releases/2026-10-20-preview146-direct-plans-entry.md)。

Preview **145**：发起人可随时正式发出，只通知已接受的人并同步日历，无需等齐回复；App/网页和三条真机完整流程通过，Apple 接收两条实际 Preview 通知。[145 交付与完整验证](./docs/releases/2026-10-20-preview145-organizer-publish.md)。

此前 Preview **144** 已安装到默认 iPhone 14 Plus：三类计划摘要使用「同行」同款活动色带、插画、圆角和轻阴影，保留待处理纵向、等待他人横向及紧凑内容。16 项单元、8 项真机界面检查、316.740 秒原生完整流程与 12 个 API 阶段通过；4 个临时账号、5 个计划/链接清理，普通启动 PID 3397 核验。本轮无网页或后端发布。[当前交付与真机效果](./docs/releases/2026-10-20-preview144-plan-card-style.md)。

Preview **143**：修复最终选时第三次点击覆盖前面选择的问题；同一天继续点选会延长连续时段，区内点击保留选择，重选操作放在固定底栏。25 项原生、13 项领域与正式网页 32 项检查通过；311.998 秒 App、194.446 秒 App/Safari 完整真机及 20 个 API 阶段通过。普通启动 PID 3339 核验，测试账号/计划清理，正式网页与后端保留原部署。[143 交付与范围](./docs/releases/2026-10-20-preview143-final-time-selection.md)。

Preview **142**：空闲改为手动提交、本地草稿恢复和仅统计已提交答复；有草稿时继续刷新朋友和正式邀请，不阻止最终选时或发送。五项已按序验收，23 项原生与 13 项领域测试、候选/正式各 56 项网页检查通过；164.024 秒 App/Safari、306.047 秒 App 双账号完整真机和 20 个 API 阶段通过，正式分享网页已更新，测试数据清理。[142 交付与范围](./docs/releases/2026-10-20-preview142-manual-availability.md)。
Preview **136** 历史版本：App 和分享网页点选立即高亮，停止点按 700 毫秒后合并保存；慢请求期间保留最新选择，离开/后台提前提交，失败保留并可重试。网页去除重复读取，重复快照跳过写入。源码 `ab5ba6f7` 已推送；18 项原生、13 项领域、候选/正式各 32 项浏览器检查，以及 300.021 秒 App 双账号与 168.116 秒 App/Safari 完整真机流程通过，20 个 API 阶段核对通过。默认 iPhone 14 Plus 普通启动 PID 2890；[交付与实测](./docs/releases/2026-10-20-preview136-coalesced-autosave.md)。
Preview **135**：无需先有朋友填写，发起人可在时间表选定最终时间、核对人数并生成正式邀请链接；朋友在 App 或网页直接确认参加。已填写名单的邀请方式保留，链接加人需明确开启。最终原生 `ebef28c9`、API `d00c7668` 已推送；13 项领域测试、候选/正式各 22 项浏览器检查、103.879 秒直接邀请及 297.853 秒原征集完整真机流程、7+12 个 API 阶段通过。默认 iPhone 14 Plus 普通启动 PID 2839，测试数据已清理。[交付与真机步骤](./docs/releases/2026-10-20-preview135-direct-invitation.md)。
Preview **134**：首屏用原创照片和具体文案解释用途，保留一个主要创建入口；已有计划加入活动主题图、真实发起人和参与者头像，待处理纵向、等待他人横向，操作样式区分确认与填写。原生来源 `021ea76d`、只读 API 来源 `9eec0d95` 已推送；41 项单元、13 项真机界面、301.862 秒完整真机流程及 12 个 API 阶段、候选/正式各 16 项浏览器检查通过。默认 iPhone 14 Plus 普通启动 PID 2754；分享网页保留 133 外观与原流程。[首版交付与真机截图](./docs/releases/2026-10-19-preview134-social-plan-home.md)。
Preview **133**：活动建议与时间表合在同一页，添加建议原位输入；发起人先选时，再在一个复核页确定活动和名单。仅表达兴趣不会替代填写空闲，原横向分区及明确确认规则保留。41 项单元、7 项创建/布局真机、普通 303.126 秒与活动 App/Safari 344.053 秒完整流程、12+13 个 API 阶段，以及候选/正式各 10 项浏览器检查通过。默认手机当时普通启动 PID 2560，正式分享网页更新。[融合交付与验收](./docs/releases/2026-10-19-preview133-integrated-planning.md)。
Preview **132**：创建改成默认单表单，输入活动/地点/时间后直接生成时间表；移除顶部分流与强制下一步，活动提议和固定时间邀请作为次要入口原位展开。6 项最终创建界面、320.250 秒默认流程/12 API 阶段、240.896 秒活动流程/14 阶段通过，默认手机普通启动 PID 2433。[本次交付与截图](./docs/releases/2026-10-19-preview132-default-plan-flow.md)。
Preview 131：新增「一起选活动」起点，主题 → 大家提议/感兴趣 → 发起人定活动 → 同一时间表约时间 → 邀请确认 → 日历；分享网页同步上线。40 项单元、13 项 API 契约、12 项真机界面、新流程 241.239 秒/14 API 阶段及原流程 269.367 秒/12 阶段通过；默认 iPhone 14 Plus 已普通启动 PID 2327。[本次交付与截图](./docs/releases/2026-10-19-preview131-activity-ideas.md)。
Preview 129：三组信息的紧凑卡片，活动/个人状态同排，等待摘要直接说明正在等谁，即将开始使用小型日期块。标准样例高度约 111/97/94pt，双行标题约 132pt；6 项真机界面回归通过，默认手机普通启动 PID 1862 已核验。[实际截图与交付](./docs/releases/2026-10-19-preview129-compact-plan-cards.md)。本轮未重跑 127 的真实完整链路。
Preview 128：保留三类卡片与横向分区，减轻按钮/底色、统一文字层级和日期对齐；标准样例高度为待处理 156pt、等待 142pt、即将开始 111pt。5 项真机界面回归通过；默认手机安装/普通启动 PID 1840 已核验。[视觉精修与截图](./docs/releases/2026-10-19-preview128-plan-card-polish.md)。本轮没有重跑下方 127 的真实完整链路。
Preview 127：待处理为独立任务卡，等待其他人为较轻的横向进度摘要，即将开始突出日期时间；状态按用户任务表达，入口统一进入原详情复核。28 项单元、8 项最终真机、两条完整链路（259.921 秒原生 / 154.251 秒 Safari）及 12+8 个 API 阶段通过，默认 iPhone 14 Plus 安装/普通启动 PID 1826 已核验。[交付与截图](./docs/releases/2026-10-19-preview127-plan-card-hierarchy.md)。
Preview 126：计划详情以时间表为核心，活动/状态平面展示，确认进度在表下方，完整名单按需展开；底部突出当前阶段操作，复制链接为次要图标。25 项单元、原生 263.027 秒与 Safari 150.573 秒两条完整真机、47.175 秒首页回归及 12+8 阶段 API 通过。默认手机已安装，普通启动 PID 1741 核验；[详情交付与截图](./docs/releases/2026-10-19-preview126-timetable-detail.md)。
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
多人时间征集位于「计划 → 发起计划 → 填写活动 → 创建时间表」；「让朋友提议」是同页次要入口。聊天中的「智能约时间」是个人日历空档推荐。

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
