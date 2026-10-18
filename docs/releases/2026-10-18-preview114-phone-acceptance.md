# Preview 114 首次计划真机补验

2026-10-18，Europe/Berlin。用户要求重试后，默认 iPhone 14 Plus 的 XCTest 已恢复，
首次使用计划页的连续真实流程通过；本轮没有产品或后端更新，手机继续为 Preview **114**。

| 层面 | 实际结果 |
| --- | --- |
| 产品源码 | `51c98e9b16676e85047d427b70f1d91e9e68e2e1`，已推送；本轮在 `c2e50fb` 基线上仅修正测试定位和补充 QA 证据 |
| 真机完整流程 | 1 项通过，0 失败、0 跳过，108.654 秒；真实登录、正式 API、原生及 Safari，16 张流程截图 |
| 真机创建/取消 | 1 项通过，0 失败、0 跳过；连续三次创建取消回到一级计划页 |
| 数据断言 | 发起人/游客精确保存；INVITING 为 1/2、日历 0 条；CONFIRMED 为 2/2、日历唯一一条、实际 1 小时 |
| 后端 | 沿用 `dpl_BerFn2d4wg2VPbtCxFN5WUQA217g`；没有新部署、Schema 或迁移 |
| 最终手机 | 默认 UDID `00008110-001A69110CC1401E`，iPhone 14 Plus / iOS 26.6.1；严格签名校验，同一 Preview 114 重新安装，普通启动 PID 841 已在进程表核验 |
| 清理 | 五次流程尝试的 5 个专用账号及 5 个计划全部回收；旧令牌 401、链接 404；runner 卸载，私有账号和 xctestrun 删除 |
| 原有安装 | 普通 SideSeat `app.sideseat.mobile / 1.0.0 (97)` 保留，没有 TestFlight/App Store 上传 |

本次连续验证：空白计划首页 → 选择时间还没定 → 创建并填写 → 系统分享及复制链接 →
Safari 使用实际复制链接输入游客名字并保存 → 返回 App 选择 09:00–10:00 发送邀请 →
同一游客确认 → 原生 2/2 确认 → 查看日历 → 搜索标题 → 日历详情 → 管理同一计划。
普通启动携带 `sideseat://plans`，不含测试参数或 QA 环境变量，保留手机原登录。

测试使用全新账号的首次计划页，跳过通用 App 教程；原生英文浅色、Safari 中文。
不包含 Apple 系统日历授权流程，也不替代其他业务回归。此前的四次失败是测试脚本对 iOS 分享 Cell、
底层同名图片、系统粘贴授权归属及网页保存文案的错误假设；均已修正，并通过完整连续重跑。
没有发现新的产品阻塞缺陷，因此保持已交付版本 114。

[完整 QA、首次失败和截图](../qa/2026-10-18-first-plan-phone-followup.md)、
[最终 UI 结果](../qa/evidence/2026-10-18-first-plan-phone/journey-final.json)、
[五阶段 API](../qa/evidence/2026-10-18-first-plan-phone/journey-final-api.json)、
[数据清理](../qa/evidence/2026-10-18-first-plan-phone/journey-final-cleanup.json)、
[最终手机回执](../qa/evidence/2026-10-18-first-plan-phone/device-accepted-final.json)。
