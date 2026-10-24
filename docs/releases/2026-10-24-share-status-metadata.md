# 分享网页：日期下方显示收集状态

分享网页现已与 App211 统一：活动名、独立地点、候选日期，以及日期下方灰点灰字「收集空闲 · 时区」。活动待定仍显示「选择活动」，原邀请／日历规则保持。产品源码 `55ac4667` 已推送；生产 `dpl_3y9L5UfyX7v1hhUPsXGVg7Cg27zz` READY，同一候选原样提升，api／www／根域名一致。1393项生产基线逐SHA1验证，只覆盖1个TSX并新增来源标记，1392项保持、上传1394项全部匹配；无迁移或后端规则改动。候选 Chromium／WebKit 32.032／32.653秒、正式31.519／31.826秒完整流程通过，三种布局及72次状态几何检查通过。窄屏已补真实视口验收；6个专用账号、18条链接401／404清理。原生仍为Preview211。

- **产品源码**：`55ac46672a925e39df3fcba981fb380539d1d93c`，已提交推送。
- **生产部署**：`dpl_3y9L5UfyX7v1hhUPsXGVg7Cg27zz`，READY；api／www／根域名同一已测Production构建，无迁移、业务规则或保护变更。
- **实际验证**：候选Chromium／WebKit 32.032／32.653秒、正式31.519／31.826秒；三种布局、72次metadata检查，真实游客填写／重开／跨天邀请／三种回复／主动发布／owner精确唯一Calendar。
- **图审**：84份原图实际打开；字节相同的对应最终PNG才复用已完成图审。窄屏真实视口补齐状态完整可见证据，未将fullPage固定栏遮挡误报为产品修复。原窄屏邀请按钮文字紧边观察保留，本项不是全站大字号视觉验收。
- **清理**：包括首次候选补验共6专用账号／18链接401／404；私有夹具与候选cookie／响应头清理。原生Preview211保持。

首次候选功能运行和访问预检的范围单独记录。产品只增加局部显示分支，复用原COLLECTING／FIXED／活动选择判断，旧邀请／关闭状态分支及所有身份、提交和Calendar规则保持；独立精简审查通过，没有新增状态／请求／组件／CSS／依赖。

[完整QA与实际图片](../qa/2026-10-24-share-status-metadata.md)、[来源哈希](../qa/evidence/2026-10-24-web-status-metadata/source-verification.json)、[正式部署与域名](../qa/evidence/2026-10-24-web-status-metadata/production-release.json)、[浏览器记录](../qa/evidence/2026-10-24-web-status-metadata/production-chromium-result.json)、[清理](../qa/evidence/2026-10-24-web-status-metadata/cleanup-summary.json)。
