# 分享页访客语言更新

2026-10-04，Europe/Berlin。

意愿分享页已上线：首次打开跟随访客浏览器／系统语言；手动切换会记住选择，转发链接不携带语言限制。

- 源码：`6ab46843661165176d64cbdd2b0fb6e18a73a7dc`，已提交并推送 `codex/ios-uxui-20260922`。
- 正式部署：`dpl_ANYwksr5oKuz3PYZ8rqjschbzrun`，状态 `READY`；`https://www.sideseat.de` 与 `https://api.sideseat.de` 均回读为本部署。
- 候选地址：`https://sideseat-2ilvwo1zz-baichus-projects.vercel.app`。先以 `--prod --skip-domain` 构建，候选八项验证通过后 promote，正式域名再通过相同八项验证。
- 基线及回滚部署：`dpl_J84PyBHUAkJ29LZFVVdC6FbXXhHs`。比对 1863 个基线文件，只变更分享页、分享客户端与专用语言解析三个文件；未纳入工作区其他未完成修改。
- 云构建、lint 和正式类型检查通过。现有 146 个迁移已同步，本次无 schema/migration 变更且跳过迁移部署。
- 候选、正式验收各使用专用 QA 账号与隐藏意愿，均完成删除。API 配置、隐私、支持及 www AASA 四项检查通过。
- 发布验收后查询本部署最近 15 分钟 error 日志为 0 条；仅为短时检查。
- 原生 App 未修改，继续使用已安装的 **Preview 95**；此次没有重新打包或安装手机 App，在线分享页直接生效。

[测试记录](../qa/2026-10-04-share-locale.md) / [候选验证](../qa/evidence/2026-10-04-share-locale/candidate-smoke.json) / [正式验证](../qa/evidence/2026-10-04-share-locale/production-smoke.json) / [来源比对](../qa/evidence/2026-10-04-share-locale/backend-source-proof.json)。
