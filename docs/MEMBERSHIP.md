# 会员身份与邀请码

本阶段实现 Free / Plus 服务端身份、邀请码兑换及原生入口。推荐额度、曝光加权、AI 添加限制、自动内测赠送和付费订阅是后续接入项，本阶段不宣称这些权益已经生效。

## 用户流程

「我」→「会员」：查看 Free / Plus 和到期时间，输入邀请码并点击「兑换 Plus 会员」。兑换成功立即显示 Plus；退出再登录仍保留。加载失败显示重试，不把网络错误显示成免费身份。

- 没有会员记录或有效期已结束：Free。
- 有效会员记录：Plus；以服务端时间判定，不依赖客户端按钮或 DEBUG 参数授予身份。
- 同一邀请码每个账号只能领取一次；重复提交返回当前状态，不追加天数、不再次占名额。
- 不同邀请码可以累加：从当前有效期和兑换时间中较晚者起算，追加该码配置的天数；1 天为 24 小时。
- 邀请码兑换截止时间与会员到期时间是两个独立概念。邀请码到期或停用不会撤销已经兑换的会员。
- 邀请码上限是成功兑换的账号数。失败和重复请求不占名额，账号删除不返还名额。

## 创建与管理邀请码

### 网页管理后台

入口：`/admin/invitations`；`/admin` 会跳转到该页面。使用已有账号登录，服务端检查管理员名单；普通账号不能访问后台数据或调用发码、停用接口。

管理员优先通过环境变量 `ADMIN_USER_IDS` 按不可变账号 ID 授权，多个 ID 用逗号分隔。原有 `ADMIN_EMAILS` / `ADMIN_USERNAMES` 继续兼容。2026-09-26 已按已核验的 `pipi` 固定账号 ID 配置正式授权；线上入口为 [邀请码后台](https://api.sideseat.de/admin/invitations)。迁移、部署与验证见 [发布记录](releases/2026-09-26-membership-admin-production.md)。本次仅发布网页和后端，原生兑换入口需随后续客户端版本交付。

网页操作：

1. 输入批次名称、选择共享码或独立码、设置数量、Plus 天数与兑换截止时间。
2. 共享码生成一个码，最多允许指定数量的不同账号领取；独立码生成指定数量的码，每码仅可领取一次。网页每批 1–500 个名额。
3. 创建后复制邀请码或下载 CSV。原文只在创建响应中展示，服务器继续只存摘要。关闭或刷新后不能恢复原文；响应丢失后重试会显示已有批次，不会重复生成，可停用旧批次后重新发放。
4. 在批次详情分页查看码编号及状态、兑换账号与时间、兑换后的有效期，以及管理员操作记录。
5. 可停用单码或整批。停用后不可重新启用，已兑换会员不受影响。次数上限、天数和截止时间创建后固定，需要不同规则时另建批次。

批次列表每页 20 条；码、兑换记录与操作记录每页 25 条。创建、停用操作和审计记录在同一事务中写入，记录操作者账号 ID 与当时用户名。后台只显示网页批次；此前命令行创建的无批次邀请码仍可使用原管理脚本查看和停用。

### 终端管理工具

管理工具仅在可信终端使用数据库凭据执行，不向普通客户端暴露发码接口。必须明确指定目标数据库。示例中的 30 天、100 次和日期均可修改，不是写死的会员规则。

```sh
npx tsx scripts/membership-invites.ts --help

# 已在当前终端显式设置目标 DATABASE_URL 后执行：
npx tsx scripts/membership-invites.ts create \
  --label early-test \
  --days 30 \
  --max-uses 100 \
  --expires 2026-12-31T23:59:59Z

npx tsx scripts/membership-invites.ts list
npx tsx scripts/membership-invites.ts disable --id <邀请码记录ID>
```

- `--days`：每个账号赠送的 Plus 天数，1–3650。
- `--max-uses`：该邀请码可成功兑换的账号总数，1–1,000,000。
- `--expires`：未来的兑换截止时刻，必须包含时区。
- `--label`：内部备注，方便区分批次。
- 创建时显示邀请码原文一次，请保存后再分发；数据库只保存 SHA-256 摘要，不提供找回原码接口。
- `list` 显示上限、已用、剩余、到期和停用状态。上限设定后不通过客户端修改；需要另一批名额时创建新码。
- `disable` 阻止新的兑换，已有会员继续有效。

本地测试使用项目已有的数据库包装脚本，不能将本地验证命令直接当作生产迁移命令：

```sh
LOCAL_TEST_DB_NAME=sideseat_loop_20260926 node scripts/with-local-test-db.mjs \
  npx tsx scripts/membership-invites.ts create \
  --label local-test --days 30 --max-uses 100 --expires 2026-12-31T23:59:59Z
```

## 服务端契约

- `GET /api/v1/me/membership`：`tier: FREE | PLUS`、`plusExpiresAt`。
- `POST /api/v1/me/membership/redeem`：请求仅含 `code`；返回当前身份和 `alreadyRedeemed`。
- 只对已登录且完成账号设置的本人操作；不能提交另一个 userId 或自行指定 Plus。
- 兑换按账号限流：每 10 分钟最多 10 次请求，含失败及重复请求；超额返回 429 和重试时间。
- 新邀请码为 8 位随机字母/数字，按 `AB7K-9X3M` 分组显示，避开 `0/O`、`1/I/L`；支持大小写、分隔横线和空格。此前发出的 32 位长码继续有效。无效、过期、停用或用完统一返回不可兑换提示。
- 用户行锁串行化同账号兑换；邀请码条件更新原子占用名额；权益更新和兑换记录与名额占用处于同一事务。数据库额外约束 `0 <= redeemedCount <= maxRedemptions` 和 `(codeId, userId)` 唯一。
- `lib/membership/service.ts` 的 `getMembership` 是后续功能读取真实会员身份的入口；旧 `ExploreAccessTier.current` 仍是尚待替换的推荐预览逻辑，不能当作会员授权。

Schema 迁移：`20260926160000_membership_invite_codes` 和 `20260926180000_membership_invite_admin`。先迁移数据库，再发布使用新表的 API 和客户端。本轮只应用到隔离本地数据库；正式环境还需配置真实管理员的 `ADMIN_USER_IDS`。

## 复验

```sh
LOCAL_TEST_DB_NAME=sideseat_loop_20260926 MEMBERSHIP_TEST_API_URL=http://127.0.0.1:3033 \
  node scripts/with-local-test-db.mjs npx tsx --test tests/membership/invite-postgres.test.ts
```

UI 用例：`SocialLiveUITests/testMembershipInviteRedemption`。先运行 `scripts/qa-membership.ts seed`，把生成的本地夹具传入测试环境的 `SIDESEAT_MEMBERSHIP_USER`、`SIDESEAT_MEMBERSHIP_PEER`、`SIDESEAT_MEMBERSHIP_CODE`；真实点击兑换后运行 `scripts/qa-membership.ts verify`。

## Plus 身份徽标（开发版）

有效 Plus 在个人资料、推荐/收藏和聊天身份区域展示统一金色 `PLUS` 徽标。公开 API 只返回可选布尔字段 `isPlus`，不公开会员期限或兑换来源；过期后下次读取为 false。普通会员和旧响应缺字段时不显示徽标。无新增会员等级或数据库迁移；本轮尚未部署/发布客户端。

详见 [徽标验证记录](qa/2026-09-26-plus-badges.md)。
