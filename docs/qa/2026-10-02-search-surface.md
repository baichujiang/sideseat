# 消息搜索栏进场背景（2026-10-02）

录屏复现系统导航搜索抽屉在页面进入时先显示文字、随后才绘制圆角底框。修复将消息和新招呼的搜索框放在页面顶部安全区内，两页共用同步绘制的胶囊底色、边框和阴影；输入使用原生 UISearchTextField，保留原生清空按钮、搜索无障碍语义和键盘操作。取消操作清空筛选并收起键盘。

消息页外层使用稳定的 ZStack，加载、失败和列表之间的切换不再替换搜索栏所在容器。新招呼的列表标识只作用于列表，避免覆盖搜索框的无障碍标识。

## 验证

- 录屏逐帧检查：修复后从日历切入消息，以及从消息进入新招呼时，底框和搜索文字同时进入画面。进场后没有额外补画底框的阶段。证据按 0.125 秒采样。
- 浅色、深色列表截图已检查。
- 3 项 UI 测试，0 失败：`testMessageSearchCanRecoverFromNoMatchesInOneTap`、`testMessageSearchSurfacesFilterClearAndCancel`、`testMessagesPinnedSurfaceAndRequestEntry`。覆盖姓名筛选、无匹配恢复、原生清空、取消及键盘收起、消息／招呼往返和原有置顶操作。
- 测试结果：`/tmp/sideseat-personalization-derived/Logs/Test/Test-SideSeat-Development-2026.10.02_17-07-04-+0200.xcresult`。
- 测试使用隔离 fixture，未访问真实招呼或发布后端。

[截图与进场逐帧证据](./evidence/2026-10-02-search-surface/)。原始录屏和日志位于 `/tmp/sideseat-search-surface-20261002/`。
