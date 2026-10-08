# 消息页分区与置顶背景（2026-10-02）

## 修改

- 等待回复移至消息页右上角入口，显示招呼总数。主列表只显示正式聊天，不再在置顶前展开全部招呼。
- 点击入口进入独立列表，按“待我回复”“等待对方”分组，各组显示数量；搜索与主聊天列表独立。
- 回复沿用原来的聊天通道；忽略后返回等待列表并更新入口数量。只有收到的待回复招呼继续计入消息未读提醒。
- 置顶行增加自适应蓝灰背景和图钉，取消置顶后恢复普通背景。没有正式聊天时仍有前往同行或等待回复的有效入口。

## 验证

10 项逻辑检查、3 项 UI 流程通过：

- InboxStoreTests 9 项：收件箱加载、搜索、未读数、置顶及缓存等相关回归。
- NavigationTests.messageRequestsRoute 1 项：新入口归属消息导航栈。
- testIncomingOpportunityMessageReplyAndIgnore：主列表无展开招呼；入口数量为 1；进入“待我回复”，忽略后为空且入口为 0；回复进入正式聊天并能查看意愿。
- testMessagesPinnedSurfaceAndRequestEntry：浅色、深色模式下的背景／图钉、取消与恢复置顶、等待回复入口。截图已人工式视觉检查。
- testOpportunityBookmarkAndSendMessage：收藏 → 打招呼 → 聊天 → 返回 → 消息入口 →“等待对方”→ 再次查看原消息。

模拟器：iPhone 13 mini / iOS 26.5，使用隔离 fixture，无正式消息或数据写入。

原始结果：`/tmp/sideseat-message-sections-r1.xcresult` 和 `/tmp/sideseat-message-navigation.xcresult`。
第一轮单函数筛选未匹配 Swift Testing 方法，随后使用带括号的标识单独运行导航测试并通过。

## 手机 Preview

并行的“完善个人资料展示样式”任务已构建、签名、安装和启动 Preview 71。本轮核对其冻结源码：8 个相关文件中 7 个与本轮测试代码完全一致，ChatsRootView 仅空页面按钮的辅助测试标识不同（Preview 为 `inbox-empty-action`，工作区保留原有 `inbox-open-together` 并为等待入口使用 `inbox-open-requests`）；界面和业务行为一致。本轮复用已安装版本，无重复构建或安装。

本轮真机验证限构建记录、安装回执、版本与启动；交互测试在模拟器完成。不代表并行个人资料功能或其后端已验收。本轮未推送 Git、部署后端或变更数据库。

[截图、源码比对和安装证据](./evidence/2026-10-02-message-sections/)。
