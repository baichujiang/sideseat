# 新招呼与主聊天列表统一（2026-10-02）

新招呼使用与主聊天列表相同的 44 pt 头像、12 pt 图文间隔、姓名／摘要字体、2 pt 内容上下内边距及最小行高。时间显示在右上方，去除旧的右侧箭头。

两个列表共用 `InboxListRowStyle`，关闭系统分隔线，使用从文字列起至右侧边缘的单物理像素细线及相同浅色／深色颜色。招呼列表同时隐藏系统分区边界线，保留「待我回复／等待对方」分组，统一搜索栏背景及底部滚动留白。

两项既有 UI 测试通过：`testMessagesPinnedSurfaceAndRequestEntry`（浅色／深色及置顶流程）和 `testIncomingOpportunityMessageReplyAndIgnore`（忽略后返回列表、回复后进入正常聊天及查看意愿）。浅色和深色截图已检查，头像与文字对齐，分隔线无重复绘制。

测试结果：`/tmp/sideseat-personalization-derived/Logs/Test/Test-SideSeat-Development-2026.10.02_16-45-55-+0200.xcresult`。使用隔离 fixture，未操作真实招呼或部署后端。

[截图](./evidence/2026-10-02-greetings-layout/)。
