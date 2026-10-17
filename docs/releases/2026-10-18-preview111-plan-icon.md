# Preview 111：计划导航图标

**日期：** 2026-10-18，Europe/Berlin。源码 `ae325249179b8a88174a15b69f975aef5d0a91dd`
已提交并推送至 `codex/ios-uxui-20260922`；起始基线 `cbb128f`，工作区干净。

「计划」导航由细节较多的横向列表改为圆形勾选 SF Symbol，使用
`checkmark.circle` / `checkmark.circle.fill`。系统 tab bar 继续管理尺寸、选中背景、
浅深色和角标。现有五个入口、文字标签和计划行为保留。

默认 iPhone 14 Plus（iOS 26.6.1，UDID `00008110-001A69110CC1401E`）已安装
`app.sideseat.mobile.preview / 1.0.0 (111)`。严格/深度签名核验通过，Team
`V4238R5R53`，描述文件包含该设备。无测试参数启动并携带 `sideseat://plans`，
PID `2127` 随后在运行进程中核验。普通 SideSeat 97 仍独立安装。
[安装与启动证据](../qa/evidence/2026-10-18-plan-icon111/device-install-launch.json)。

验证范围：

- 隔离 iPhone 14 Plus / iOS 26.5 模拟器，21 项现有导航测试通过，0 失败；
  [测试汇总](../qa/evidence/2026-10-18-plan-icon111/navigation-tests.json)。
- 人工检查浅/深色、选中/未选中以及最大辅助字号；计划入口可点击并打开一级页，
  图标、角标和标签无裁切。原生 `Label` 和系统触控区域保持不变；未执行 VoiceOver 朗读测试。
- [浅色选中](../qa/evidence/2026-10-18-plan-icon111/light-selected.png)、
  [浅色未选中](../qa/evidence/2026-10-18-plan-icon111/light-unselected.png)、
  [深色选中](../qa/evidence/2026-10-18-plan-icon111/dark-selected.png)、
  [深色未选中](../qa/evidence/2026-10-18-plan-icon111/dark-unselected.png)、
  [最大字号](../qa/evidence/2026-10-18-plan-icon111/dark-accessibility5.png)。

截图来自现有本地 DEBUG 夹具，API 指向不可连接的本机端口，页面的网络提示是该隔离环境的
预期结果；不代表生产请求失败，也不作为完整计划业务的验收。模拟器首次启动卡在系统迁移，
中断未开始执行的测试并重启后，正式测试运行通过。临时模拟器已移除。

本次仅交付原生图标，无后端依赖或后端发布。最近既有后端记录为
`dpl_EAJLd9xMRuyCx6fnoVeFphGtUmE1`；本次未重新核验线上部署/开关。
无 API、Schema、迁移、生产业务写入或 TestFlight/App Store 上传。
