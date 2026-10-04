# Preview 96：用户名输入阶段查重

2026-10-04，Europe/Berlin。

分享页和原生注册页在输入用户名时检查是否可用，停顿 400ms 或离开输入框时触发。重名、检查中和格式不合法时阻止提交；网络检查失败时保留最终提交验证。

- 源码提交：`9dbcf5ab8a1b3b955b85beb903bacbaec378dd7e`，已推送 `codex/ios-uxui-20260922`。
- 后端：`dpl_DYWJ3mJArxUhdSHHNWBebghRgPvd`，`READY`；正式 `www.sideseat.de` 与 `api.sideseat.de` 均回读到该部署。
- 候选：`https://sideseat-jnntvlvun-baichus-projects.vercel.app`。从上一个正式发布内容构建，只有 5 个后端/分享页面文件变化。先 `--prod --skip-domain`，候选验收后 promote；正式再验收。
- 回滚部署：`dpl_ANYwksr5oKuz3PYZ8rqjschbzrun`。146 个已有迁移同步，本次无 schema/migration 变更，显式跳过迁移部署。
- 候选与正式各四项查重/最终注册校验通过，QA 账号均删除；API 配置、Privacy、Support、AASA 四项健康检查通过。交付后最近 15 分钟部署 error 日志为 0 条，仅为短时检查。
- App：`app.sideseat.mobile.preview` / `1.0.0 (96)`，API `https://api.sideseat.de`。签名及设备描述文件通过，293 个原生文件与源码提交一致。
- 16:53 安装到 iPhone 16 Pro Max / iOS 26.0.1；回读 Build 96，16:54 正常启动，无 UI 测试参数，进程 `25449` 回读存在。真机验收为安装、版本及启动，不计作真机完整注册交互验证。
- 本地浏览器/API 3 项、认证会话 12 项、原生 UI 2 项通过。新原生用例前三轮键盘焦点失败与调整详见测试记录；未隐去失败轮次。任务专用本地服务器、数据库进程及 QA 账号已清理。

[测试记录](../qa/2026-10-04-username-availability.md) / [交付证据](../qa/evidence/2026-10-04-username-availability/delivery.json)。
