# 分享时间表桌面周视图 — 2026-10-15–16

电脑打开分享链接时，页面现在会优先把空间留给时间表：1024px 起使用更宽的页面和
224px 参与者栏，常见电脑宽度可完整显示一周七天，减少左右滑动。个人选时与大家的
结果都适用。手机继续使用原来的布局、时间格大小、滑动、点按和长按拖选。
原分享链接刷新即可使用，无需重装 App。超过一周的计划仍可横向查看。

- 源码 `393fc66c22d08ebb86d78daa670c11987ac5870b` 已提交并推送
  `codex/ios-uxui-20260922`。
- 正式 **Ready**：`dpl_6JpdrfEay16wvWzMnzPT5o3zxEPF`，
  [部署](https://sideseat-5iu4i65d1-baichus-projects.vercel.app)。候选验证后 promote 同一构建，
  2026-10-16 00:01 CEST 已核验 www/API 两域名及公开入口。
- Chromium/WebKit 在本地、候选、正式页面各完成 56 项中英文布局检查；
  1024/1280/1440/1920px 均完整显示七天，320/390px 手机宽度和 768px 布局保留。
  第七天全选、撤销、鼠标跨七天拖选通过；TypeScript、相关 ESLint 通过。
- 布局检查使用浏览器内虚拟计划响应，没有生产业务写入；本次没有重复真机或真实业务
  全流程验收。[此前 Safari/Preview/确认/日历证据](../qa/2026-10-15-unified-share-ui.md)保留。
- 从上一真实生产的 1,339 项源码重建，保留 1,338 项原内容，单个页面覆盖加来源记录；
  最终上传 1,340 项 SHA-1 全匹配。API、Schema、手势文件不改，数据库迁移显式跳过。
  上一生产 `dpl_Eq19xTZsKQCckjdv8Py6x94E2jtS` 保留为恢复点。
- 手机仍为 **SideSeat Preview 1.0.0 (105)**，原生源码 `f508e64`。
  本次没有原生构建/安装或 TestFlight/App Store 上传，普通 SideSeat 97 保留。

[验收、测量及截图](../qa/2026-10-15-desktop-week-view.md)。
