# 新招呼连续列表（2026-10-02）

移除新招呼内部「待我回复／等待对方」分组标题、计数及分组留白。保留顶部「新招呼」导航标题，按既有数据顺序显示连续列表，并沿用主聊天列表的头像、文字和细分隔线样式。

两项既有 UI 测试通过（2 项，0 失败）：`testMessagesPinnedSurfaceAndRequestEntry`（浅色／深色及置顶流程）和 `testIncomingOpportunityMessageReplyAndIgnore`（忽略后空列表、回复后进入正常聊天及查看意愿）。既有测试中依赖旧标题的等待条件已改为列表标识。浅色和深色截图已检查，旧分组标题均不再显示。

测试结果：`/tmp/sideseat-personalization-derived/Logs/Test/Test-SideSeat-Development-2026.10.02_16-53-26-+0200.xcresult`。使用隔离 fixture，未操作真实招呼。

[截图](./evidence/2026-10-02-greetings-no-headings/)。
