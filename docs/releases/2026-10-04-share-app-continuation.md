# 分享注册后的 App 引导发布

2026-10-04，Europe/Berlin。

注册成功显示账户确认、用户名、首次 App 登录说明以及“打开 SideSeat / 继续在网页使用”。等待回复也有入口；已有聊天定位对应连接；添加日程后进入日程。关闭引导或刷新后仍可看到 App 入口。

- 引导源码提交：`59e8fab96b508847ea8432a2c0541abe53a3aa2b`。
- 最终源码提交：`7e1917f9cb9950d6cec09a9c2d13206c9449fbc0`，补上生产验收发现的隐藏日程表单时区差异。两阶段均已推送 `codex/ios-uxui-20260922`。
- 正式部署：`dpl_2xsttrcgHvv9rpo3CWojEFmBDTVE`，`READY`。`www.sideseat.de` 与 `api.sideseat.de` 均回读到该部署。
- 候选：`https://sideseat-1r1qqr7eh-baichus-projects.vercel.app`。候选 11 项检查通过后 promote，随后正式两账号浏览器复跑通过。
- 首次上线 `dpl_6YuMhwWnABskyEg9FxWjf33JSmPN` 的功能链路通过，但发现 React #418；已由最终部署替换。任务开始前的正式部署为 `dpl_DYWJ3mJArxUhdSHHNWBebghRgPvd`，可用于回滚。
- 两次构建均从前一正式发布内容建立受控目录。第一阶段仅覆盖三个分享页面文件，第二阶段仅改一个页面文件；未部署活动目录的其他未完成工作。146 个现有迁移同步，本次没有 schema / migration 变更，显式跳过迁移部署。
- 本地最终 8/8 通过，服务器 UTC、新引导用例浏览器 Asia/Shanghai；相关 TypeScript / ESLint 通过。正式手机视口浏览器复查注册成功、原生 API 登录、收到回复后定位聊天、刷新保留账户及消息，无页面脚本异常、无横向溢出。首次失败及修复过程保留在测试记录。
- 候选及正式 QA 账户均已删除。正式 API 配置、Privacy、Support、AASA 全部 200。最终部署交付时最近 15 分钟 error 日志 0 条，仅为短时检查。
- 原生沿用已安装的 **Preview 96**，现有路由兼容。本次没有改原生二进制、重新安装或操作手机，没有将浏览器链接断言算作真机浏览器打开 App 验收。无需重装，刷新分享页即可使用新引导。

首次进入 App 仍需使用新注册的用户名和密码登录；没有传递浏览器登录态。正式环境尚未配置公开 iPhone 安装链接，未安装用户看到获取安装方式及继续网页的说明。

[测试记录](../qa/2026-10-04-share-app-continuation.md) · [机器可读交付证据](../qa/evidence/2026-10-04-share-app-continuation/delivery.json)。
