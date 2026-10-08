# 消息列表去掉置顶图钉（2026-10-02）

仅删除置顶会话名称旁的图钉，保留置顶优先排序、背景、辅助功能状态及侧滑／长按菜单操作。

既有 `testMessagesPinnedSurfaceAndRequestEntry` 通过，在浅色和深色模式下检查取消／恢复置顶及等待回复入口；两张模拟器截图已检查，置顶行不再显示图钉。

测试结果：`/tmp/sideseat-personalization-derived/Logs/Test/Test-SideSeat-Development-2026.10.02_16-00-34-+0200.xcresult`。本轮使用隔离测试数据，未写入正式消息或发布后端。

[截图](./evidence/2026-10-02-inbox-no-pin/)。
