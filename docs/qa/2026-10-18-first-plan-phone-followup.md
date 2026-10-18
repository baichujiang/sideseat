# 首次计划完整真机流程：连接恢复跟进

2026-10-18，Europe/Berlin。活跃分支 `codex/ios-uxui-20260922`，基线 `f5f5b25`。
当前手机仍为 Preview **114**，产品源码 `51c98e9`；本阶段尚无产品修复或后端部署。

## 目标与准备

新增连续真机用例 `PlanFirstUsePhoneUITests`：使用独立账号通过真实登录进入空白计划首页，
原生创建 → 填写并保存 → 系统分享面板与复制链接 → Safari 使用实际复制的链接填写 →
返回原生选择 09:00–10:00 并发送邀请 → 同一 Safari 游客确认 → 原生日历搜索、详情及返回计划。
该用例使用内存凭据存储保护原登录；不使用认证/计划/日历数据夹具，runner 本身不发送 HTTP。

`scripts/qa/plan-first-use-phone.mjs` 准备专用账号、观察界面阶段并核对真实 API，
检查确认前无日历、保存精确槽位、两人确认、实际一小时及唯一日历记录，最后回收账号和计划。
私有凭据只写系统临时目录，不能提交；必须在真机连接恢复后再运行 `prepare`。

完整测试已在 Xcode 26.6 / 17F113 编译并签名，Node 脚本语法检查及 diff 检查通过。
**完整流程目前仅准备完成，尚未执行，不是验收通过。**

## 当前连接边界

默认设备明确指定 iPhone 14 Plus / iOS 26.6.1，UDID `00008110-001A69110CC1401E`，
CoreDevice `D906CC6D-3EC6-50A2-8D93-A6602521362A`。
设备报告已解锁、开发者模式开启，Xcode 的 `xcdevice` 列表显示 USB 可用。
CoreDevice 同时报告 `localNetwork`，不能单凭此字段断言没有连接 USB。

本次改用主工程绑定 Preview 的 runner、显式 arm64，先运行创建/取消连接探针。
随后仅刷新 Mac 的 CoreDeviceService，会话重新建立，Xcode 设备页更新到真实 Preview 114，
再执行一次同一探针。两次均在建立 XCTest 连接前 runner exit 74，Xcode exit 65，实际交互用例执行 0 项。
没有继续循环重试，也没有修改设备安全设置、配对关系或用户账号。

[绑定 runner 结果](./evidence/2026-10-18-first-plan-phone/bound-smoke.json)、
[刷新会话后结果](./evidence/2026-10-18-first-plan-phone/refreshed-smoke.json)。

历史同机恢复记录表明，普通解锁并不证明自动化授权，曾需要重启后由机主直接解锁并在手机上
完成 XCTest 的启用界面；[原始记录](./2026-10-15-iphone14plus-guest-flow.md)。
已请求机主进行此步骤；密码不应发到聊天或由测试读取/输入。收到完成回复后再恢复测试。

本次未创建线上 QA 账号或计划，未修改客户计划。
测试 runner 已移除，Preview 114 已恢复普通启动，普通 SideSeat 97 保留；
[手机回执](./evidence/2026-10-18-first-plan-phone/device-final.json)。
没有发布新 Preview 版本，不能把重新构建测试解释为产品交付完成。
