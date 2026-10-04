# 分享获客验收中的意愿时间过期修复

2026-10-04，Europe/Berlin。

分享获客主流程发现两类未修复的大问题：快速注册用户被原生校园资料／认证页面拦住，分享所选时间也没有带入计划草稿。本次发布只处理另一个已复现的小问题：数据库时区导致未来意愿提前或延后过期。完整闭环仍未通过，详见[验收报告](../qa/2026-10-04-share-acquisition.md)。

## 已上线后端

- 正式 API：[api.sideseat.de](https://api.sideseat.de)，公开分享站点：[sideseat.de](https://sideseat.de)。
- 状态 READY；部署 `dpl_5PfSBjdqFonYm4BhyMfFpvEyBTkG`，候选地址 `https://sideseat-b48028pwy-baichus-projects.vercel.app`。
- 修复源码提交 `5ec86688ecfe1b289d649e01b971a751efbb3279`，已推送 `origin/codex/ios-uxui-20260922`。
- 从上一正式部署 `dpl_56ce6g2JaUMRuQMCbofBftrMMq1s` 的受控源码建立候选，比较 1,860 个基线文件，仅修改 `lib/v2/weekly-intents.ts`。活跃工作区与候选的 79 个分享获客相关后端文件一致，未夹带资料外观等未完成修改。
- 使用生产环境构建候选并跳过域名切换。Prisma 检查 146 条迁移已同步，`SKIP_DATABASE_MIGRATIONS=1`，没有迁移或修改历史数据。
- 候选 7 项真实 HTTP 验证通过后，再核对正式域名仍指向原部署，执行 promote。正式域名再次通过 7 项检查，包含注册登录、未来明确时间意愿、刷新保留 ACTIVE、公开链接、匿名页面活动与时间、分享后状态和原生 client-config。生产复测完成于 12:50 CEST，临时 QA 账号均已通过账户删除 API 清理。
- 首次候选 smoke 的预期域名误写成 API 域名；实际分享 URL 使用 `sideseat.de`，属于测试假设错误。清理该测试账号后改正断言重跑通过，没有更改产品域名。
- 上线后 client-config、Privacy、Support、AASA 全部 HTTP 200；部署最近 15 分钟 error 日志查询返回 0 条。这里只记录上线时检查，不代表长期监控。

## Preview 与验收

- 原生产品代码仍是 `6ecd35884cb2f722196afa025c9e70d81a0d5b49`，Preview 93；本轮只增加测试与后端修复，没有创建 Preview 94、重新安装手机或上传 TestFlight。
- 手机 Preview 93 使用正式 API，重新加载意愿时即可使用新的过期判断。
- 本地修复回归 23 项通过，0 失败、0 跳过；UTC、柏林、纽约数据库会话均覆盖。
- 原生阶段验收保留真实失败：3 项通过、1 项失败，失败原因是快速注册账号没有校园资料／认证而无法进入 App。发布者原生日程、与已注册游客的网页聊天及持久化另行验证通过。

[源码、候选、上线与验收证据](../qa/evidence/2026-10-04-share-acquisition/)。受控后端源码位于 `/tmp/sideseat-share-expiry-backend-release-20261004/`；如需回退，上一正式部署 ID 见上文，本轮未执行回退演练。
