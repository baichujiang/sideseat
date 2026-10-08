# 连续消息列表（2026-10-02）

消息主列表取消“置顶”“最近”标题和两个分组之间的留白，改为同一列表按置顶、普通聊天顺序排列。保留浅色／深色的置顶背景、图钉和现有等待回复入口。

复用现有 `testMessagesPinnedSurfaceAndRequestEntry`，在 iPhone 13 mini / iOS 26.5 模拟器验证浅色、深色、取消／恢复置顶和等待回复入口，测试通过。两张截图已检查：无分组标题或分组空隙，置顶聊天仍在顶部。

结果：`/tmp/sideseat-continuous-inbox.xcresult`。[截图和源码记录](./evidence/2026-10-02-continuous-inbox/)。

复用并行个人资料任务构建的 Preview 72，已核对该包冻结的 ChatsRootView、InboxStore、SideSeatTheme 与本次验收版本完全一致。验证该包的版本、API、签名、设备授权以及 288 个冻结文件哈希后，本轮安装到配对 iPhone，确认版本 1.0.0 (72) 并成功启动。真机验证限安装、版本和启动；本轮交互在模拟器 fixture 上验证。
