# 存储与聊天后端生产发布

日期：2026-10-01（Europe/Berlin）。用户已明确确认发布本版后端、新增数据库迁移和旧聊天图片迁移。

## 发布结果

- 正式 API：<https://api.sideseat.de>，已确认指向 `dpl_6dZkYXuKz69Z69JS4W37uGBAoFWQ`。
- [部署详情](https://vercel.com/baichus-projects/sideseat/6dZkYXuKz69Z69JS4W37uGBAoFWQ)：Production / Ready。候选先以 `--skip-domain` 发布，真实接口验证通过后 promote 同一构建。
- 本次上线私有聊天图片、文件删除队列与孤儿文件扫描、统一上传限制、禁止新图片内联入库，以及聊天空闲轮询优化。没有发布新的 iOS/TestFlight 二进制，没有升级 Vercel/Neon 套餐。
- 来源：当前 `codex/ios-uxui-20260922` 工作区；基于上一生产发布快照，在隔离目录 `/tmp/sideseat-storage-release-20261001` 纳入 42 个已审查的相关文件。保留工作区原有未提交变更。文件哈希见[来源清单](../qa/evidence/2026-10-01-storage-production/source-manifest.json)。

## 数据库与图片迁移

- Neon 正式目标：`hidden-star-16421165` / `main`（`br-frosty-snow-apffdw0p`）。
- 迁移前创建恢复分支 `release-backup-20261001-storage`（`br-tiny-scene-apa9lbbv`），保留当时数据和 schema，未修改该分支。当前历史窗口仍是 6 小时；这个恢复点不等于定期备份或恢复演练。
- 预检仅有 `20260930190000_media_lifecycle` 待执行，受控执行一次后 145 条迁移全部同步。远程构建显式使用 `SKIP_DATABASE_MIGRATIONS=1`，没有在构建中重复迁移。
- 确认现有 `sideseat-verification` Blob 为 Private / `fra1`，与公开媒体存储凭证不同。受权读取使用现有凭证，临时文件权限为 0600，未输出凭证、改变访问权限或轮换密钥。
- 旧聊天图片共 18 条：17 条内联图片、1 条公开 Blob。全部迁到私有存储；逐张 SHA-256 校验 **18/18 一致**。公开原件删除 1 个，并用存储 API 确认不存在。
- 迁移结束：失败 0、待迁移 0、删除队列积压 0。详见[迁移计数](../qa/evidence/2026-10-01-storage-production/media-migration.json)和[完整性验证](../qa/evidence/2026-10-01-storage-production/migration-verification.json)。

## 线上验证

候选和正式域名各完成同一组 **25 项检查**。每组建立两个会话参与者及一个非参与者的临时账号，仅在临时账号之间测试，不发邮件或设备推送；结束后临时账号全部删除。

- 登录、私有上传、幂等重试、发送图片、双方读取正常；返回签名代理地址，原始私有对象拒绝匿名读取。
- 非参与者、过期签名、屏蔽后的访问被拒绝；撤回后不可读取，相关文件删除队列已清空。
- 公开头像上传仍正常；通过账号删除 API 清理测试头像与记录。
- 正式客户端配置、AASA、隐私页、支持页均 200；未登录的计划取消列表返回预期 401。
- 查询该部署截至 `2026-09-30 22:32:40 UTC` 的最近 15 分钟 error 日志，结果 0 条。这是发布时有限窗口检查，不代表持续监控已经接通。

证据：[候选检查](../qa/evidence/2026-10-01-storage-production/candidate-smoke.json)、[正式检查](../qa/evidence/2026-10-01-storage-production/production-smoke.json)、[公共入口](../qa/evidence/2026-10-01-storage-production/production-public.json)、[错误日志摘要](../qa/evidence/2026-10-01-storage-production/runtime-errors.json)、[构建摘要](../qa/evidence/2026-10-01-storage-production/build-summary.json)。

## 恢复边界与后续人工决定

本次开始写入私有图片后，不能直接把流量切回不支持私有图片的旧部署 `dpl_ERSM5FbjLHHdEEcqgKPWBW2Q68Dp`。优先保留当前私有图片兼容能力做前向修复，不执行 down migration。数据库恢复点也不会恢复已删除的公开 Blob 原件；需要结合消息与新私有地址映射恢复引用，并重新校验访问权限。映射仅保存在工作区已忽略的 `.vercel/recovery/2026-10-01-storage/media-map.json`（0600），不含凭证或图片正文，不写进版本库。

仍需负责人决定的事项未被本次发布代替：至少 7 天的备份保留与实际恢复演练、Cron 外部监控服务及通知接收人、Pro 套餐与超额预算、长期数据保留政策。现有文件回收 Cron 保持每日 03:45 UTC。原生 UI、APNs、压力测试及完整产品旅程未在本次重新验收；本次线上验证覆盖存储与聊天相关闭环。

凭证下载文件、剪贴板内容、旧图片临时副本和测试请求文件在发布记录保存后清理；保留不含密钥的发布源码快照与核验结果。
