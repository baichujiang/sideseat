# Preview238：计划完整闭环与中文通知

计划页四组真实验收在同一冻结238包分别通过：混合App／网页578.137秒（15API阶段＋11网页检查）、日期跨天298.567秒（8GET）、活动提议655.295秒（14GET）、前台通知94.849秒（10阶段）。每组各1项、0失败／跳过，不能合称一次连续套件。[完整QA与失败范围](../qa/2026-10-26-five-root-plans.md)

默认实体iPhone14Plus／iOS26.6.1完成原生业务，游客使用Mac真实Chromium／WebKit。前三组通过UI完成创建、手动空闲提交、App分享、直接邀请、接受／不回应／拒绝、随时发布、晚接受、退出、取消及SideSeat日历读回；活动布告栏和跨天23:00–01:00专项另测。Push用独立API准备／触发，仅手机真实通知、点按、接受和日历作为该组UI证据，不替代Main。

修复两处实测问题：APNs只用既有三语资源本地化计划标题，正文保留活动名原文，前台标题按App语言；网页拒绝状态精简为「已拒绝」。真实前台三类中文通知和业务名字面`%@ 100%`均通过。邀请／通知／日历规则、普通payload及路由不变，无新API、Schema或迁移。来源`b551aaf399776357717d832c86f63403ad7916dc`已推送，独立最简复核、34项TS、三语各30项原生测试、完整TS检查及双App构建通过。

保留式生产发布从原1397文件基线保留1394原字节，覆盖3文件＋marker共1398文件，远端源码UID／SHA1全部匹配；迁移跳过、活动hook none。双引擎候选回归后提升同一已测构建，未重建。api／www／根域均READY production `dpl_HTsL9cNjKSrWp2wQUMGKGaj9ifvZ`。[发布来源核验](../qa/evidence/2026-10-26-five-root-plans238/release-provenance.json)

最终97次capture／79种唯一原图均实际审阅，选16张安全原图。范围为原生普通中文／浅色和网页390浅色／320深色；不声称全App最大字号、物理Safari、Apple Calendar或系统后台通知语言全部通过。[逐图范围](../qa/evidence/2026-10-26-five-root-plans238/images.json)

12个自有账号及17个自有计划已清理并核实旧bearer401／计划404，数字包含基线、失败与候选，不是一组参与人数。图片仅在清理后采用；凭据、恢复链接、cookies、trace及原始设备JSON不公开。

默认手机238普通启动PID11097，空参数／仅TERM环境与独立进程匹配；4个自有Plan Runner移除，普通97及旧Runner保留，相对路径＋lastModDate比较新增SideSeat报告0。268项来源、冻结／构建上下文及Local字节相同，较236改2留266；严格签名、产品双二进制SHA和安装Info238核验，没有声称直接读手机binary。[手机](../qa/evidence/2026-10-26-five-root-plans238/device-verification.json)、[来源](../qa/evidence/2026-10-26-five-root-plans238/source-binary-provenance.json)。4个runtime凭据封装移除，原始私密结果及构建上下文暂留支持后3页；本阶段计划页已交付，后续页面仍按顺序另验收。
