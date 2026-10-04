# 打开 SideSeat 按钮突出品牌色

2026-10-04，Europe/Berlin。

注册成功弹窗与页面底部的“打开 SideSeat”统一使用 App 玫红主题色 #FB4185、黑色加粗文字。手机视口实测两个入口均突出显示。

- 源码：`672ebb9b141403f3969cc526335d43c309168291`，已推送 `codex/ios-uxui-20260922`。
- 正式部署：`dpl_jpLansrzskyM1RLFYH5kpQNaDxPY`，`READY`；`www.sideseat.de` 和 `api.sideseat.de` 已回读确认。
- 候选：`https://sideseat-p3u4wouez-baichus-projects.vercel.app`；检查通过后 promote，再做正式浏览器验收。
- 回滚：`dpl_HZTvSkZGU4JA5ACJrQ2X2bcGgTUT`。受控发布仅覆盖两个分享页面文件，共 1865 个文件比对确认。146 个已有迁移同步，无 schema / migration 变更，显式跳过迁移部署。
- 既有本地注册衔接用例 1/1 通过，8.6 秒；相关 ESLint、diff whitespace 通过，生产构建及类型检查通过。未新增样式测试。
- 候选 11 项检查通过；正式双账号浏览器验证通过：匿名联系、注册成功引导、新账号原生 API 登录、回复后对应聊天链接、刷新保留消息及入口。无浏览器脚本异常，手机视口无横向溢出；已查看正式环境两个按钮截图。
- 候选和正式 QA 账号均已删除；本地测试账号清理完成，临时开发服务已关闭。
- API 配置、Privacy、Support、AASA 全部 200。交付时该部署最近 15 分钟 error 日志 0 条，仅为短时检查。
- 沿用已安装的 **Preview 96**，无需重新安装；刷新分享页即可查看。本阶段没有原生变更、安装或真机跨 App 点击验收。

[设计与本地验证](../qa/2026-10-04-app-open-brand.md) · [交付证据](../qa/evidence/2026-10-04-app-open-brand/delivery.json)。
