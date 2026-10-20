# 我的收藏：统一收紧卡片间距

收藏页继续使用原推荐卡片组件，头像区和内容区的上下 inset 从 12pt 收紧为 8pt。内部行距、资料到操作区间距保持 8pt，左右保持 20pt，标准样例整卡减少 16pt。推荐页保持原密度，收藏后继续浏览时不因保存状态改变尺寸。补齐资料按钮标签内的 44pt 高度和点击形状，视觉位置及间距不变。

实现 `5bf4c14a`、点击区域修正及最终构建号 `6d26c048` 均已提交推送。最终 Preview 173 从 `6d26c048` 对应的固定原生源码构建，包含此前已提交的连续受邀时段实现，不混入其他聊天未提交的功能。原工作区、分支及其他工作均保留。

最终使用现有 `testSavedIntentionsHaveTheirOwnPage` 扩展验收：模拟器 1 通过、0 失败、0 跳过，中文普通字号及德文深色最大辅助字号均执行收藏 → 我的收藏 → 资料/打招呼可达且至少 44pt → 打开招呼表单并取消 → 取消收藏 → 空收藏入口 → 返回推荐恢复未收藏状态。截图人工复查通过。使用原生固定样例，未发送真实招呼或重跑真实推荐 API。

默认 iPhone 14 Plus（UDID `00008110-001A69110CC1401E`）已安装最终 **Preview 173**。严格签名、本项相关源码输入和包哈希核验通过；本项 Runner 移除，普通启动 PID **4296** 与实际进程一致，普通版 97 保留。最终再次读取设备应用清单，仍为 173。本项真机验证范围为安装与普通启动；UI 自动化验收为模拟器，未声称真机 UI 用例通过。

历史尝试保留：169 为合并最终安装包主动中断；171 真机首轮因同机并行 UI 测试而主动中断。模拟器 171 首轮发现资料按钮只暴露 18pt 的文字区域，44pt 断言失败；修正标签与点击形状后，173 完整重跑通过。173 模拟器首次构建遇到构建数据库锁，独立重试通过。这些尝试均不计为最终通过。

本项没有后端/网页/Schema 发布，沿用当前记录的后端 `dpl_2ifkV5RZ2Dy2cguEeBfoaAo7LLWj`；该后端由计划页面阶段发布，本项没有重新发布或验收其业务链。

- [最终模拟器摘要](./evidence/2026-10-20-saved-card-spacing/simulator173-summary.json)
- [中文收藏卡片](./evidence/2026-10-20-saved-card-spacing/simulator173-together-saved-intentions-zh-Hans.png)
- [德文深色最大字号](./evidence/2026-10-20-saved-card-spacing/simulator173-together-saved-intentions-de.png)
- [最终签名、包哈希与源码](./evidence/2026-10-20-saved-card-spacing/phone173-build-manifest.json)
- [最终安装与普通启动](./evidence/2026-10-20-saved-card-spacing/phone173-delivery.json)
- [首次模拟器失败记录](./evidence/2026-10-20-saved-card-spacing/simulator-initial171-summary.json)
- [主动中断记录](./evidence/2026-10-20-saved-card-spacing/interrupted-attempts.json)
- [交付记录](../releases/2026-10-20-preview173-saved-card-spacing.md)
