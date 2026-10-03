# 智能输入规则上线与 Preview 89

日期：2026-10-04，Europe/Berlin。用户明确授权「发布后端并更新 Preview」。智能输入现在按[规则文档 1.1](../CALENDAR_SMART_INPUT.md)补齐草稿，并移除推定提示。

## Git 与来源

- `0f721360566058d50179b552e4e7dd6ddaae39a0`：规则、共享默认值、API、原生预览及测试。
- `ce306d518d74d354d8d62d2f4f04c7719fa1dcea`：真实模型返回一般办事 15 分钟后的修正；程序的一般办事规则优先于粗分类。
- `454c70b2e1b6e0d6eacf152d3ebdca2bc9741b8f`：Preview 89 的冻结原生源码，包含 Preview 88 已提交的结束后新意愿入口。后续后端修正不改变该原生包或共享默认值。
- 以上提交已推送 `origin/codex/ios-uxui-20260922`。本记录及证据随后以独立提交推送。

## 生产后端

- READY：`dpl_56ce6g2JaUMRuQMCbofBftrMMq1s`，构建地址 `https://sideseat-s87ltl78n-baichus-projects.vercel.app`；正式 API 为 `https://api.sideseat.de`。
- 以原生产 `dpl_7eTKXSMpLAiJSzN6LU1UNS115f5k` 的受控源码为基线，核对 1,853 个已有文件，只叠加本次 7 个后端文件及其修正。未夹带资料外观等未完成修改。
- 云端构建先执行 `prisma migrate status`：146 条迁移全部同步。设置 `SKIP_DATABASE_MIGRATIONS=1`，没有执行数据库迁移。沿用此前记录的恢复点 `br-square-king-ap1ow7vt`；本次不声称执行新的恢复演练。
- 首次候选 `dpl_BnWmhiAesY37grpiUwWfCZqGZqPm` 实测「办事」得到 15 分钟，未接管正式域名；补充程序规则和回归测试后重建。
- 最终候选的两个临时 QA 账号通过全部 10 项检查后，重新核对正式域名仍指向原生产，再执行 promote。正式域名复测通过 9 项检查，随后通过账户删除 API 清理测试账号和日程。
- 真实模型能提取明确地点；「明天上午10:00取充电线」在 10 月 4 日凌晨解析为 **10 月 4 日 10:00–10:15**；一般办事为 30 分钟；修改为 20 分钟后按修改值保存；预览生成不写日程，也不添加参与人。
- client-config、Privacy、Support、AASA 均为 HTTP 200。部署级最近 15 分钟 error 日志返回 0 条；这只是上线时检查，不代表持续监控。

## 手机 Preview

- `app.sideseat.mobile.preview` / `1.0.0 (89)`，API 地址 `https://api.sideseat.de`。
- 从已提交原生源码独立归档构建，294 个源码／资源哈希一致；签名、有效设备授权和共享策略资源校验通过。
- 在后端上线及生产复测后，将配对 iPhone 从 Preview 88 更新到 89。2026-10-04 00:21 CEST 回读版本为 89，启动返回 success。
- 手机本轮核验安装、版本、签名与启动；完整界面交互使用模拟器 fixture 验证，真实模型和保存使用生产 HTTP 验证。没有将这些结果记作手机人工完整操作验收。
- 未上传 TestFlight 或提交 App Store。

## 本地验收

- 32 项智能输入测试覆盖 EX-01 至 EX-24、异常字段、真实模型分类偏差、重复结束日期和 UTF-16 标题。
- 智能输入与 iCal 共 40 项测试分别在 UTC、Europe/Berlin、America/Los_Angeles 通过；日历测试共 65 项通过。
- 独立本地数据库上的 2 项 HTTP 测试通过，包含预览无日程写入、编辑后真实保存及幂等。
- 12 项原生相关单元测试、2 项预览／编辑／保存 UI 测试，以及深色最大字号复测通过；截图已检查。
- TypeScript、针对改动的 ESLint、13 项 OpenAPI 契约测试、182 个操作的契约检查及隔离的生产构建通过。

[发布与验收证据](../qa/evidence/2026-10-04-calendar-smart-input/)；[浅色预览](../qa/evidence/2026-10-03-calendar-smart-input/grouped-preview.png)。冻结后端位于 `/tmp/sideseat-smart-input-backend-release-20261004/`，签名安装包位于 `/tmp/sideseat-smart-input-preview89-20261004/`。
