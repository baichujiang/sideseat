# 小红书 Universal Link 配置（2026-10-02）

用户在确认小红书申请表的回跳地址后明确要求「那你配置吧」。本次将 `https://www.sideseat.de/xhs/` 的网站关联配置上线，并补全申请草稿。

## 发布范围

- 生产部署：`dpl_D4NTYvfR6ZSKE8jMB5FA9sHeuxd4`，构建 URL `https://sideseat-nzsht1mku-baichus-projects.vercel.app`。
- 基线为当前生产 `dpl_E7gKLADCsaYt57px2kqAdqNj9tsJ` 的受控发布目录，保留意愿分享及既有生产修复，只叠加本次五个文件。当前工作区分支保持 `codex/ios-uxui-20260922`，其他未提交工作未加入发布。
- AASA 为正式版 `V4238R5R53.app.sideseat.mobile` 增加 `/xhs/*`；为 Preview `V4238R5R53.app.sideseat.mobile.preview` 增加仅限该路径的关联。既有正式版链接规则保持不变。
- `/xhs` 及子路径公开可访问，使用现有原生 App 落地组件，并提供 `sideseat://home` 打开入口。页面不读取 SDK 回调参数，不要求网页登录。
- 没有数据库变更。候选及生产构建显式 `SKIP_DATABASE_MIGRATIONS=1`；未运行迁移、重新签名、安装或上传原生 App。

## 验证结果

- 5 项原生网页交接测试、目标文件 ESLint、受控候选的 TypeScript 检查通过。
- Vercel 生产候选构建通过，受保护候选的 AASA 和回跳页面 HTTP 检查通过后执行 promote。
- 23:41 CEST 线上验证：官网 AASA 无重定向返回 JSON 200；两种 bundle 均匹配 `/xhs/*`；子路径 `/xhs/sdk-verification` 返回 200；API 配置、Privacy、Support 返回 200。
- 浏览器访问 `/xhs/` 会按 Next.js 的既有规则 308 到 `/xhs` 后显示 200 落地页。登记地址仍保留小红书要求的结尾 `/`，SDK 追加的子路径直接返回 200。AASA 地址没有重定向。
- 23:43 CEST Apple 的关联域名 CDN 返回 200，已包含正式版和 Preview 的新 `/xhs/*` 规则。
- 已核对 Preview 84 安装包签名及 entitlements：包含 `applinks:www.sideseat.de`，无需为本次网站关联规则重新构建 App。
- 通过浏览器核实了线上落地页及打开 App 链接。未声称已执行真机的 SDK 分享回调；小红书 AppKey 尚未取得，原生 SDK 初始化和回调转交将在接入时完成。已安装设备也可能保留本机关联缓存。

## 申请草稿

小红书表单选择「客户端 SDK」，应用为 SideSeat，包含正式版与 Preview 的两个 iOS 包名，Universal Link 已填 `https://www.sideseat.de/xhs/`。移除了空 Android 项。企业联系人资料沿用用户确认内容，未在仓库记录完整私人联系方式。申请停在「下一步」之前，尚未提交审核。

[发布与核实证据](../qa/evidence/2026-10-02-xhs-universal-link/)
