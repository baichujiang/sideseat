# 游客聊天与计划邀请修复上线（2026-10-03）

延续用户已授权上线的意愿分享后端，根据本次消息延迟、邀请不可见和注册流程中断的反馈发布修复。

- 目标：Vercel Production，状态 READY。
- 部署：`dpl_FboLxfNxYRMfNi6GmtCA14ZXqyw4` / `https://sideseat-ll1h9tisz-baichus-projects.vercel.app`。
- 来源：`codex/ios-uxui-20260922` / `a273a55cbd98aee8533a03c841904dc8ebf43c96` 的当前分享文件；以此前生产 `dpl_D4NTYvfR6ZSKE8jMB5FA9sHeuxd4` 受控目录为基线，仅叠加 7 个分享相关文件。保留小红书 Universal Link 与此前后端修复，未带入其他会话的个人资料、日历或原生未发布变更。源文件哈希见验证目录。
- 受控目录：`/tmp/sideseat-guest-plan-release-20261003`。候选使用 `--prod --skip-domain`、`SKIP_DATABASE_MIGRATIONS=1`；认证边界验证与 READY 检查后 promote。晋升前再次核对生产基线未被并行发布替换。
- 构建约 3 分钟。CLI 中途日志连接报告 Not authorized，但部署继续；通过独立 inspect/构建日志确认最终成功后才晋升，未重发重复部署。
- 数据库：仅核对生产迁移状态，无结构变更/迁移。最新已应用迁移仍为 `20261002200000_intent_share`。既有恢复点 `br-square-king-ap1ow7vt` 保留。
- 00:17 CEST 生产端到端通过全部 14 项：真实官网匿名聊天、SSE 回复/邀请、注册保留身份、接受计划、双方 Calendar、意愿结束后保留对话、原生登录、取消更新与撤销中断。
- 00:17 CEST 公共健康检查通过：API 配置、Privacy、Support、AASA（含正式版/Preview 的 `/xhs/*`）、小红书回调落地页。
- 未构建、签名、安装或上传原生版本；现有 Preview 使用同一生产后端，刷新外部分享页面即可测试。

[验证说明](../qa/2026-10-03-guest-plan.md) · [发布证据](../qa/evidence/2026-10-03-guest-plan/)

生产部署错误日志查询（最近 15 分钟）未返回错误记录。该结果仅为本次发布检查，不代表新增持续监控。
