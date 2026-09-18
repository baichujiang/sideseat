# 取消意愿有效期 — 正式后端与 Preview 52

日期：2026-09-12。状态：生产迁移、正式后端发布、双账号验证和手机 Preview 52 安装完成。用户在本任务回复“确认”，明确授权本次共享后端与生产数据库变更。

## 生效行为

- 新建和当前未过期的意愿不再自动到期；手机“我的意愿”不再显示有效期或延期入口。
- 暂停、恢复、结束，以及自动匹配和 Explore 可见性保持原有语义。推荐机会仍使用自己的决定期限。
- 已结束或已过期的历史记录不恢复。旧 iOS 客户端访问意愿与 Explore 意愿接口得到 `426 CLIENT_UPDATE_REQUIRED`，需要更新客户端。
- Preview 52 保留当前同行页面的奶油底、玫红配色与滑动条，并包含最新的个人资料行内编辑样式。已准备但未安装的 persistent Preview 48/51 由本次版本取代。

## 生产发布与迁移

- 项目：`sideseat` / `prj_Mmv4C0ROdAmglCHaI41vrzTXiH2N`，团队 `baichus-projects`。
- 来源：`891b627` 加当前工作区的完整后端改动；源码快照 `/tmp/sideseat-persistent-release-20260912`，逐文件哈希 `/tmp/sideseat-persistent-source-manifest.json`。
- 原线上部署：`dpl_8RhSkhnx7itZGMvRL5oBLNgVZDK1`。
- 最终部署：`dpl_BcNocddDh69LJJibGs61qsay1QnH`，[部署地址](https://sideseat-fdr8w54s5-baichus-projects.vercel.app)，已核对 `api.sideseat.de` 指向此部署且为 READY。
- 两份新代码候选版本均先以 `--prod --skip-domain` 构建，设置 `SKIP_DATABASE_MIGRATIONS=1`；构建没有自动迁移数据库。
- 迁移期间先 promote 新代码门控版本 `dpl_97P1A3Ek3VxtLEMVRfSicZcmYc1w`，仅临时关闭意愿写入、匹配和 Explore 三个开关。线上配置核对后刷新备份，再单次执行迁移，最后 promote 已构建的最终版本。
- 迁移前 `prisma migrate status` 确认唯一待应用项为 `20260912010000_persistent_intentions`；使用已核对的 Neon 正式库连接执行 `prisma migrate deploy` 成功。没有修改长期项目环境变量。
- 迁移后确认：28 条当前意愿 `expiresAt=null`；2 条已经到期的旧记录转为 EXPIRED；21 条历史记录内容一致；21 条推荐机会内容一致，其中 9 条仍为 PENDING。自动匹配、公开状态和仍有效记录的暂停状态逐行核对通过。

迁移前恢复材料为受权限保护的局部逻辑备份，包含全部 WeeklyIntent、MutualOpportunity 行、两表列/索引定义和 Prisma 迁移账本，并非全库备份：

`/Users/baichu/Library/Application Support/SideSeat/backups/persistent-2026-09-12T11-36-03.954Z-0e65c7/intentions-opportunities-before.json`

SHA-256：`d53ea357b5465db8e6266198b3e5793946b15fa1d47aa7251b30582145dcd4c1`。目录 0700、文件 0600，已完整读回校验；数据不进入 Git。迁移后如需紧急门控可重新使用上述新代码门控部署；旧代码不兼容当前空截止日期，不能直接回滚到旧部署。

## 本轮验证

- 独立本地 PostgreSQL 迁移、时间语义、匹配会话与客户端兼容测试：9 通过、0 失败、0 跳过。此前完整实现验证见 [实现记录](2026-09-12-persistent-intentions.md)。
- 两个正式 QA 账号均通过正常登录，验证新版意愿/Explore 空截止日期和旧 iOS 的 426 更新提示。
- 两个账号分别新建一条未公开且未启用匹配的临时意愿，完成读取、暂停、恢复、编辑和结束；全程截止日期为空、公开/匹配状态未改变。仅结束本次新建记录，未重置原有意愿；临时登录会话均已撤销。
- 两个账号的 Plans、inbox 和日历接口正常读取。发布后所有功能开关与发布前基线完全一致。
- Client config、AASA、Privacy、Support 均 HTTP 200。新部署从 11:36 UTC 至本轮核查的 Vercel 5xx 聚合查询为空；此为短时间发布检查。
- 本轮没有再次运行全量 iOS UI 测试；既有相关单元/UI 检查见实现记录。本轮真机核验覆盖签名构建、安装身份和实际启动，未宣称完成手机界面的逐屏视觉复验。

## 手机交付

- iPhone 16 Pro Max 上 `SideSeat Preview` / `app.sideseat.mobile.preview` / **1.0.0 (52)** 已安装并启动。
- 安装包 `/tmp/sideseat-persistent-preview52/SideSeat.app`，签名严格校验通过；API 为 `https://api.sideseat.de`。
- Preview 52 从当前工作区构建，合并最新个人资料 UI；未使用保留旧意愿规则的 Preview 49/50/51 UI 源码副本。
- 安装后设备清单确认 Preview 52；普通 SideSeat 仍为 1.0.0 (41)。未执行 TestFlight/App Store 分发。

构建、迁移、API 检查及安装记录分别位于 `/tmp/sideseat-persistent-*-deploy.log`、`/tmp/sideseat-persistent-migrate-deploy.log`、`/tmp/sideseat-persistent-production-smoke.log` 和 `/tmp/sideseat-persistent-preview52-*.log`。关键收据已与备份一同留存。
