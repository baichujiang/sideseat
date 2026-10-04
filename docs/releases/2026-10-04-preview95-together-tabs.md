# Preview 95：同行切换栏铺满

2026-10-04，Europe/Berlin。

保留现有字号，修复「我的意愿／推荐／我的收藏」挤在中间的问题，按钮及选中背景随可用宽度展开。

- App：`app.sideseat.mobile.preview` / `1.0.0 (95)`。
- 原生布局变更，正式 API 继续使用 `https://api.sideseat.de`，没有发布后端或数据库变更。
- 模拟器真实界面检查、构建状态及旧测试失败见[测试记录](../qa/2026-10-04-together-tabs-width.md)。
- 源码提交：`dc8daabc7b646702b7da8f1de06b44fa6887205c`，已推送 `codex/ios-uxui-20260922`。
- 签名包校验通过，293 个受版本控制的原生文件与该提交一致；描述文件包含目标手机。
- 后端沿用 `dpl_J84PyBHUAkJ29LZFVVdC6FbXXhHs`，交付时查询为 `READY`。
- 16:04（Europe/Berlin）覆盖安装到 iPhone 16 Pro Max / iOS 26.0.1，回读确认 Build 95，正常启动，无 UI 测试参数。16:05 再次确认进程 PID 25191 正在运行。
- 当前导航回归 1 项通过，中文、英文深色及德文最大字号界面检查通过；旧首次使用用例的过时文案断言失败已记录。真机验收范围是安装、版本和启动，未计作真机完整交互验收。
- [交付证据](../qa/evidence/2026-10-04-together-tabs-width/delivery.json)。
