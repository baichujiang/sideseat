# 会员与邀请码后台上线记录

日期：2026-09-26。范围：Web 后台、会员 API、两项数据库迁移、Pipi 管理员配置。用户已明确授权「确认。上线。」。

## 发布来源

- 原线上部署：`dpl_BjRcou9F98GQUpBB5apx3dHsxmsK`。
- 基线：`0edab4210e184dd58642b7a2f5cd18616a151bc2`，与活动分支 HEAD 的文件树一致。
- 独立发布目录：`/tmp/sideseat-membership-release-20260926`，仅叠加 24 个会员/后台相关文件；不包含尚未发布的推荐、收藏、聊天变更或原生客户端变更。
- 源码增量归档：`~/Library/Application Support/SideSeat/releases/20260926-membership-admin-source-overlay.zip`；包含逐文件 SHA-256 清单。
- 归档 SHA-256：`b0e4ba3d233deafcafb4bb99f888b3dab7837fc092f4affc3a67ede6ccbdb195`。
- 活动分支和原有未提交修改保留，没有执行全量提交或推送。

## 数据与授权

- 新增 `20260926160000_membership_invite_codes` 和 `20260926180000_membership_invite_admin`；从独立发布目录执行，未应用其他待发布迁移。
- 迁移前确认会员表不存在；迁移仅新增表、约束和会员表内部关联，不修改已有业务记录。
- 迁移前一致性只读快照：`~/Library/Application Support/SideSeat/backups/20260926-membership-before.json`，包含数据库结构、约束、迁移账本及目标账号核验结果。它是本次新增表迁移的限定范围快照，不是完整数据库备份。
- 迁移后发布目录的 `prisma migrate status` 显示数据库已同步。
- Pipi 经远程数据库唯一核验，按固定账号 ID 加入正式 `ADMIN_USER_IDS`；保留原有管理员邮箱配置。未更改 Pipi 密码，也未添加本地 QA 管理员到正式环境。
- 远程迁移授权仅在迁移进程生效；候选构建使用 `SKIP_DATABASE_MIGRATIONS=1`，防止构建重复迁移。

## 发布检查

- 完整 ESLint 通过，仅有原有测试文件未使用变量警告；TypeScript 检查通过。
- 发布配置测试共 68 项通过；反馈相关测试 4 项通过。
- 独立本地数据库会员测试 6 项通过；HTTP 测试因没有为此发布副本启动本地服务器而跳过，由候选部署的真实 HTTP 冒烟替代。
- OpenAPI：174 个已实现操作匹配，契约验证通过。
- 前一轮本地后台浏览器测试及手机/桌面视觉检查，见 [后台验证报告](../qa/2026-09-26-invitation-admin.md)。它们不代表正式环境的密码登录已人工验证。

## 正式部署与冒烟

