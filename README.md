# SideSeat

> 让每一段校园时光，都有人同行。

SideSeat 是面向大学生的校园同行产品。用户从一个具体、短期的意愿开始，
先私密收藏或发送一条带意愿上下文的招呼，对方回复后继续聊天，确认 Plan，并把真实承诺写入双方日历。
长期目标不是制造更多匹配，而是让一次共同经历自然发展成下一次适合的同行，
让原本陌生的校园逐渐充满熟悉的人。

当前核心链路：

```text
Weekly Intent 发布
→ 自动推荐 / 主动寻找更多
→ 私密收藏（可选）
→ 一条招呼消息
→ 对方回复后持续聊天
→ Plan 提议与明确接受
→ 双方 Calendar
→ 双方独立 Outcome
→ 原聊天继续保留 / 新意愿寻找新同行

Meet Again / Repeat Opportunity：另受功能开关与发布验收控制
```

SideSeat 不提供人物广场、滑动匹配、课程大群、同学名单或公开社交关系图。
课程提供匹配与课表上下文；Calendar 是承诺的可靠承载层，不是推荐入口。

## Product surfaces

原生 iPhone App 使用五个稳定入口：

```text
Together / 同行   Plans / 计划   Calendar / 日历   Messages / 消息   Me / 我
```

- **Together**：我的意愿、推荐、我的收藏；发布后自动匹配，也可主动寻找更多推荐。
- **Plans**：发起空余时间征集或直接定时间，查看推荐结果、选择邀请人并逐人确认；
  所有受邀人接受后同步日历，同时保留聊天计划与结束反馈。
- **Calendar**：个人日程、课程、确认后的 Plan、搜索以及 Apple Calendar 互操作。
- **Messages**：招呼与回复、持续聊天，以及 Plan 提议、接受、改期与取消。
- **Me**：完整基本资料、学生认证、课程、语言、主题/图标/个人展示样式、隐私、安全和设置。

当前安装、生产部署、开关与实际入口见 [已部署功能清单](./docs/DEPLOYED_STATE.md)。
Preview 105 是当前已安装开发版：可用时间以青绿表示已选、琥珀表示当天部分已选，提供图例并适配深色模式。
点星期/日期可全选当天，再点清空，支持撤销与自动保存；交付及真机验收见 [Preview 105](./docs/releases/2026-10-15-preview105-availability-colors.md)。
游客分享、昵称和网页确认沿用 103；[完整真机验收](./docs/qa/2026-10-15-iphone14plus-guest-flow.md)保留为独立记录。
分享网页已默认中文，保留 English 切换并单独记住选择；[线上交付与验收](./docs/releases/2026-10-15-share-chinese.md)。
普通 SideSeat / TestFlight 97 为独立的旧分发版本。
多人时间征集位于「消息 → 一起定时间」；聊天中的「智能约时间」是个人日历空档推荐。

旧 Capacitor 工程、When2meet 网页实现及过期演示工具已移入
[只读归档](./archive/2026-10-15-retired/README.md)，停止开发与执行。
旧网页、客户端接口和历史数据依赖按功能清单标为保留兼容，默认冻结。

2026-10-02 控件用色约定：普通按钮、分页、筛选和收藏使用清晰的中性色；
深红底白字仅用于少数强调操作，避免浅粉底红字。品牌标志与语义状态色保留。
2026-10-15：可用时间编辑使用青绿表示已选、琥珀表示当天部分已选，并保留图标和图例。

## Architecture

- `ios-native/`：SwiftUI 原生 iPhone 客户端，最低 iOS 17。
- `app/api/`：Next.js App Router HTTP API 与公开链接入口。
- `lib/`：服务端领域逻辑、匹配、Plan、Calendar、消息与安全规则。
- `prisma/`：PostgreSQL Schema 和仅前向迁移。
- `openapi/v1.json`：原生客户端 API 的契约来源。
- `ios-native/SideSeat/Generated/OpenAPI/`：由 OpenAPI 生成，不手工编辑。
- `tests/`、`e2e/`、`ios-native/SideSeatTests/`、`ios-native/SideSeatUITests/`：
  服务端、API、Swift 和 UI 验证。
- `docs/`：产品、工程合同、设计、发布与运维文档。

生产服务运行在 Vercel 与 PostgreSQL/Neon 上。原生客户端、公开兼容页面和 API
共享同一账号及数据来源。

## Documentation authority

开始产品或工程修改前先阅读：

1. [AGENTS.md](./AGENTS.md) — 本仓库开发方式与归档边界。
2. [Deployed state](./docs/DEPLOYED_STATE.md) — 真实安装、部署、开关、入口与兼容清单。
3. [Documentation index](./docs/README.md) — 文档状态和权威顺序。
4. [Product](./docs/PRODUCT.md) — 定位、对象、导航、冻结规则与非目标。
5. [User Flow](./docs/USER_FLOW.md) — 当前完整交互逻辑。
6. [Roadmap](./docs/ROADMAP.md) — 当前实施顺序和进入下一阶段的门槛。

实现状态以当前代码、Schema、OpenAPI 和可复现测试结果为准。带日期的历史测试或
发布记录不能替代当前验证。

## Local development

Requirements:

- Node.js 22+
- npm
- Xcode 26+
- 本地或隔离 PostgreSQL 测试数据库

```sh
npm install
npm run db:start
npm run prisma:generate
npm run dev
```

常用检查：

```sh
npm run lint
npx tsc --noEmit --incremental false
npm run test:v2
npm run test:openapi:v1
npm run check:openapi:v1
```

原生工程：

```sh
ios-native/scripts/generate-openapi-client.sh
ios-native/scripts/generate-project.sh
```

详细构建方式见 [Native iOS](./docs/IOS.md)。

## Deployment and release

生产数据库迁移、Vercel Production 部署、远程通知、签名和 TestFlight 上传都是
明确的发布操作，必须针对本次目标获得授权，并记录实际环境与结果。不要依赖普通
Preview 或本地构建隐式迁移共享数据库。

- 发布与生产配置：[Release](./docs/RELEASE.md)
- 隐私申报：[Privacy](./docs/PRIVACY.md)

任何凭据、数据库 URL、APNs 私钥、Sentry Token 或测试账号密码都不得写入仓库。
