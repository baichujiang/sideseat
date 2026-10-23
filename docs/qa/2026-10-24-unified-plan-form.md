# 计划表单统一 App 编辑样式 — Preview 196

以当前 `WeeklyIntentEditorView` 为主参考，创建页直接复用同一套 `Form/Section`、`bgGrouped` 背景、原生 `surface` 分组、16pt 顶距／24pt 组距、`SSFlowActionDock` 和 `ssFlowSheet`。活动名改用共用 `Text.title`（title2 semibold）；活动／地点为第一组，日期／日历／每日时段／时区与朋友提议为第二组。移除灰色大标题板、独立提议卡及内容分组的动作轮廓；实际日期、时段和清空操作保留轮廓。

不新增入口、状态、流程或组件体系。旧的日期归一化、默认七天、每日时段、30 分钟选项、校验与幂等、回车归一化、创建／分享／邀请及日历规则保持。发布后信息仍原位编辑，没有重建独立编辑 sheet；未改保留兼容页或网页。

## 首轮发现与修正

首轮四组合用例在 **37.348 秒失败**：普通中文完成后，最大中文发现小时按钮的点击范围底部到 498pt，而时区文字顶部在 493.125pt。实际图片也显示二者距离偏近。将辅助字号下的小时／时区间距从 4pt 增为 12pt，普通字号继续保持原 4pt；保留原边界断言，没有放宽检查。

[初轮结果](./evidence/2026-10-24-unified-plan-form196/layout-initial-summary.json)、[初轮大字号画面](./evidence/2026-10-24-unified-plan-form196/initial-largest-spacing.png)。

本次大字号验收限定创建页；此前德文详情时间格空白和长时段菜单滚动回顶的原因／手动影响均未解决，不以本次表单通过替代它们的验收。

## 最终实际验收

最终产品包的创建页中德普通／最大字号 **108.185 秒通过**，包括输入／完成键、键盘与底栏切换、提议开关和值保留、区域边界／按钮 44pt。每日时段专项 **49.788 秒通过**：可见行 03:00 → 02:00 禁止发起 → 04:00 恢复，展开收起日期后仍精确为 03:00–04:00。它不覆盖长菜单滚动问题。

同一批次日期用例 **88.746 秒失败**：最大德文滚动到清空按钮后，测试立即读取被原生 Form 回收的屏外名称行，AX 查询不存在。测试改为收起日历、滚回名称／地点至可见可点击后再严格核对值；没有改 App。最终日期回归 **108.845 秒通过**，覆盖普通中文／最大德文，快速连点、清空／禁用／重选及实际输入保留，无闪退。

[混合结果（四组合及小时通过、日期查询失败）](./evidence/2026-10-24-unified-plan-form196/layout-hours-summary.json)、[最终日期结果](./evidence/2026-10-24-unified-plan-form196/dates-summary.json)。不能把混合整轮写为全部通过。App 在小时／四组合检查、日期测试查看方式修正后没有再变化；测试版本分别记录在来源清单。

## 实际画面

[中文普通](./evidence/2026-10-24-unified-plan-form196/creation-regular-zh.png)、[中文最大字号](./evidence/2026-10-24-unified-plan-form196/creation-largest-zh.png)、[德文普通](./evidence/2026-10-24-unified-plan-form196/creation-regular-de.png)、[德文最大字号](./evidence/2026-10-24-unified-plan-form196/creation-largest-de.png)。四张实际逐一核验：中文普通长名完整一行，德文普通两行、最大三行，没有省略、越框或控件交叠。普通标题／地点之间的留白来自原生行高度，未为特定文案增加特殊排版。

[普通日历](./evidence/2026-10-24-unified-plan-form196/calendar-regular-zh.png)、[最大德文日历](./evidence/2026-10-24-unified-plan-form196/calendar-largest-de.png)、[最大德文重选](./evidence/2026-10-24-unified-plan-form196/dates-reselected-de.png)、[小时设置](./evidence/2026-10-24-unified-plan-form196/daily-hours-valid.png)。月历／星期／日格和居中清空完整；屏外字段滚回后可达且值正确。系统 AssistiveTouch 浮球不属于 App 布局。

## 完整链路与交付

源码 **`a1e350b7c75bffc5d2fbc6d4856379b771f0c7f4` 已提交并推送**。同一最终产品包的完整 App 好友真机流程 **328.834 秒通过**：发布前没有时间表，发起后立即可填；好友卡片投递、双方明确提交、最终时间取消／拖选／跨天草稿、名单邀请、接受、发布，双方日历精确且各一条。Mac 只准备专用好友并读 API，产品操作由手机完成；**8 阶段 API 通过**。

[完整流程结果](./evidence/2026-10-24-unified-plan-form196/phone-summary.json)、[8 阶段 API](./evidence/2026-10-24-unified-plan-form196/collection196-api.json)、[实际候选日期／时段](./evidence/2026-10-24-unified-plan-form196/candidate-configuration.json)、[发布前表单](./evidence/2026-10-24-unified-plan-form196/create-before-publish.png)、[发布后可填写时间表](./evidence/2026-10-24-unified-plan-form196/editable-after-publish.png)。

[构建来源](./evidence/2026-10-24-unified-plan-form196/native-build-manifest.json)：复用前一轮隔离生成的工程，所有变化从活跃工作区同步；248 App／18 配置脚本输入及共享日历资源逐字节一致，私密 Local 配置另行相等核验，严格签名通过，`app.sideseat.mobile.preview`／196。未声称隔离工程目录是活跃开发目录。

[手机核验](./evidence/2026-10-24-unified-plan-form196/device-verification.json)：默认 iPhone 14 Plus／iPhone (4)，UDID `00008110-001A69110CC1401E`，iOS 26.6.1；196 安装并无测试参数普通启动 **PID 7665**，与实际进程一致，普通版 **97** 保留。阶段内无新增 App 崩溃或资源报告。两专用账号／一链接已清理并验证 401／404；Runner、私密夹具／xctestrun／设备 JSON 清理，原始日志 0600、结果及附件目录 0700，未删除用户数据或钥匙串。

无后端、网页、Schema 或迁移发布；[api/www 只读重验](./evidence/2026-10-24-unified-plan-form196/production-status.json)仍 Ready `dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7`。没有重复单元／领域／浏览器或活动提议完整业务链；长菜单滚动和德文详情最大字号旧问题没有改动或重新验收。无关 `tsconfig.json` 工作保留且未提交，冻结归档未改。