已上线：[邀请码后台](https://api.sideseat.de/admin/invitations)。最终部署 `dpl_BwB6QoDRV6q5h7DPGnu6HAV2RPfZ`，状态 Ready；正式域名已指向该部署。2026-09-26 16:32 UTC 完成切流后复核（柏林时间 18:32）。

- 候选流程：`--prod --skip-domain` 构建、检查后 `vercel promote`，使用同一最终产物切流。
- 首个候选 `dpl_HVKBtRPrJZ7SDF1d6628MVy8AJGW` 完成真实 HTTP 闭环：两个既有 QA 账号密码登录，Free 查询，普通账号后台 403，Pipi 发码 201，重试不重复生成，兑换 Plus，重复兑换幂等，名额已满拒绝 422，兑换历史、停用和审计通过。
- 最终版本仅比首个候选多一项反馈回复管理员 ID 识别修复；相关测试 4 项通过。最终候选重新完成公共页面、未登录限制及 Pipi 管理接口检查，构建/类型检查通过后切流。
- 正式域名用临时有效 Web 会话实测：Pipi 后台页面 200 且显示本人身份，Cookie 鉴权后台 API 200；普通测试账号看到无权限页，API 403。两条短时会话均已删除。没有获取或更改 Pipi 密码；Pipi 自己输入密码的人工登录不属于本次验证证据。
- QA 账号 `test_001` 的临时 Plus 已恢复到验证前的 Free；QA 原生登录会话均已退出。保留一条标签明确的已停用测试批次 `cmuilt5m300071340qeri677z`，及一条兑换/创建/停用审计，不影响正式发码。
- `/api/v1/client-config`、隐私页、支持页、AASA 均正常；忽略服务端时间后，新旧客户端配置完全一致。无效分享链接的公开处理正常；未读取真实用户的私人分享。
- 最终部署上线后最近 10 分钟 error 级日志查询返回 0 条；这是检查时点的结果，不代表持续监控已配置。

证据目录：[本次发布证据](../qa/evidence/2026-09-26-membership-release/)。

## 现有运维限制

`check:production` 对下载的配置未通过：Vercel 会隐藏敏感变量，因此下载文件里的数据库、推送和部分服务密钥为空，不能据此认定线上缺失。这些变量已按项目元数据核验存在。

但项目元数据确实没有 `CRON_MONITOR_URLS`、`DATABASE_BACKUP_PROVIDER`、`DATABASE_BACKUP_RETENTION_DAYS`、`DATABASE_RESTORE_TESTED_AT`。因此本次不能宣称完整运维就绪或 90 天内恢复演练已验证。实际备份保留期和 Cron 监控仍需负责人补充确认；不在本次会员后台范围内伪造通过值。

本次不上传 TestFlight/App Store，不激活尚未实现的 Plus 推荐额度、曝光加权或 AI 日程限制。

## 回退

如应用异常，可将正式域名回退到 `dpl_BjRcou9F98GQUpBB5apx3dHsxmsK`。新增会员表保留，不执行向下删除；旧版本不使用这些表。`ADMIN_USER_IDS` 可保留以供前向修复，但旧版不识别该授权。


## 当日追加：8 位短邀请码

根据用户关于长度的反馈，新发邀请码改为 8 位易读字母/数字，显示为 `AB7K-9X3M`。忽略大小写、空格和横线；避开 `0/O` 和 `1/I/L`。此前 32 位长码继续兑换，不改动旧记录或摘要。

- 当前部署：`dpl_HFSk2WgaxqYqsr8PUa9LuzwWJT4g`，已构建、候选验证并切换到正式域名。
- 无数据库迁移或环境变量变更；上一会员后台版本为回退点 `dpl_BwB6QoDRV6q5h7DPGnu6HAV2RPfZ`。注意：旧版不接受新短码，发生问题优先前向修复，避免回退后中断已发短码兑换。
- 本地真实数据库及 HTTP 共 8 项通过，0 跳过；包含旧长码兑换后继续用短码续期、并发名额和重复兑换。
- 候选真实账号验证：生成值符合 4+4 格式，小写加空格成功兑换；重试不重复扣次数，第二账号在满额后被拒绝，停用与审计正常。原生测试会话已退出，测试账号恢复 Free；验证批次 `cmuimbrr50007z31poz4za917` 已停用并保留审计。
- 正式客户端配置 API、未登录会员/后台限制及后台登录跳转复核通过；最终部署最近 10 分钟 error 日志为 0 条。
- 新增源码增量归档：`~/Library/Application Support/SideSeat/releases/20260926-membership-short-codes-source-overlay.zip`，SHA-256 `263c14c01721f3783de55a75d289cfa67aeff733a082f69ab4617e5283c8badf`。
- [短码发布证据](../qa/evidence/2026-09-26-short-invite-codes/)。


## 当日追加：后台刷新误跳 iOS 修复

用户报告进入后台自动跳往 iOS 页面。正式环境已用有效 Pipi Cookie 和真实浏览器复现：`/admin/invitations → /login?returnTo=… → /home → /ios`。此前发布的 HTTP 页面 200 检查没有运行浏览器 hydration，不能证明页面加载后仍停留在后台；本次补上真实浏览器回归。

原因：`AuthBootstrap` 在后台路径跳过内存 JWT 初始化，但第二个 effect 仍按“没有 JWT”跳转登录；登录页又忽略已登录用户的 `returnTo`，送往生产环境已冻结的旧首页。

修复：让后台继续由服务端 Cookie 与管理员权限校验负责访问控制；已登录的登录页正确返回安全的同源目的地，拒绝外站、无效 URL 和登录循环。

- 正式部署：`dpl_41FayLn3SEtTzw477PDZAzEEZ9B9`，Ready；[后台入口](https://api.sideseat.de/admin/invitations)。候选浏览器验证通过后切流，正式域名复测通过。
- 发布增量仅两个运行时文件：`components/auth/auth-bootstrap.tsx`、`app/(auth)/login/page.tsx`。原短码发布的 24 文件摘要逐一核验未变；无迁移和环境变量变更。
- 本地三项浏览器测试全部通过：Cookie 会话冷启动/刷新/新标签页/登录返回/安全返回地址；管理员及跨域权限；发码、兑换历史和停用闭环。ESLint 通过。首个候选构建发现动态路由缺少 `Route` 类型声明，补齐后最终生产构建、类型检查通过。
- 候选和正式域名均运行浏览器 JavaScript，验证 Pipi 仅凭有效 Cookie 直接打开 `/admin`、`/admin/invitations`、已登录的登录返回 URL、完整刷新及新标签页；均稳定停留在邀请码后台，点击刷新记录取得 API 200。
- 普通测试用户稳定看到无权限页且 API 403；匿名访问稳定停留登录页且 API 401。安全返回地址边界测试通过。
- Pipi 验证采用临时有效 Web 会话；未获取或更改密码，不将其表述为 Pipi 本人密码登录人工验证。所有临时会话已删除；一次测试清理连接中断后，通过精确会话 ID 完成删除。线上验证未创建或兑换邀请码。
- `/api/v1/client-config`、`/privacy`、`/support` 均 200；验证时最近 10 分钟 error 日志 0 条。
- 源码归档：`~/Library/Application Support/SideSeat/releases/20260926-admin-redirect-source-overlay.zip`，SHA-256 `36e4b51c32ea94ffd51d0b5529692efffbb29e6f51a67aa23383e88b3814b544`。
- 回退点：`dpl_HFSk2WgaxqYqsr8PUa9LuzwWJT4g`，但会重新引入本次后台跳转问题，优先前向修复。

[本次浏览器验证、截图和源码清单](../qa/evidence/2026-09-26-admin-redirect/)。
