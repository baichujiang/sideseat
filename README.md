# SideSeat

> 让每一段校园时光，都有人同行。

SideSeat 是面向大学生的校园同行产品。用户从一个具体、短期的意愿开始，
在双方独立同意后进入带上下文的沟通，确认 Plan，并把真实承诺写入双方日历。
长期目标不是制造更多匹配，而是让一次共同经历自然发展成下一次适合的同行，
让原本陌生的校园逐渐充满熟悉的人。

当前核心链路：

```text
Weekly Intent
→ 48 小时主动匹配
→ private Mutual Opportunity
→ bilateral consent
→ contextual Messages
→ Plan confirmed
→ both Calendars
→ Outcome
→ Meet Again（下一阶段）
→ Familiar Face / Repeat Opportunity（下一阶段）
```

SideSeat 不提供人物广场、滑动匹配、课程大群、同学名单或公开社交关系图。
课程提供匹配与课表上下文；Calendar 是承诺的可靠承载层，不是推荐入口。

## Product surfaces

原生 iPhone App 使用四个稳定入口：

```text
Together / 同行   Calendar / 日历   Messages / 消息   Me / 我
```

- **Together**：管理多个短期意愿、开启或停止 48 小时匹配、决定有限的同行机会。
- **Calendar**：个人日程、课程、确认后的 Plan、搜索以及 Apple Calendar 互操作。
- **Messages**：双方同意后的上下文沟通、Plan 提议、接受、改期与取消。
- **Me**：身份、学生认证、课程、语言、隐私、安全和设置。

旧 Next.js 页面和 Capacitor 工程仅作为回归及紧急兼容路径，不是当前正式用户界面。

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

1. [AGENTS.md](./AGENTS.md) — 本仓库开发方式。
2. [Documentation index](./docs/README.md) — 文档状态和权威顺序。
3. [Product](./docs/PRODUCT.md) — 定位、对象、导航、冻结规则与非目标。
4. [User Flow](./docs/USER_FLOW.md) — 当前完整交互逻辑。
5. [Roadmap](./docs/ROADMAP.md) — 当前实施顺序和进入下一阶段的门槛。

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
