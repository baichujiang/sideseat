# 发起计划表单层级 — Preview 195

创建页将原来的单一大边框分成三个层级：活动名称／地点使用柔和底色，名称可自然换行；候选日期／每日时段共用一个设置区，时区收在时段下；朋友提议保留独立的低强调描边勾选项。展开的日历紧跟日期行，清空日期仍位于日历正下方居中。

直接复用 `PlanAdaptiveRow`、原生多行 TextField、已有时段 Menu 和按钮轮廓。日期归一化、默认七天、每日范围、校验、幂等请求、COLLECT 创建、分享和邀请／日历规则不变，没有新增模式、步骤或后端能力。日历局部恢复外层字号环境，避免移入信息容器后意外继承原表单的辅助字号上限。

本次只修改原生创建页及相应用例。详情时间表和网页没有改动；Preview 193 已记录的德文详情最大字号空白仍未解决，本次创建页验收不能替代详情视觉验收。

## 验收记录

测试使用默认 iPhone 14 Plus／iPhone (4)，UDID `00008110-001A69110CC1401E`，iOS 26.6.1，专用测试账号。

第一次测试调度未执行页面用例：私密 xctestrun 移动后 `__TESTROOT__` 相对路径指向错误位置。已将测试包路径解析为真实构建目录；这项配置修正不改变 App 产品包，也不计作通过的产品测试。

第一轮实际页面用例三项失败，见 [原始结果摘要](./evidence/2026-10-24-creation-form195/layout-initial-summary.json)：日期 **34.552 秒**、小时 **20.868 秒**捕获多行名称的回车残留 `\n`；创建布局 **9.507 秒**则在新增的输入 AX 高度断言失败。修正名称输入：遇到换行将各行合为单行并失焦，保留自然视觉换行及原完成行为。原生 TextField 的 AX 只报告文字子区域，外部最小高度属于布局容器，因此测试改核对身份区空间与边界，继续检查实际日期／提议／小时按钮的 44pt 范围；没有缩小产品点击区或降低业务校验。


## 最终产品包上的实际结果

源码 **`982bf4e63930e8288de39fc68ad8041e4fa0946f` 已提交并推送**。修正回车后的 App 产品包未再改变；后续时段用例只改测试，哈希分别记录于[构建来源](./evidence/2026-10-24-creation-form195/native-build-manifest.json)。

| 范围 | 实测结果 |
| --- | --- |
| 创建页四组合 | **109.288 秒通过**：中文浅色／德文深色，各普通／最大辅助字号；输入完成不残留换行、键盘收起、主按钮恢复，提议开关开关后保留输入，各区域边界与按钮范围通过 |
| 日期回归 | **101.995 秒通过**：普通中文／最大德文，展开收起、取消重选、批量连点、居中清空、清空禁用和重选恢复，无闪退 |
| 完整 App 好友真机流程 | **329.095 秒通过**：创建前无表格，发起后立即出现可填写表；好友卡片投递、双方点选／取消／拖选及明确提交，最终时间草稿／跨天、名单邀请、接受、发布，双方日历精确且各一条 |
| API | **8 阶段通过**，另读取验证 7 个唯一候选日期、09:00–17:00、Europe/Berlin 和 224 个底层候选时段 |
| 每日时段表单 | **47.798 秒通过**：未滚动的可见选项 03:00 → 02:00，发起禁用；改为 04:00 恢复；展开收起日期后精确保留 03:00–04:00、名称和地点 |

[四组合与日期结果（同轮另有小时失败）](./evidence/2026-10-24-creation-form195/layout-summary.json)、[最终时段结果](./evidence/2026-10-24-creation-form195/hours-summary.json)、[完整流程结果](./evidence/2026-10-24-creation-form195/phone-summary.json)、[8 阶段 API](./evidence/2026-10-24-creation-form195/collection195-api.json)、[实际日期配置](./evidence/2026-10-24-creation-form195/candidate-configuration.json)。

## 实际画面

[中文普通](./evidence/2026-10-24-creation-form195/creation-regular-zh.png)、[中文最大字号](./evidence/2026-10-24-creation-form195/creation-largest-zh.png)、[德文普通](./evidence/2026-10-24-creation-form195/creation-regular-de.png)、[德文最大字号](./evidence/2026-10-24-creation-form195/creation-largest-de.png)。四张逐一检查，未见越框、边框压字或控件交叠；中文示例长标题末尾单字自然换到下一行，内容完整，是可继续改善的排版细节。

[中文日历](./evidence/2026-10-24-creation-form195/calendar-regular-zh.png)、[德文最大字号日历](./evidence/2026-10-24-creation-form195/calendar-largest-de.png)：清空按钮在月历下方居中。超出视口的下方时段仍可正常滚动到达，系统 AssistiveTouch 浮球不属于 App 内容。[有效时段表单](./evidence/2026-10-24-creation-form195/daily-hours-valid.png)。

[第一步](./evidence/2026-10-24-creation-form195/create-before-publish.png) → [发布后可填写时间表](./evidence/2026-10-24-creation-form195/editable-after-publish.png)。

## 时段长菜单的未解决观察

回车修正后的混合轮次中，日期和四组合分别通过；小时专项 **41.666 秒失败**，预期 07:00，实际 01:30。[观察记录](./evidence/2026-10-24-creation-form195/hours-scroll-observation.json)与录像帧表明，38.3 秒菜单仍显示 06:00–12:00，39.2 秒已回到 00:30–06:00，触摸到 39.59 秒才合成。原绝对坐标因此落在 01:30；源码未发现标签与分钟值映射错误。

[回跳前](./evidence/2026-10-24-creation-form195/hours-scroll-before.png)、[触摸前已回顶](./evidence/2026-10-24-creation-form195/hours-scroll-reset-before-touch.png)。触发回跳的根因尚未证明，**不能断言只影响自动化，也不能声称滚动菜单已修复**。最终专项改为初始可见行并使用元素相对中心点击，严格核对每次值；它只验收表单校验和保留，不替代滚动菜单验收。产品时段 Menu 未因测试改动，App 包哈希保持一致。

本次没有重跑原生单元／领域／浏览器或活动提议完整业务链。之前德文详情最大字号时间格空白仍未解决；大字号通过范围为本次创建页。

## 构建、安装与清理

[来源](./evidence/2026-10-24-creation-form195/native-build-manifest.json)：隔离构建从活跃工作区复制，248 个 App／18 个配置脚本输入及共享日历资源逐字节核验，工程由同一 `project.yml` 生成；严格签名通过，`app.sideseat.mobile.preview`／195。

[手机核验](./evidence/2026-10-24-creation-form195/device-verification.json)：默认 iPhone 14 Plus 已安装 195，无测试参数普通启动 **PID 7614** 与实际进程一致，普通版 **97** 保留。阶段内无新增 App 崩溃或资源报告。两个专用账号／一个链接已清理并验证 401／404；Runner、私密夹具／xctestrun／设备 JSON 已清理，原始日志 0600、结果和附件目录 0700，未删除用户资料／钥匙串。

无后端、网页、Schema 或迁移发布；[api/www 只读重验](./evidence/2026-10-24-creation-form195/production-status.json)均 Ready `dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7`。无关 `tsconfig.json` 改动保留且未提交，冻结归档未改。
