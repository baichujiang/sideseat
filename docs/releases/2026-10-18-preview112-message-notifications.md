# Preview 112：消息页的新招呼与通知

**日期：** 2026-10-18，Europe/Berlin。源码 `ebb8dcd4d46d8e000fd61d53508e60463ca89693`
已提交并推送至 `codex/ios-uxui-20260922`；起始基线 `8a774c1`，工作区干净。

消息页在搜索框下并排展示「新招呼」与「通知」：蓝色手掌/铃铛、下方标签、独立触控区域。
招呼继续使用原有数量和分组；通知角标只统计未读通知。通知列表按时间展示图标、标题、
计划名称与未读圆点，支持逐条已读、全部已读、下拉刷新和对应详情跳转。

## 数据与状态

原生客户端复用已部署的 `GET /api/v1/plans`、`/api/v1/time-polls` 和 `/api/v1/me`。
计划邀请、时间变更、确认和取消由当前认证账号可见的真实状态生成；学生认证结果及用户名
更新由本机观察到的资料变化生成。首次资料加载建立基线，不伪造历史审核结果。
认证状态由同一个接口读取路径更新，避免旧资料缓存把同一结果反复变成新提醒。

这是按账号保存在本机的通知/已读记录，最多 100 条；不提供跨设备已读同步或完整的服务端
历史推送归档。仅导入当前可见的计划提醒及后续观察到的变化，源列表不再包含的计划内容
会移除。其他参与者填写空闲时间而未改变邀请语义时，不重复增加角标。
读取通知与接受邀请分别记录；详情继续使用现有计划、聊天、资料和设置入口。
部分接口刷新失败时保留已加载内容并显示重试状态。

## 验证

隔离 iPhone 14 Plus / iOS 26.5 模拟器累计覆盖 32 个不同用例：21 项既有导航、7 项通知模型/
接口加载与账号隔离、4 项 UI。没有生产业务夹具写入。

| 运行 | 结果与范围 |
| --- | --- |
| [首次组合验证](../qa/evidence/2026-10-18-notifications112/simulator-tests.json) | 30 项通过：21 导航、5 通知模型、4 UI |
| [补充接口与账号验证](../qa/evidence/2026-10-18-notifications112/source-tests.json) | 7 项通过，含三个认证接口的解码/整合、已读持久化、切换账号及迟到响应隔离 |
| [大字号修正复查](../qa/evidence/2026-10-18-notifications112/large-final-tests.json) | 1 项通过；角标文字改为紧凑尺寸，保留完整无障碍数量 |
| [最终流程复查](../qa/evidence/2026-10-18-notifications112/final-flow-tests.json) | 9 项通过：最终源码的 7 项通知测试及浅/深色导航、已读与资料跳转两项 UI |

浅/深色、选中数量、最大辅助字号、空状态和刷新失败截图均已人工检查：
[浅色入口](../qa/evidence/2026-10-18-notifications112/shortcuts-light.png)、
[深色入口](../qa/evidence/2026-10-18-notifications112/shortcuts-dark.png)、
[通知列表](../qa/evidence/2026-10-18-notifications112/list-light.png)、
[深色列表](../qa/evidence/2026-10-18-notifications112/list-dark.png)、
[最大字号入口](../qa/evidence/2026-10-18-notifications112/shortcuts-accessibility5.png)、
[最大字号列表](../qa/evidence/2026-10-18-notifications112/list-accessibility5.png)、
[空列表](../qa/evidence/2026-10-18-notifications112/empty.png)、
[刷新失败](../qa/evidence/2026-10-18-notifications112/refresh-error.png)。
截图来自本地 DEBUG 夹具；已检查独立的至少 44pt 触控区、数量/已读无障碍值与文字换行，
未进行 VoiceOver 朗读验收。中/英/德资源语法与 Git diff 检查通过。

## 真机交付及限制

默认 iPhone 14 Plus / iOS 26.6.1 / UDID `00008110-001A69110CC1401E` 已安装
`app.sideseat.mobile.preview / 1.0.0 (112)`。严格/深度签名核验通过，Team `V4238R5R53`，
描述文件包含默认设备。最终应用以空测试参数、消息入口 URL `sideseat://inbox` 普通启动，
PID `2134` 随后在运行进程中核验。普通 SideSeat 97 保持独立安装。
[最终设备记录](../qa/evidence/2026-10-18-notifications112/device-final-state.json)。

本次真机 XCTest runner 在建立连接前以 **exit 74** 退出，没有开始执行 UI 用例。
该运行按失败保留：[原始结果汇总](../qa/evidence/2026-10-18-notifications112/phone-first-attempt.json)。
不能把模拟器结果或安装/启动成功写成真机交互验收通过。未重启手机或修改自动化/安全设置；
QA runner 已卸载，临时模拟器已移除。

## 后端与发布范围

本次没有后端依赖发布、API/Schema 修改、迁移或 TestFlight/App Store 上传。
最近既有生产部署记录仍为 `dpl_EAJLd9xMRuyCx6fnoVeFphGtUmE1`，本次未重新查询部署 ID。
公开 [client-config](../qa/evidence/2026-10-18-notifications112/client-config.json) 已重新读取；
三个复用接口在未认证请求下均返回 401，见
[路由访问检查](../qa/evidence/2026-10-18-notifications112/api-reachability.json)。
该检查仅证明路由存在和认证边界，认证后的数据流程由本地传输测试覆盖；
本次没有创建或修改生产计划、招呼或账号资料。
