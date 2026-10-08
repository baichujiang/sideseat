# 会员身份与邀请码兑换验证

日期：2026-09-26。结论：本地会员身份、兑换上限和原生兑换流程通过。

## 本轮交付

- 服务端真实 Free / Plus 身份，到期自动按 Free 返回。
- App「我 → 会员」展示身份和到期时间，提供邀请码输入及成功/失败反馈。
- 邀请码可配置赠送天数、共享兑换总上限和兑换截止时间；支持停用和查看剩余量。
- 同账号同一码幂等；不同码可续期；多账号并发不超过总名额。密码和邀请码原文不会存入兑换表。
- 中、英、德文案；OpenAPI 契约与生成的 Swift 客户端同步。

管理员发码步骤见 [会员实施合同](../MEMBERSHIP.md)。当前管理入口是可信终端脚本，没有面向普通用户开放创建邀请码的 API。

## 真实验证

环境：当前 SideSeat 工作区，`codex/ios-uxui-20260922`；隔离 PostgreSQL `sideseat_loop_20260926`，本地 API 3033；iPhone 17 Pro / iOS 26.5 模拟器。

| 检查 | 结果 |
| --- | --- |
| Prisma 增量迁移 | 隔离本地库成功，无生产操作 |
| 数据库与真实 HTTP 测试 | 5 通过、0 失败、0 跳过 |
| 8 个账号争抢 3 个名额 | 恰好 3 个成功，兑换计数与会员记录一致 |
| 同账号 4 次并发兑换同一码 | 只产生 1 次领取，其余返回已兑换 |
| 同账号并发兑换不同码 | 天数累加，无覆盖丢失 |
| 过期、停用、非法码、会员到期、HTTP 鉴权及限流 | 通过 |
| 原生真实 UI | 1 通过、0 失败、0 跳过，71.277 秒 |
| UI 后独立数据库核对 | 1 次兑换、1 个 Plus；另一账号仍 Free；总计数为 1 |
| 管理脚本 | 创建 7 天 / 2 次上限的邀请码、列出剩余 2 次、停用均通过 |
| OpenAPI 契约 | 检查通过，13 项测试通过 |
| Swift 编译、TypeScript、改动文件 ESLint、三语言 strings、diff 格式 | 通过 |

UI 实际路径：登录免费账号 → 我 → 会员 → 输入小写邀请码 → Plus 生效 → 重复兑换提示 → 第二账号兑换满额码被拒 → 第一个账号重登仍显示 Plus。测试通过真实 API，没有预先写入会员身份。

证据：[服务端测试](evidence/2026-09-26-membership/server-tests.txt)、[UI 摘要](evidence/2026-09-26-membership/ui-summary.json)、[数据库核对](evidence/2026-09-26-membership/database-verification.txt)。

截图：[Plus 与重复兑换](../visual-qa/closed-loop-membership-plus-redeemed.png)、[免费账号遇到满额码](../visual-qa/closed-loop-membership-capacity-exhausted.png)。已查看英文正常字号截图，未见遮挡或截断；未执行全语言、全字号 UI 矩阵。

本地完整结果：`/tmp/sideseat-membership-ui.xcresult`。编译、类型检查和契约日志分别为 `/tmp/sideseat-membership-build.log`、`/tmp/sideseat-membership-tsc.log`、`/tmp/sideseat-membership-openapi.log`。

## 范围与后续

本次先完成会员基础和邀请码。推荐人数限制、Plus 曝光加权、日程 AI 权限、自动赠送及正式付费订阅尚未接入，不应仅看到 Plus 标识就认为这些权益已生效。

没有提交、推送、生产迁移、部署或 TestFlight 上传。邀请码的真实发放批次、赠送天数、名额和截止时间由运营创建时配置；测试示例不等同于正式发放决定。
