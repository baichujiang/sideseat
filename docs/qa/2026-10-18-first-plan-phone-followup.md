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

## 同日继续：连接握手恢复，等待系统授权

机主回复已重启解锁后，绑定 runner 仍在 DTX 驱动通道处被拒绝。检查后执行一次工具可追踪的完整系统重启，机主再次确认开机解锁；故障仍可复现。此前仅凭 `xcdevice` 的 `usb` 字段判断物理连接不够可靠：macOS 26 使用 `SPUSBHostDataType`，旧 `SPUSBDataType` 返回空列表不能作为设备证据。

实际硬件枚举最初没有手机，后来明确匹配默认 UDID，CoreDevice 同步从 `localNetwork` 切换为 `wired`。有线、新构建目录直接运行、重新建立有线 Mac 设备会话及 Xcode GUI 单条测试，均仍在用例开始前失败。GUI 已明确选择当前 checkout、`SideSeat-Preview` 和默认 `iPhone (4)`，没有向另一个手机运行测试。

随后通过 `devicectl manage unpair/pair` 刷新同一 Mac 与默认手机的开发配对，两个操作成功；当前连接再次核验为 wired。**下一次测试已不再报通道拒绝，而是进入 UI 测试初始化后报 `Timed out while enabling automation mode`。** 这证明故障推进到系统自动化授权阶段，不能据此认定用例已运行。

此时 Mac 已锁屏，CUA 明确报告无法继续操作 Xcode。已请求机主在手机直接完成 XCTest 密码/启用 UI 自动化提示，并解锁 Mac；没有读取或自动输入密码，没有修改系统安全授权策略。`DevToolsSecurity -status` 的 disabled 仅表示调试工具可能需要管理员授权，按本机手册不能直接认定它是此次远程握手故障的原因，未执行 enable。

当前实际交互用例仍为 **0 项**，完整首次使用流程尚未验收。产品代码、后端和 Preview 版本没有新变化，仍为 114。准备的一次性账号已删除，旧令牌 401，本阶段没有创建 QA 计划；后续授权完成后重新准备账号并继续连续流程。

[恢复过程](./evidence/2026-10-18-first-plan-phone/recovery-progress.json)、
[完整重启后](./evidence/2026-10-18-first-plan-phone/after-full-reboot.json)、
[有线配对前](./evidence/2026-10-18-first-plan-phone/wired-before-repair.json)、
[全新有线构建](./evidence/2026-10-18-first-plan-phone/clean-wired-session.json)、
[Xcode 界面启动](./evidence/2026-10-18-first-plan-phone/gui-smoke.json)、
[配对恢复后等待授权](./evidence/2026-10-18-first-plan-phone/after-pairing-renewal.json)、
[准备账号清理](./evidence/2026-10-18-first-plan-phone/prepared-account-cleanup.json)。
