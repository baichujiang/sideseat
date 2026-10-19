# Preview 131 从「一起选活动」开始

现在可以先发起一个主题，让朋友提议活动并标记感兴趣；发起人明确选定后，在原时间表继续约时间、核对名单和邀请，逐人确认后同步日历。App 与分享网页统一，链接、昵称及提前填写的空闲都保留。「已想好活动」可直接进入原流程。

- 原生最终来源 **`243590215616b99dfa0ba1e04d8accf7ef21104b`**，完整流程测试 **`4c1d0736bf851d7fd2003bfa69b9c4417291cf58`**，均已推送当前分支。
- 后端/网页来源 **`ebe8b081c465487b4eba088e1ca0b384855d3fdc`**；保留实际生产差异后覆盖相关文件，同一候选验证后原样提升至 **`dpl_678enJmimu7x5DSTraSn59s342X4`**，三个域名均 Ready。
- 经私密备份读回核验后应用追加迁移 `20261019100000_plan_activity_ideas`；旧计划记录不改写，旧双人计划规则保留。
- 验证：40 项 Swift 单元、13 项 API 契约、12 项真机界面；本地最终/候选/正式各 10 组真实浏览器；App + Safari 新流程 **241.239 秒 / 14 API 阶段**，已知活动原流程 **269.367 秒 / 12 阶段**通过。
- 默认 iPhone 14 Plus 已安装 **Preview 131**，严格签名及无测试参数普通启动 PID **2327** 核验；QA runner 移除，普通 SideSeat 97 保留。两个大字号问题已修正，失败与复验记录保留。线上 12 个临时账号、12 个计划/链接清理；未上传 TestFlight / App Store。

[创建起点](../qa/evidence/2026-10-19-plans131/phone-first-plan-activity-01-create.png)、[App 活动提议](../qa/evidence/2026-10-19-plans131/phone-first-plan-activity-03-peer-interests.png)、[网页确认参加](../qa/evidence/2026-10-19-plans131/phone-first-plan-activity-09b-guest-invitation.png)、[完整 QA](../qa/2026-10-19-plans131.md)、[设备回执](../qa/evidence/2026-10-19-plans131/device-final.json)。
