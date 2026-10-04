# 分享页面减少说明、突出下一步

2026-10-04，Europe/Berlin。

首屏突出事件、时间与“联系我”；聊天收起重复说明，App 入口缩成一行；注册成功突出“打开 SideSeat”，保留必要登录信息，打开帮助折叠。“添加日程”和“留在网页”为次级文字操作。

- 源码：`1f082624ff60f36387bf4e2c7c7f0620065310c3`，已推送 `codex/ios-uxui-20260922`。
- 正式部署：`dpl_HZTvSkZGU4JA5ACJrQ2X2bcGgTUT`，`READY`。`www.sideseat.de` 和 `api.sideseat.de` 已回读确认。
- 候选：`https://sideseat-4j9ud7j4i-baichus-projects.vercel.app`；候选检查通过后 promote，再做正式浏览器验收。
- 回滚：`dpl_2xsttrcgHvv9rpo3CWojEFmBDTVE`。以该发布内容建立受控目录，只覆盖三个分享页面文件；发布目录共 1865 个文件已比对确认。146 个已有迁移同步，无 schema / migration 变更，构建显式跳过迁移部署。活动目录的其他未完成工作未混入发布。
- 本地 8/8 回归通过，34.9 秒；相关 ESLint、TypeScript、diff whitespace 通过。已检查首屏、游客聊天、注册成功、注册后聊天的手机视口截图。
- 正式双账号浏览器验证通过：匿名联系、注册后成功引导、新账号原生 API 登录、回复后对应聊天链接、刷新保留消息及入口。无浏览器脚本异常、无横向溢出。候选和正式 QA 账号均已删除。
- API 配置、Privacy、Support、AASA 全部 200。交付时该部署最近 15 分钟 error 日志 0 条，仅为短时检查。
- 沿用已安装的 **Preview 96**，没有原生二进制变更，不需要重新安装；刷新分享页即可查看。这次未操作真机，未将浏览器链接断言当作实际跨 App 点击验收。

[测试与设计记录](../qa/2026-10-04-share-focus.md) · [交付证据](../qa/evidence/2026-10-04-share-focus/delivery.json)。
