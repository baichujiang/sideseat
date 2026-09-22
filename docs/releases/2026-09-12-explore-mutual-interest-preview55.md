# 探索与推荐统一双向感兴趣 — Preview 55

日期：2026-09-12。状态：实现、生产发布、双账号 API 验证和手机 Preview 55 安装完成。用户明确要求按已讨论的统一双向选择机制执行；沿用本任务正式后端与手机 Preview 的发布授权，未进行 TestFlight/App Store 分发。

## 用户行为

- 真人探索卡显示“感兴趣”，点击直接私密保存当前选择，保持在探索页；不打开新建表单，不新增“我的意愿”卡片，不开启自动匹配。
- 如果已有相同目标的推荐机会，复用其 ID 和已有选择。否则创建一个同行机会，仅记录当前用户的 YES，对方在推荐页独立选择。
- 探索与推荐使用相同机会状态：未选择、私密保存、双方感兴趣、不可用。探索保存后可直接“在推荐中查看”；推荐撤回后重新进入/刷新探索会同步状态。
- 双方独立 YES 后沿用现有聊天建立、活动上下文卡和后续 Plan/日历流程。公开自己的意愿不视为已经同意与任何人同行。
- 新建的探索机会在双方确认前，API 也隐藏姓名、照片和个人资料。对方的单向选择始终不返回给当前用户。
- 示例卡明确显示“示例 · 无真实参与者”和“创建类似意愿”；服务端拒绝为示例/不具备真实参与资格的作者创建机会。

## 实现与数据

- 新增 `POST /api/v1/explore/intents/{intentId}/interest`，认证、功能开关、幂等性、同校/公开资格、双向拉黑及结束关系检查均在服务端执行。
- 使用现有 `MutualOpportunity` 与 `MutualOpportunityDecision`，不新增一套请求/接受状态机。配对锁串行化并发点击，既有机会重复点击不新增卡片或聊天。
- 现有推荐数据结构要求双方意愿引用，因此没有已有机会时只创建本次探索选择的私密支撑记录，标记 `WeeklyIntent.exploreResponseToId`。该记录排除于“我的意愿”、普通意愿数量限制和全部自动/旧会话匹配候选查询；时间保持待商量，不复制他人的精确可用时间或课程归属。
- 原有暂停、结束、拉黑、撤回、机会占用和拒绝冷却规则继续适用。原有 ENDED 关系不重新激活。
- OpenAPI 已同步并重新生成 Swift 客户端；英文、中文、德文文案已补齐。

唯一迁移：`20260912020000_explore_mutual_interest`，仅新增可空文本列，不更新既有意愿。正式库执行前确认唯一待迁移项，保存并读回校验局部逻辑备份；迁移后逐行验证原有 53 条意愿与 21 条机会内容不变，所有新列值为 null，迁移账本无待应用项。

备份包含两表记录、列/索引定义和 Prisma 账本，位于：

`/Users/baichu/Library/Application Support/SideSeat/backups/explore-interest-2026-09-12T13-06-23.386Z-ecf199/intentions-opportunities-before.json`

SHA-256：`e8b27a9088c2b04ab14e43d5ab0268e9afee71ce28677c315151133aa12a0c45`。目录 0700、文件 0600；这是局部逻辑备份，不是全库恢复演练。数据与凭据不进入 Git。

## 验证

- 独立本地 PostgreSQL 主流程验证：8 通过，0 失败；首次示例测试因专用库名保护跳过，随后在命名正确的独立库完成。
- 匹配、聊天、计划、双方日历、Explore 示例和 OpenAPI 回归：35 通过，0 失败，0 跳过。
- 最终身份隐私调整后重跑探索交互集成：3 通过，0 失败。覆盖并发重复点击、复用已有推荐、独立双向 YES 建立唯一聊天、撤回同步、私密/暂停/拉黑/示例边界和不加入匹配。
- TypeScript、修改范围 ESLint、OpenAPI 检查通过，契约覆盖 172 个已实现操作。
- 两项 iOS UI 测试通过：真人点击私密保存并在推荐页显示同一机会，无新建表单；示例创建仍可用，默认不公开到探索。截图已复核。独立模拟器首次启动耗时约 8 分钟，测试本身共 59 秒；完成后只关闭本任务的模拟器。
- 生产 `test_001` / `test_003` 正常登录后通过：发布临时内部 QA 意愿、探索感兴趣、幂等重放与重复点击、双方推荐状态、单方选择/身份隐私、不新增普通意愿、撤回后的探索同步，以及双方 Plans/inbox/日历读取。仅结束本次创建的测试源意愿和私密支撑记录，临时会话均已撤销。生产验证未创建双向聊天或发送人工消息；双向聊天已在本地真实 PostgreSQL 验证。
- 首次使用 `test_001` / `test_002` 时，既有 ENDED 关系按规则返回 404。只读核实原因后改用可用测试对；未重置旧关系或绕过保护，首次临时记录与会话同样已清理。
- Client config、AASA、Privacy、Support 均 HTTP 200；功能开关与发布前完全一致。最终部署从 13:11 UTC 至本轮核查的 Vercel 5xx 聚合为空，此为短期发布检查。

截图：[点击前](../visual-qa/explore-real-interest-before.png)、[保存后](../visual-qa/explore-real-interest-saved.png)。

## 发布与手机交付

- 来源：`891b627` 加当前工作区；后端快照 `/tmp/sideseat-explore-interest-release-20260912`，逐文件 SHA-256 `/tmp/sideseat-explore-interest-source-manifest.json`。保留本任务前的长期意愿和同行设计，以及当前个人资料 UI。
- 正式 API：`https://api.sideseat.de`。
- 部署：`dpl_HnCst6Nzav1ZBHRLTm1kD6VgVve3`，[部署地址](https://sideseat-np4myvgfc-baichus-projects.vercel.app)。已核实生产域名指向此 READY 部署。
- 构建使用 `--prod --skip-domain`、`SKIP_DATABASE_MIGRATIONS=1`，验证配置与未认证 POST 的 401 后 promote。首次打包忽略规则误排除了 `app/ios` 网站入口，已将忽略项限定为仓库根目录并重新构建；失败部署未切换生产。
- iPhone 16 Pro Max 上 `SideSeat Preview` / `app.sideseat.mobile.preview` / **1.0.0 (55)** 已安装并启动；签名严格校验通过，API 地址已核验。普通 SideSeat 保持 1.0.0 (41)。
- 保留安装包 `/tmp/sideseat-explore-interest-preview55/SideSeat.app` 和原生源文件哈希；真机核验覆盖安装身份与启动，逐屏交互/视觉验证在独立模拟器完成。

关键收据已归档到备份目录的 `release-receipts/`，原始构建、测试、迁移和部署日志以前缀 `/tmp/sideseat-explore-interest-` 保存。

如需停止新探索选择，应在当前新代码上关闭 Explore 并重新部署，保留安全读取/撤回能力及现有数据。新增来源记录出现后，不应直接回滚到忽略该标记的旧后端，以免旧版将私密支撑记录误列入普通意愿或旧会话匹配。
