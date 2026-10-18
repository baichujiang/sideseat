# 首次计划完整真机流程：连接恢复跟进

**最新结果：2026-10-18 05:59，默认 iPhone 14 Plus 的完整连续流程通过，0 失败、0 跳过。**
前述连接失败及等待授权为历史过程；最终结果和清理回执见本文末尾。

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

## 最终继续：首次计划连续真机验收通过

机主再次要求重试后，Mac 已解锁，默认手机仍为 wired；XCTest 成功进入测试，
创建/取消呈现探针 **1 项通过**，连续三次创建后取消均直接回到一级计划页。
随后使用全新一次性账号、真实登录和正式 API，在 Preview **114** 完成一条连续流程，
**1 项通过，0 失败、0 跳过，108.654 秒**。最终完成时间 05:59，Europe/Berlin。

| 实际界面操作 | 真实数据核对 |
| --- | --- |
| 首次打开空白计划页 → 发起新计划 → 时间还没定 → 创建 | 初始计划数 0；App 创建成功，发起人身份正确 |
| 发起人填写 Host Ming，选择 09:00–10:00，保存并完成 | 精确保存槽位 `[0,1,2,3]`，1 人，阶段 COLLECTING，日历 0 条 |
| 打开系统分享并点拷贝，再用界面「复制链接」 | iOS 系统面板和原生复制反馈均通过；Safari 使用实际剪贴板链接，网页标题核对本次新计划 |
| 同一手机 Safari 输入 Guest Lin → 选两个半小时 → 已自动保存 → 完成填写 | 游客身份及姓名正确，精确槽位 `[0,1,2,3]`，共 2 人，日历 0 条 |
| 回到 App 看到游客 → 选择 09:00–10:00 → 发送邀请 | INVITING，1/2 已确认，日历仍 0 条 |
| 同一 Safari 游客确认参加 → 回到 App | CONFIRMED，2/2 已确认，唯一一条日历记录，标题一致、实际时长 1 小时 |
| 查看日历 → 按标题搜索 → 打开详情 → 管理计划 | 实际搜索结果可见，开始/结束 09:00–10:00，1h，Guest Lin；能返回同一已确认计划 |

五个阶段均由 Mac 观察测试阶段标记并实时调用真实 API 断言；UI runner 不发送 HTTP。
此用例没有认证、计划或日历数据夹具，只跳过 App 通用教程，并使用内存凭据保护手机原登录。
覆盖范围为原生英文浅色界面、中文 Safari 分享网页和 SideSeat 日历；不是 Apple 系统日历授权测试，
也不替代 113/114 已有的通知、慢保存和过期规则回归。

[最终测试结果](./evidence/2026-10-18-first-plan-phone/journey-final.json)、
[五阶段 API 核对](./evidence/2026-10-18-first-plan-phone/journey-final-api.json)、
[创建取消探针](./evidence/2026-10-18-first-plan-phone/authorized-smoke.json)。

### 测试脚本修正及首次失败

连接恢复后的四次未完成运行都因测试脚本与真实 iOS/网页的差异失败，没有发现产品阻塞缺陷：

1. iOS 26 的系统分享「拷贝」是 Cell，旧脚本只查 Button。
2. 放宽为任意元素后误匹配底层的 Copy 图片；改为明确查 Cell/Button，并等分享面板关闭后原生复制可点。
3. 首次跨 App 粘贴提示属于 SpringBoard；旧脚本从 Safari 查找并过早读取旧地址。改为在系统层等待允许粘贴，再读实际地址，同时核对新计划标题。
4. 分享网页保存成功文案是「已自动保存 / Saved automatically」，脚本错误期待「已保存 / Saved」。按现行界面修正断言；未改产品文案。

每次均清理旧账号/计划并重新创建空白账号；第五次完整连续运行通过。
[第 1 次](./evidence/2026-10-18-first-plan-phone/journey-attempt1.json)、
[第 2 次](./evidence/2026-10-18-first-plan-phone/journey-attempt2.json)、
[第 3 次](./evidence/2026-10-18-first-plan-phone/journey-attempt3.json)、
[第 4 次](./evidence/2026-10-18-first-plan-phone/journey-attempt4.json)。

### 截图和最终收尾

保留完整 16 张合成测试数据截图，依次为
[首次首页](./evidence/2026-10-18-first-plan-phone/phone-first-plan-01-first-visit.png)、
[系统分享](./evidence/2026-10-18-first-plan-phone/phone-first-plan-05-system-share.png)、
[游客保存](./evidence/2026-10-18-first-plan-phone/phone-first-plan-06-guest-saved.png)、
[邀请检查](./evidence/2026-10-18-first-plan-phone/phone-first-plan-09-review-invitation.png)、
[全员确认](./evidence/2026-10-18-first-plan-phone/phone-first-plan-13-native-confirmed.png)、
[日历详情](./evidence/2026-10-18-first-plan-phone/phone-first-plan-15-calendar-entry.png)。
其余连续截图位于同一 evidence 目录。

最终一次账号和计划已删除，删除前剩余计划 0，旧账号令牌 401，分享链接 404；
前四次也各有独立清理回执。本轮共回收 5 个测试账号及 5 个测试计划。
私有账号文件及含密码的 xctestrun 已删除，原始 xcresult/附件只保留在权限受限的本机临时目录，
没有提交账号凭据、录屏或原始诊断包。
[最终清理](./evidence/2026-10-18-first-plan-phone/journey-final-cleanup.json)。

测试 runner 已卸载。严格签名核验后重新安装同一 Preview **114**，携带 `sideseat://plans`
恢复无测试参数/QA 环境变量的普通启动，PID **841** 已在进程表核对。
普通 SideSeat **97** 继续保留。Xcode 当前工程为活跃 checkout，Scheme 为 SideSeat-Preview，
运行目的地恢复为默认 iPhone (4)，UDID 匹配 iPhone 14 Plus。
[最终设备回执](./evidence/2026-10-18-first-plan-phone/device-accepted-final.json)。

本轮只修正测试脚本及补齐真机证据，没有产品代码、后端、Schema 或迁移变化；
没有新编造 Preview 115，也没有 TestFlight/App Store 上传。
产品源码仍为 `51c98e9`，正式后端仍为 `dpl_BerFn2d4wg2VPbtCxFN5WUQA217g`。
