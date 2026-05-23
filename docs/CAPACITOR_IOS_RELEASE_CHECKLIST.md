# SideSeat iOS（Capacitor）上架前检查清单

在 **项目仓库** 里完成网页与配置；在 **Xcode** 里完成签名、图标与打包。  
打勾表示你已自测通过。

---

## 1. 环境与部署（后端 / 线上）

- [ ] 生产环境已部署且稳定（Vercel / 自建均可），HTTPS 有效
- [ ] `DATABASE_URL`、迁移已应用到生产库（`npx prisma migrate deploy`）
- [ ] `SESSION_SECRET`（及可选 `ACCESS_TOKEN_SECRET`）生产环境已设置且未泄露
- [ ] `NEXT_PUBLIC_APP_URL` = **与 App 加载的域名完全一致**（含 `https://`，无尾斜杠歧义）
- [ ] 邮件 OTP：`RESEND_API_KEY`、`EMAIL_FROM` 在生产可用
- [ ] 若用手机号注册：`Twilio`（或你们实际短信商）生产配置已测
- [ ] Stripe 打赏/支付：生产用 **Live** key（若上线该功能）
- [ ] 自然语言日程：`DASHSCOPE_API_KEY` 等 LLM 配置在生产可用（若上线该功能）

---

## 2. Capacitor 壳配置（改仓库 → 再 sync）

- [ ] `capacitor.config.ts` 中生产 `CAPACITOR_SERVER_URL` 指向正式域名（不是 localhost）
- [ ] 已执行：`CAPACITOR_SERVER_URL=https://你的域名 npm run cap:sync`
- [ ] 打开 `ios/App/App/capacitor.config.json`，确认 `server.url` 为生产地址
- [ ] `appId`（`app.sideseat.mobile`）与 Apple Developer 里 Bundle ID 一致
- [ ] 未在 Xcode 里单独改 `capacitor.config.json` 后忘记回写到仓库（避免下次 sync 被覆盖丢失）

---

## 3. 网页与 iOS WebView 体验（改仓库，浏览器 + 真机）

### 布局与安全区

- [ ] 首页顶部问候、日历块 **不压** 状态栏 / 灵动岛（`CapacitorBootstrap` + `--safe-top`）
- [ ] 底部 Tab 不被 Home 指示条挡住（`--safe-bottom`）
- [ ] 全屏聊天 / 课程聊天：顶栏与输入框安全区正常

### 手势与控件

- [ ] 周视图：**双指** 缩放时间格（模拟器：⌥ + 拖动）
- [ ] 周视图下方「显示 N 天」蓝条：**按下即横向拖**，长按不出现系统滑块放大镜
- [ ] 日程长按、聊天长按菜单（若有）在真机可用
- [ ] 主要列表滚动顺畅，无明显误触浏览器返回手势

### 账号与业务

- [ ] 注册：昵称唯一、登录用户名自选、邮箱/手机 OTP 完整走通
- [ ] 登录：用户名 / 邮箱 / 手机 + 密码
- [ ] 登录态刷新：杀进程重开 App 仍保持登录（cookie / refresh）
- [ ] 访客 → 注册/登录 流程正常
- [ ] 偏好与账户：可查看/修改 **登录用户名**、登录邮箱
- [ ] 联系人搜索：能按昵称搜到用户（昵称唯一策略）
- [ ] 核心 Tab：Home、Courses、Discover、Chats、Me 各走一遍主流程

### 外链与支付

- [ ] Stripe 结账（若启用）在 App 内可完成或正确跳转 Safari 后返回
- [ ] 分享到微信等（若启用）行为符合预期

---

## 4. 真机必测（不要只测模拟器）

- [ ] 同一 Wi‑Fi 下用真机连过开发服（可选）后，**至少用 TestFlight 或 Release 包测生产 URL**
- [ ] iPhone 刘海 / 灵动岛机型各测一台（若可）
- [ ] 弱网、断网：有合理错误提示，不白屏卡死
- [ ] 键盘弹出时：登录框、聊天输入不被挡住
- [ ] 深色模式（若支持）：主要页面可读

---

## 5. 推送与系统能力（按需）

- [ ] **Web Push**：在 App 内订阅/收通知（WKWebView 常与 Safari 不同，需真机验证）
- [ ] Xcode：**Push Notifications** capability + **Remote notifications** background mode；真机/TestFlight 需付费开发者账号
- [ ] 数据库已跑迁移 `NativePushDevice`；服务端 APNs 发送仍未实现（勿在上架文案承诺推送已可用）
- [ ] 相机/相册上传头像（若有）：考虑后续插件；当前若仅 `<input type="file">` 需在真机点一次上传

---

## 6. Xcode 与 Apple 账号（改 Xcode / Developer 网站）

- [ ] Apple Developer  programa 有效，Bundle ID 已注册
- [ ] Xcode：**Signing & Capabilities** 已选 Team，Automatic signing 成功
- [ ] **App 图标**（`Assets.xcassets`）已替换为正式素材
- [ ] **启动图 / Splash** 与品牌一致（Capacitor Splash 插件已装则可调）
- [ ] `Info.plist` 权限描述完整（若用到相机、相册、推送等，需对应 `NS*UsageDescription` 中文/英文文案）
- [ ] 版本号 `CFBundleShortVersionString` / `CFBundleVersion` 与发版计划一致
- [ ] **Archive** 成功 → **Validate App** 无阻塞错误
- [ ] 上传 **TestFlight**，内测账号跑完第 3、4 节主流程

---

## 7. App Store Connect 与合规

- [ ] 应用名称、副标题、描述、关键词、截图（6.7" / 6.5" 等必填尺寸）
- [ ] 隐私政策 URL（可链到站内 `/about` 或独立页）
- [ ] **App 隐私问卷** 与真实数据收集一致（邮箱、手机、用户内容等）
- [ ] 登录账号：若只用自有账号，按审核指引提供 **测试账号** 给审核员
- [ ] 年龄分级、出口合规、内容版权说明已填
- [ ] 若 App 主要为 Web 壳：描述中写清功能，避免被判定为空壳（需有实质学生社交/日程能力）

---

## 8. 安全与运维

- [ ] `.env` 未提交进 Git；生产密钥在托管平台配置
- [ ] 生产关闭调试入口、示例 seed 账号不可被公网滥用
- [ ] 错误监控（Sentry 等，若有）已接生产
- [ ] 回滚方案：上一版 Web 部署 + 必要时上一版 IPA

---

## 9. 发版当日顺序（建议）

1. 部署并通过 smoke 测试 **Web 生产**
2. `CAPACITOR_SERVER_URL=https://生产域名 npm run cap:sync`
3. Xcode Archive → Upload TestFlight → 内测确认
4. 提交 App Store 审核（Web 可先上线，审核通过后用户即看到最新网页）
5. 记录：本次 IPA 版本号 + 对应 Web 部署 commit

---

## 10. 不必为此重写 Swift

以下问题 **优先在项目里修**，只有单列能力实在无法满足再考虑原生插件或局部 Swift：

| 问题 | 处理位置 |
|------|----------|
| 安全区、CSS、手势、业务逻辑 | 仓库 `app/`、`components/`、`globals.css` |
| 加载哪个域名 | `capacitor.config.ts` + `cap sync` |
| 图标、签名、Archive | Xcode `ios/App` |

---

相关文档：[CAPACITOR_IOS.md](./CAPACITOR_IOS.md)
