# 消息列表分隔线（2026-10-02）

参考[公开微信聊天列表截图](https://www.mydown.com/tools/132/725754132.shtml)中避开头像、从文字列开始、延伸至右侧边缘的低对比度分隔线。该图用于视觉参考，不作为当前微信版本的精确规格。

Sideseat 使用 1 个物理像素的底部分隔线，左侧缩进为 16 pt 行边距 + 44 pt 头像 + 12 pt 间距，右侧到行边缘。浅色为 `#EAEAEA`，深色为 `#2C2C2C`。关闭原生行分隔线，避免重复绘制。置顶背景、行内容及操作保持现有行为。

既有 `testMessagesPinnedSurfaceAndRequestEntry` 通过，覆盖浅色／深色、取消／恢复置顶和等待回复入口。两张模拟器截图已检查，确认线条对齐、右侧没有留白且无双线。

测试结果：`/tmp/sideseat-personalization-derived/Logs/Test/Test-SideSeat-Development-2026.10.02_16-07-39-+0200.xcresult`。本轮使用隔离测试数据，未写入正式消息或发布后端。

[截图](./evidence/2026-10-02-inbox-separators/)。
