# SideSeat 使用方式与数据互通

SideSeat 是 **一套线上服务**，可以用多种方式打开，业务数据共用同一数据库与账号体系。

## 三种入口

| 方式 | 说明 | 适合谁 |
|------|------|--------|
| **浏览器** | 直接访问网站（Safari / Chrome 等） | 临时使用、桌面端 |
| **添加到主屏幕（PWA）** | 仍是同一网站，全屏图标打开 | 不想装 App Store、但想像 App 一样点开 |
| **App Store（Capacitor）** | 原生壳内的 WebView 加载 **同一线上地址** | 习惯从商店安装、要原生图标与更新渠道 |

## 数据是否互通？

**是** — 只要满足：

1. 登录 **同一个账号**（邮箱 / 手机 / 用户名，不是三套注册）
2. 访问 **同一套生产环境**（见下方「生产配置」）

互通内容包括：课表、消息、发现、个人资料、课程聊天等。

登录态按 **设备** 分开（例如 Mac 浏览器 + iPhone App 各一条 Session），与微信网页版和手机版同时在线类似，属于正常现象。

## 各入口差异（不是三套数据）

| 项目 | 浏览器 / PWA | App Store 应用 |
|------|----------------|----------------|
| 安装方式 | 地址栏 /「添加到主屏幕」 | 商店下载 |
| 页面与 API | Next.js 同一套 | WebView 加载同一域名 |
| 推送 | 浏览器 Web Push（「我」里开关） | 系统「设置 → SideSeat → 通知」；后续可接 APNs |
| 更新 | 部署网站即可（可选 Service Worker） | 商店发版 + 网站后台仍即时生效 |

App 内 **不显示**「添加到主屏幕」相关入口（已从 App Store 安装）。

## 生产配置（必对齐）

打包 iOS 前，以下变量必须指向 **同一个 `https://` 域名**（无尾斜杠）：

```bash
NEXT_PUBLIC_APP_URL=https://your-production-host
CAPACITOR_SERVER_URL=https://your-production-host
```

执行：

```bash
CAPACITOR_SERVER_URL=https://your-production-host npm run cap:sync
```

并在 Xcode 中确认 `ios/App/App/capacitor.config.json` 的 `server.url` 一致。

本地开发（`localhost`）与生产是两套环境，数据不自动互通。

## 开发文档

- Capacitor 安装与真机调试：[CAPACITOR_IOS.md](./CAPACITOR_IOS.md)
- 上架检查清单：[CAPACITOR_IOS_RELEASE_CHECKLIST.md](./CAPACITOR_IOS_RELEASE_CHECKLIST.md)
