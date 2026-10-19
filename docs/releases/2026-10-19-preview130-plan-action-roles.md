# Preview 130 计划按钮作用分层

按实际效果区分按钮：创建/发送/明确确认使用实心与功能图标，选时/核对名单和分享使用描边，复制保留完整文字与反馈，查看/日历用轻入口与箭头，无法参加使用红色叉号。紧凑卡片、横向等待及既有 flow/数据规则保留。

- 来源：按钮 `de7efa96`，最终大字号修正 **`cfd866ddfc61a436c6834623087f575937016888`**，均已推送当前分支。
- 手机：默认 iPhone 14 Plus，Preview **130**；严格签名、安装、普通启动 PID **1932** 核验；QA runner 移除，普通 SideSeat 97 保留。
- 验证：6 项界面回归通过；修正后的原生完整流程 **265.864 秒 / 12 API 阶段**，Safari **153.328 秒 / 8 阶段**，已确认日程补验 **16.279 秒**通过。
- 初轮 2 项失败已分别修正大字号底栏/滚动检查与依赖顺序，原始记录保留；5 个临时账号、3 个计划/链接均已回收。
- 本轮仅原生更新，无后端/网页/Schema/迁移发布；既有部署 `dpl_6kZ6PYg8h4FUUxDxXwvBXYkVirRn`。未上传 TestFlight / App Store。

[选时、分享与复制实际画面](../qa/evidence/2026-10-19-plans130/phone-first-plan-action-choose-share-copy.png)、[确认参加与其他回复](../qa/evidence/2026-10-19-plans130/shared-plan-117-chat-explicit-confirmation.png)、[完整 QA](../qa/2026-10-19-plans130.md)、[设备回执](../qa/evidence/2026-10-19-plans130/device-final.json)。
