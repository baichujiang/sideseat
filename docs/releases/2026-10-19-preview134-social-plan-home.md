# Preview 134 计划首页首版

按已确认的第一版照片方案落地计划首页：首次打开直接说明「把改天约变成周末见」，提供一个主要创建入口、朋友链接入口和立即可见的只读示例。已有计划保留待处理纵向、等待他人横向，加入活动主题图、真实发起人及参与者头像；确认、填写和查看使用不同的视觉层级。现有详情、直接时间表、活动建议、明确邀请确认及日历规则保留。

- 最终原生来源 **021ea76dcb375164ac87e49f3b5528e671ac6723**，API/OpenAPI 来源 **9eec0d95fe50b6d36d22f7adf37b5c018d844372**，均已提交并推送当前分支。首页与原始素材阶段来源 **c888b76e**。图片为本项目原创生成素材，没有使用参考产品代码或复制其图片。
- 默认 **iPhone 14 Plus**（`00008110-001A69110CC1401E`）已安装 **Preview 134**；严格签名、普通启动 **PID 2754** 及运行进程核验通过，无测试参数/QA 环境。普通 SideSeat 97 保留，QA runner 已移除。
- **41 项 Swift 单元、13 项真机界面、301.862 秒完整原生流程/12 API 阶段**通过。实际覆盖新首页创建、分享、参与者直接填写和重开、发起人选时/复核名单、明确确认、唯一日历记录及返回原计划。最大字号/深色、横向轨道与查看全部通过。首次测试发现的示例展开不可见已修复为立即显示的 sheet，并完整复验。
- 候选与正式各 **16 项 Chromium/WebKit 真实检查**通过，包括真实发起人/游客/账号预览、固定时间邀请无空闲答复仍能显示参与者，以及原活动和确认流程。七条健康路由 HTTP 200；部署范围内近一小时日志未返回 error/fatal 分组。
- 正式 API **dpl_9P8hKpuSHdscF2qXcbNiXgUMRWAL**（[候选来源](https://sideseat-qenp4hlfi-baichus-projects.vercel.app)），测试同一构建后原样提升，`api.sideseat.de`、`www.sideseat.de` 别名已核验。1,361 项线上源码逐项验证，保留 1,359 项，仅覆盖列表服务和 OpenAPI、增加来源记录；1,362 项上传源文件完全匹配。新增只读字段，不改 Schema/迁移，构建明确跳过迁移。
- 六个临时账号和 13 个计划/链接已清理，旧 token/链接分别返回 401/404；私密 runner 配置与候选 cookie 删除。本轮未进行 TestFlight 或 App Store 上传。

本轮实现范围为计划首页与真实朋友信息所需的只读 API。**分享网页保留 Preview 133 外观**，原直接时间表/活动建议/确认流程已复验。默认活动图只作装饰，不增加创建步骤，也不自动替用户确定活动。

[完整验收](../qa/2026-10-19-plans134.md)、[设备回执](../qa/evidence/2026-10-19-plans134/device-final.json)、[原生来源](../qa/evidence/2026-10-19-plans134/source.json)、[设计与素材](../designs/2026-10-19-plans-home/README.md)。实际截图：[首次进入](../qa/evidence/2026-10-19-plans134/phone-first-plan-native-home-first-use.png)、[待处理布局](../qa/evidence/2026-10-19-plans134/shared-plan-117-horizontal-needs-you.png)、[横向等待布局](../qa/evidence/2026-10-19-plans134/shared-plan-117-horizontal-waiting-last.png)。后两张是隔离布局 fixture，网络提示不作为生产健康证据。
