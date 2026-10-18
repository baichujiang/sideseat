# Preview 113：计划通知、保存和过期收尾

2026-10-18，Europe/Berlin。核心修复源码 `a994557a5555dabf3c7fc1720c57ee02112c429f`、网页文案修正 `caa3e7d1a9f855b161ce7422732b12196790f973`
已提交并推送至 `codex/ios-uxui-20260922`。起始基线 `2420e51`。
本批修复计划审计中三个优先问题；[完整验证说明](../qa/2026-10-18-plans113.md)。

通知按照实际 `INVITED` 状态生成，升级补回曾漏掉的邀请且保留已读；迟到刷新不再覆盖
已保存选时、编辑昵称或取消结果；未确认邀请到开始时间、征集到最后候选窗口结束时
进入只读过期状态和已结束列表，关闭写入且不创建日历。已确认计划保留原状态。

## 源码和后端

从发布前真实生产 `dpl_EAJLd9xMRuyCx6fnoVeFphGtUmE1` 的 1,344 个上传文件逐项校验重建，
保留 1,336 个文件原内容，覆盖八项本批依赖、新增生命周期函数及发布来源记录。
最终候选 `dpl_BNevHf7yCYLW8MyrFPRnEtgjqcy1` 的 1,346 个上传文件 SHA-1 全匹配。
没有 Schema 修改或迁移，构建显式设置 `SKIP_DATABASE_MIGRATIONS=1`。

[来源清单](../qa/evidence/2026-10-18-plans113/source-manifest.json)、
[上传核对](../qa/evidence/2026-10-18-plans113/upload-verification.json)。

最终候选生产构建 Ready；候选和正式环境各五组真实账号流程通过：两种浏览器的游客
自动保存/完成/重开、逐人确认、两账号各一条日历及搜索、取消清空日历、过期只读，
以及固定邀请跨实际开始时间后返回 EXPIRED、拒绝迟到确认且没有日历。
正式 www 另外在 Chromium/WebKit 验证关闭状态和空参与者文案。

`api.sideseat.de` 与 `www.sideseat.de` 均已提升到上述同一构建，没有重新构建。
两个域名的 client-config 均返回 200；所查生产 15 分钟窗口没有 error/fatal 分组。
上一稳定部署 `dpl_EAJLd9xMRuyCx6fnoVeFphGtUmE1` 保留为恢复点。
首次候选 `dpl_8x7AUQRLMagjVEvdTvhZ535jUHmt` 的五组流程也通过，但截图发现过期空列表
仍有“成为第一个”的提示；修正后重新构建并验收最终候选，首次候选没有提升到正式域名。

[最终候选](../qa/evidence/2026-10-18-plans113/candidate-flows.json)、
[正式 API 流程](../qa/evidence/2026-10-18-plans113/production-flows.json)、
[正式 www](../qa/evidence/2026-10-18-plans113/production-www.json)、
[域名回执](../qa/evidence/2026-10-18-plans113/production-aliases.json)。

## 回归与手机

模拟器累计 53 个不同原生用例通过；本地 15 项浏览器/API 流程、2 项双人 API、9 项领域、
13 项契约测试及静态检查通过。深色过期页按钮经截图修正并定向复查通过。
Preview `app.sideseat.mobile.preview / 1.0.0 (113)` 签名构建完成，严格/深度签名校验通过，
描述文件包含默认 iPhone 14 Plus 的 UDID `00008110-001A69110CC1401E`。
默认 iPhone 14 Plus / iOS 26.6.1 已实际安装 113；最后以空测试参数、无 QA 环境和
`sideseat://plans` 普通启动，PID `2141` 随后在设备运行进程中核验。
普通 SideSeat / `app.sideseat.mobile / 1.0.0 (97)` 仍独立安装，QA runner 已卸载。
[最终设备回执](../qa/evidence/2026-10-18-plans113/device-final-state.json)。

**真机交互验收未通过连接阶段。** 本次独立 runner 在建立 IDE 连接前以 exit 74 退出，
日志显示 XCTestDriverInterface 通道被拒绝、随后因 IDE 断连退出；四个业务用例均未开始。
这不是四项业务用例通过，不能用模拟器结果或安装成功替代。
[原始结果摘要](../qa/evidence/2026-10-18-plans113/phone-ui-attempt.json)按失败保留。
没有重启设备、更换默认手机或修改自动化/安全设置。

本次仅使用隔离本地数据和独立线上 QA 账号。两账号已删除、旧令牌均返回 401，
16 个已知测试分享链接返回 404；删除账号前计划列表已为空，不存在漏清理计划。
两个临时候选访问链接已撤销，本地临时数据库、服务器和模拟器已回收。
[线上清理记录](../qa/evidence/2026-10-18-plans113/online-cleanup.json)。
普通 SideSeat 97 保留独立安装；没有 TestFlight 或 App Store 上传。
