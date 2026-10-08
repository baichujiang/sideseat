# 新招呼入口（2026-10-02）

“等待回复”入口改名为“新招呼”：搜索下方靠左显示蓝色挥手图标，名称在下，数量角标在右上；去掉原来的整行灰底与箭头。入口页标题和空状态文案同步更新为中文、英文及德文。内部继续区分收到和发出的招呼。

保留连续聊天列表、置顶排序及背景、现有细分隔线；不改变消息/API 或底栏未读计数规则。入口角标仍是当前收到和发出的招呼总数。

## 验证

- 隔离 iPhone 13 mini 模拟器、iOS 26.5，中文 fixture 数据。
- `testMessagesPinnedSurfaceAndRequestEntry`：浅色/深色外观、置顶与取消置顶、入口跳转通过。
- `testIncomingOpportunityMessageReplyAndIgnore`：查看收到的招呼、忽略后空状态及入口数量归零、回复后进入正式聊天和查看意愿详情通过。
- 两项测试最终 0 失败；原始结果 `/tmp/sideseat-greeting-tile-r3.xcresult`。
- 初轮发现 SwiftUI 列表生成的无障碍包装区域与实际按钮点击区域不一致。改为原生整行按钮，移除额外无障碍包装，复测通过。
- 三种语言资源的 `plutil -lint` 和本次文件的 `git diff --check` 通过。
- 已人工查看以下测试截图，图标、角标和文字在浅/深色均完整，入口页标题显示“新招呼”。

[浅色](evidence/2026-10-02-greeting-tile/messages-pinned-light-zh.png) · [深色](evidence/2026-10-02-greeting-tile/messages-pinned-dark-zh.png) · [新招呼列表](evidence/2026-10-02-greeting-tile/message-requests-incoming-zh.png)

以上交互测试使用 fixture，不代表线上双用户消息链路或 VoiceOver 手动审查。
