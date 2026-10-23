# 分享计划弹窗层级与字号 — Preview 197

将原来同级列表入口调整为计划摘要、App 好友导航行、网页工具区。活动名支持完整换行；已有最终时段仍展示原时间摘要。App 好友复用 `SSManagementRow`，以副文说明选择联系人发送卡片，箭头表示进入选择页。网页分享与复制复用 `SSActionButtonStyle`，普通字号等宽并排、辅助字号全宽纵排。复制在原按钮反馈，不新增提示弹框。使用共用分组背景、内容面、间距和轮廓；辅助字号默认大尺寸，内容自然滚动。

未改变 owner＋有效 COLLECTING／INVITING／CONFIRMED 联系人入口条件、ShareLink／剪贴板 URL、联系人选择及发送／幂等、发送后加载和两处刷新通知。没有微信接入、新状态、业务组件或请求；没有改联系人选择器、共享网页或兼容入口。

## 首轮发现与修正

第一轮 **53.084 秒失败**：辅助字号应纵排，实际仍并排。实际视频末帧证实详情页已是最大字号，但从标题右侧打开的分享 sheet 没收到该字号。`PlanShareActions` 增加读取并显式传递 `dynamicTypeSize`，与创建后的分享入口保持一致；未放宽测试断言。

[首轮结果](./evidence/2026-10-24-plan-share197/layout-initial-summary.json)、[实际末帧](./evidence/2026-10-24-plan-share197/initial-largest-missing-environment.png)、[首轮包来源](./evidence/2026-10-24-plan-share197/native-build-initial-manifest.json)。

第二轮 **99.662 秒失败**：前三个语言／字号组合完成；最大德文长标题三行、联系人说明四行，复制按钮底部在首屏外，测试仍要求所有按钮同时完整位于首屏（935.33pt > 914pt）。实际图没有横向溢出或文字越框。产品保留 ScrollView；仅调整测试查看方式，逐项滚动到按钮整块进入真实视口后，仍严格检查可点击、44pt、上下边界、文字内边距、不重叠和排列，同时保留最大字号顶部／底部截图。此轮不能记为四组合通过。

[第二轮结果](./evidence/2026-10-24-plan-share197/layout-second-summary.json)、[最大德文首屏](./evidence/2026-10-24-plan-share197/second-largest-de-scroll-required.png)。字号修正后的产品没有因该视口断言再改动。


## 最终实际验收

最终相同产品包的中德文普通／最大字号四组合 **167.055 秒通过**：三个动作均逐项完整进入真实视口、可点击且至少 44pt，文字与轮廓保持内边距；普通字号二列、辅助字号纵排，无重叠。实际执行复制反馈、一次系统分享→系统复制返回、联系人页打开／空选发送禁用／取消返回，以及关闭分享。此大字号验收限定分享弹窗，不替代详情时间格或创建时段菜单的旧问题验收。

[最终四组合结果](./evidence/2026-10-24-plan-share197/layout-summary.json)。[中文普通](./evidence/2026-10-24-plan-share197/share-sheet-layout-regular-zh-Hans.png)、[德文普通](./evidence/2026-10-24-plan-share197/share-sheet-layout-regular-de.png)、[中文最大顶部](./evidence/2026-10-24-plan-share197/share-sheet-largest-top-zh-Hans.png)、[中文最大底部](./evidence/2026-10-24-plan-share197/share-sheet-largest-bottom-zh-Hans.png)、[德文最大顶部](./evidence/2026-10-24-plan-share197/share-sheet-largest-top-de.png)、[德文最大底部](./evidence/2026-10-24-plan-share197/share-sheet-largest-bottom-de.png)、[德文复制成功](./evidence/2026-10-24-plan-share197/share-sheet-copied-largest-de.png)。实际七张逐一复核：最大德文滚动后整个复制按钮和文字完整，反馈仍在原边界内。系统 AssistiveTouch 浮球不是 App 布局。

同一最终产品包的完整 App 好友流程 **373.351 秒通过**：原生创建后立即打开分享、联系人投递与重复防护、双方明确提交、最终时段取消／拖选／跨天草稿、邀请名单与正式邀请、参与者接受、发起人发布、双方精确且各一条日历。Mac 只准备专用联系人并读 API，产品操作由手机完成；**8 阶段 API 通过**，计划卡片始终一条，最终日历各一条。六次真实打开分享弹窗检查 owner／participant × COLLECTING／INVITING／CONFIRMED：owner 有联系人，participant 无联系人，双方均有网页分享和复制。检查没有只在关闭的 sheet 外查询按钮。

[完整流程结果](./evidence/2026-10-24-plan-share197/phone-summary.json)、[8 阶段 API](./evidence/2026-10-24-plan-share197/share197-api.json)。[发起人收集](./evidence/2026-10-24-plan-share197/share-permissions-owner-COLLECTING.png)、[参与者收集](./evidence/2026-10-24-plan-share197/share-permissions-participant-COLLECTING.png)、[发起人邀请](./evidence/2026-10-24-plan-share197/share-permissions-owner-INVITING.png)、[参与者邀请](./evidence/2026-10-24-plan-share197/share-permissions-participant-INVITING.png)、[发起人确定](./evidence/2026-10-24-plan-share197/share-permissions-owner-CONFIRMED.png)、[参与者确定](./evidence/2026-10-24-plan-share197/share-permissions-participant-CONFIRMED.png)。六张实际逐一复核，正式阶段四图的跨天摘要完整显示 2026/10/25 23:00–10/26 01:00，未省略或裁切；这是普通中文实图，未把它说成最大字号最终摘要验收。

## 精简与交付

源码 **`0cc265c5fdfb86431f5b3a78a7ad0fa37b89f8bb` 已提交并推送**。复用已有管理行／动作样式，只有一个局部图文标签 helper；不新增状态、全局组件、依赖或请求，没有为同一数据另建分享模型。权限与 payload 静态复查通过；最终字号修正后产品未因测试查看方式再变化。完整流程和第一轮布局测试使用的测试源码 hash，与最后视口修正后布局测试 hash 分别记录，没有混称同一测试文件版本。

[构建来源](./evidence/2026-10-24-plan-share197/native-build-manifest.json)：隔离生成工程复用，所有输入从活跃工作区同步；248 App／18 配置脚本／共享日历资源逐字节一致，私密 Local 配置另行相等核验，严格签名通过，`app.sideseat.mobile.preview`／197。没有使用冻结归档或把隔离目录当成活跃开发目录。

[手机核验](./evidence/2026-10-24-plan-share197/device-verification.json)：默认 iPhone 14 Plus／iPhone (4)，UDID `00008110-001A69110CC1401E`，iOS 26.6.1；197 安装、无测试参数普通启动 **PID 7721**与进程一致，普通 **97** 保留。阶段内无新增 App 崩溃或资源报告。[清理记录](./evidence/2026-10-24-plan-share197/share197-cleanup.json)：两专用账号／两链接清理并验证 401／404；Runner、私密夹具／xctestrun／设备 JSON 已清理，原始日志 0600、结果及附件目录 0700。用户数据及钥匙串未删除。

无后端、网页、Schema 或迁移发布；[api/www 重验](./evidence/2026-10-24-plan-share197/production-status.json)仍 Ready `dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7`，本轮真实流程验证对应 API 入口，未声称审计全部全局开关。没有重复单元／领域／浏览器或活动提议完整链路。旧长菜单滚动回顶原因／手动影响、德文详情最大字号空白未修改或重新验收。无关 `tsconfig.json` 工作保留且未提交。
