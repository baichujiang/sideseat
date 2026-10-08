# 后端 API 生产发布记录

日期：2026-09-30（Europe/Berlin）。范围：SideSeat 后端 API、5 条数据库迁移及 Vercel Production；本次没有发布 iOS/TestFlight 二进制。用户已明确授权发布后端。

## 发布来源与结果

- Vercel 项目：sideseat，项目 ID prj_Mmv4C0ROdAmglCHaI41vrzTXiH2N。
- 发布部署：dpl_ERSM5FbjLHHdEEcqgKPWBW2Q68Dp，https://sideseat-mzzv3ixfn-baichus-projects.vercel.app，Production / Ready。
- 正式 API 域名 api.sideseat.de 已由 Vercel alias 列表确认指向该部署。
- 正式域名健康检查于 2026-09-30 19:10:53 UTC 前完成（21:10 CEST 左右）。
- 候选构建于 2026-09-30 20:34 CEST 完成，迁移前以 SKIP_DATABASE_MIGRATIONS=1 构建；数据库迁移和候选冒烟通过后，使用同一构建执行 Vercel promote。
- 活动来源分支 codex/ios-uxui-20260922，HEAD c2bc8a36492314a5bb8da39dbd27d5cee556a5ab。该工作区有未提交变更；隔离发布目录由生产基线及已审核的后端/API、Prisma、OpenAPI 变更组成，没有把未发布的 iOS UI 改动合并进本次 API 部署。

## 数据库与迁移

- Neon 项目 neon-charcoal-island（ID hidden-star-16421165），正式分支 main（ID br-frosty-snow-apffdw0p）。目标通过 Vercel 集成、Neon 默认分支及其现有 Prisma 迁移账本核对。
- 迁移前建立永久恢复分支 release-backup-20260930（ID br-rapid-band-ap6xvkqf），基于 main 当时的数据与 schema；该分支尚未被修改。它是迁移前恢复点，不等同于完整恢复演练。
- 迁移前状态：144 条迁移中仅以下 5 条待应用，没有额外迁移漂移：
  - 20260926120000_opportunity_message_requests
  - 20260926130000_explore_contact_drafts
  - 20260926130100_explore_draft_activation_constraint
  - 20260926210000_intention_time_deadlines
  - 20260927010000_plan_cancellation_notices
- 只读数据预检：机会状态约束不符记录 0 条；38 条现存有日期意愿需要推导过期时间；其中无效日期/时区 0 条，无效时间窗口 0 条。
- 从隔离发布目录一次性执行上述前向迁移，未执行回滚或重复重试。完成后 prisma migrate status 显示 144 条迁移全部同步。
- ALLOW_REMOTE_DATABASE_MIGRATIONS=1 仅存在于这一次迁移进程环境，没有写入 Vercel 环境变量。数据库凭证没有写入仓库或本报告；迁移完成后已从系统剪贴板清除。

## 验证结果

- 候选真实 HTTP 冒烟：客户端配置 200；新增计划取消 API 未登录时返回预期 401（路由存在且鉴权生效）；AASA、Privacy、Support 均为 200。
- 切流后正式域名：api.sideseat.de/api/v1/client-config 为 200；api.sideseat.de/api/v1/me/plan-cancellations 未登录为预期 401；规范主站上的 AASA、Privacy、Support 跟随重定向后均为 200。
- Vercel 部署级 error 日志：截至 2026-09-30 19:18 UTC 的最近 5 分钟查询为 0 条；这是有限时间窗口检查，不代表持续监控已配置。
- 本地发布验证：TypeScript、OpenAPI（180 个操作匹配、13 项契约测试通过）、完整 V2/Postgres 测试通过；完整后端 HTTP 闭环的 6 个关键分支通过。ESLint 通过，保留一个测试文件未使用变量警告。

## 仍需人工审核

- 尚未运行正式环境的双账号登录闭环。当前计划取消 QA 脚本明确拒绝非 localhost，工作区没有配置生产 QA 会话；不能把本地 HTTP 测试或未登录 401 检查当成正式双账号验证。请用已批准的专用 QA 账号人工验证意愿、推荐、收藏、打招呼、聊天、计划取消/完成及继续聊天。
- Neon 控制台显示当前项目保留 6 小时历史；本次恢复分支提供了本次迁移前快照，但没有在隔离分支执行恢复演练。运维负责人仍需确认备份保留与恢复演练计划。
- 2026-09-26 的会员后台发布记录曾指出 CRON_MONITOR_URLS、DATABASE_BACKUP_PROVIDER、DATABASE_BACKUP_RETENTION_DAYS、DATABASE_RESTORE_TESTED_AT 未配置；本次未重新核验这些变量，需由运维负责人确认当前告警与备份配置。
- 本次没有上传或验证新的 TestFlight/App Store 二进制；原生客户端视觉、推送和签名验收不属于这次后端发布。

## 回退

迁移是前向兼容性设计；若 API 出现问题，可将 api.sideseat.de 回退至发布前部署 dpl_41FayLn3SEtTzw477PDZAzEEZ9B9，但保留数据库新增结构和数据，不运行 down migration。优先采用前向修复；回退不会撤销已经由新 API 写入的数据。

证据：[数据库预检](../qa/evidence/2026-09-30-backend-production/database-preflight.json)、[线上冒烟](../qa/evidence/2026-09-30-backend-production/production-smoke.txt)、[运行日志检查](../qa/evidence/2026-09-30-backend-production/runtime-errors.json)、[本地验证摘要](../qa/evidence/2026-09-30-backend-production/local-validation.txt)。
