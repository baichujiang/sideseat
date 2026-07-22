# SideSeat Native UI Design System

目标：用**系统控件结构** + **自家 Design Tokens**，把品牌收敛到认证面与关键 CTA；主产品区干净、可复用、平台感强。

实现入口：

| 路径 | 职责 |
|------|------|
| `SideSeatTheme.swift` | Token、渐变、Chrome tint、BrandMark / CardBackground（**已冻结**） |
| `Components/` | `SSPrimaryButton`、`SSSecondaryButton`、`SSTextField` / `SSSecureField`、`SSCard`、`SSListRow`、`SSEmptyState`、`SSSectionHeader` / `SSGroupedSection`、`SSScreen` / `SSBrandAtmosphere` |
| `Features/Calendar/CalendarChrome.swift` | 日历网格 metrics / 字号 / 选中态（**已冻结**） |

---

## 1. 设计原则（锁定）

| 原则 | SideSeat 含义 |
|------|----------------|
| 一套强调色 | 交互强调只用 Rose `#FB4185`（`AccentColor` / `SideSeatTheme.accent`）；珊瑚/品红/紫粉仅作品牌装饰 |
| 每屏一主任务 | Home=日程；Discover=找人/活动；Chats=对话；Me=个人枢纽；Create=发帖入口 |
| 组件复用 | 同一套 Primary / Secondary / ListRow / SectionCard / EmptyState |
| 平台惯例优先 | TabView、NavigationStack、系统 List/Form、安全区、标准手势 |
| 品牌克制 | 渐变 / BrandMark 只出现在：启动相关、登录/注册、少数主 CTA；不铺满 Home / Chat / Calendar |

**不做：** 再引入 Ant / Material 整套皮肤；不把整 App 刷成图标海报。

---

## 2. Design Tokens

在 `SideSeatTheme` 上补齐并写死命名，避免各屏私自挑色。Swift 属性名以本表「代码名」为准。

### 2.1 颜色

| Token | 代码名 | 值 / 来源 | 用途 | 状态 |
|-------|--------|-----------|------|------|
| accent / Rose | `accent`, `rose` | `#FB4185`（`AccentColor`） | 链接、选中 Tab、开关、未读点、产品面主按钮 | ✅ |
| coral | `coral` | `#FB735F` | 品牌装饰、主 CTA 渐变 | ✅ |
| peach | `peach` | `#FED097` | 同上 | ✅ |
| magenta | `magenta` | `#DF25A1` | 同上、软阴影 | ✅ |
| orchid | `orchid` | `#D063EB` | 同上 | ✅ |
| cream | `cream` | `#FFEFEB` | softWash | ✅ |
| ink | `ink` | 近黑 | 品牌面上的对比文字（少用） | ✅ |
| bg | `bg` | `systemBackground` | 主流程背景 | ✅ |
| bgGrouped | `bgGrouped` | `systemGroupedBackground` | 分组列表背景 | ✅ |
| surface | `surface` | `secondarySystemGroupedBackground` | 卡片 | ✅ |
| textPrimary | `textPrimary` | 系统 `.primary` | 正文 | ✅ |
| textSecondary | `textSecondary` | 系统 `.secondary` | 说明 | ✅ |
| danger | `danger` | 系统 Red | 删除、错误 | ✅ |
| success | `success` | 系统 Green | 成功态 | ✅ |
| calendarNow | `calendarNow` | 日历红线（`CalendarChrome.nowRed` 别名） | 与强调色分离，避免「现在」和「选中」打架 | ✅ |

**Dark mode：** 主流程跟系统；品牌面用加深版 `softWash(for:)`（已有雏形）。

**AccentColor 已对齐 Rose，不再改主色。**

### 2.2 字体

不引入第三方字体，保证系统动态字体与可访问性。

| 层级 | 规格 | 场景 | 状态 |
|------|------|------|------|
| Display | SF Rounded Bold ~28–34 | 登录标题 sideseat | ✅ `Text.display` |
| Title | SF Pro Semibold `.title2` / `.title3` | 屏标题、卡片标题 | ✅ `Text.title` / `titleSmall` |
| Body | SF Pro Regular `.body` | 列表、聊天 | ✅ `Text.body` |
| Caption | `.caption` / `.footnote` | 辅助、时间戳 | ✅ `Text.caption` / `footnote` |
| Mono digit | `.monospacedDigit()` | 日历时间、日期数字 | ✅ `Text.monoDigit` / `monoDigitCaption` |

调用方逐步改为 `SideSeatTheme.Text.*`；禁止各屏私自引入第三方字体。

### 2.3 圆角 / 间距 / 阴影

| Token | 代码名 | 值 | 状态 |
|-------|--------|-----|------|
| radiusControl | `controlRadius` | 14（输入框、小按钮） | ✅ |
| radiusCard | `cardRadius` | 22（内容卡） | ✅ |
| radiusHero | `heroRadius` | 28（登录品牌块，可选） | ✅ |
| spaceXS…XXL | `spaceXS`…`spaceXXL` | 4 / 8 / 12 / 16 / 24 / 32 | ✅ |
| 屏边距 | `screenHorizontal` | 20（落在 16–22） | ✅ |
| 阴影 | `cardShadow` / radius / Y | magenta ≈8%；列表行无阴影 | ✅ |

文档名 `radiusControl` 等与代码 `controlRadius` 同义；**以代码名为准**，勿再引入第二套圆角常量。

### 2.4 渐变与填充策略

| API | 用途 | 允许表面 |
|-----|------|----------|
| `accentGradient` | 品牌面主 CTA 填充 | Auth / Tutorial 主按钮 |
| `softWash` / `softWash(for:)` | 品牌面背景 | Login / Signup / Forgot；可选冷启动空态 |
| `brandGradient` / `brandGradientVertical` | 更强品牌装饰 | 极少；优先 softWash |
| 实心 `accent` 或 `.borderedProminent` + tint | 产品面主按钮 | Home / Discover / Chats / Me |

`SideSeatTheme.ButtonFill`（`.brand` / `.product`）已提供 enabled/disabled 填充；Phase B 将升格为 `SSPrimaryButton`。

`SideSeatTheme.Interaction` 统一 pressed 透明度 / scale / 时长与 disabled 灰填充。

### 2.5 交互态（统一）

| 态 | 规则 |
|----|------|
| Pressed | 透明度 0.88–0.92 或 scale 0.985；时长 ~0.15s |
| Disabled | 灰填充，无品牌渐变 |
| Loading | 按钮内 `ProgressView`，禁用二次点击 |
| Focus | 输入框依赖系统焦点；错误用 footnote + `danger` |
| Selected | 列表 / Segment：accent 浅底或系统 `isSelected` |

---

## 3. 品牌面 vs 产品面

```
品牌面（允许渐变 / BrandMark）
  └─ Login / Signup / Forgot password
  └─ 可选：冷启动空态、Tutorial 主 CTA

产品面（禁止大面积渐变）
  └─ Home 周历 / Agenda
  └─ Discover 列表与详情
  └─ Chats / 会话气泡
  └─ Me / Settings（最多 1 条轻 wash 描边，如 Me hero）
```

### 主 CTA 规则

- **品牌面：** `accentGradient` 按钮（登录、注册、重置）
- **产品面：** 实心 accent 或系统 `.borderedProminent` + tint；**不再**每屏渐变按钮

在 Theme / 组件头注释中标明「品牌面 / 产品面」，新 UI 先判断所属再选填充。

---

## 4. 组件库策略

**底座：** SwiftUI 系统控件（`Button`、`List`、`Form`、`NavigationStack`、`TabView`、`Sheet`）。

**自研薄封装：** `Core/Design/Components/`

| 组件 | 职责 | 状态 |
|------|------|------|
| `SSPrimaryButton` | 主 CTA（品牌面渐变 / 产品面实心 accent；rounded / capsule） | ✅ |
| `SSSecondaryButton` | 文本或浅底次要操作 | ✅ |
| `SSTextField` / `SSSecureField` | 统一圆角、内边距；`SSFieldMessage` 错误/成功 | ✅ |
| `SSCard` | `SideSeatCardBackground` 外壳 | ✅ |
| `SSSectionHeader` / `SSGroupedSection` | Me / Settings / Discover 分组 | ✅ |
| `SSListRow` | 左图标色块 + 标题 + 副标题 + chevron（Me hub） | ✅ |
| `SSEmptyState` | 图标 + 说明 + 可选产品面 CTA | ✅（Discover 空态已接） |
| `SSBrandMark` | `SideSeatBrandMark`，仅品牌面 | ✅ |
| `SSScreen` / `SSBrandAtmosphere` | 品牌 softWash / 产品纯色背景 | ✅ |

**刻意不对齐的模块：** 周历网格、聊天气泡、地图——跟 Apple Calendar / iMessage 信息架构，不硬套 Card Kit。

---

## 5. 分屏设计

### 5.1 Auth（对标：现代消费 App 登录，非银行风）

- 一屏一事：登录；注册 / 找回进 Sheet
- Hero：BrandMark + sideseat Rounded + 一句 tagline
- 表单：SSCard + 字段 + 主按钮；次要链接触色 Rose
- **保持 UITest id：** `login-identifier`、`login-password`、`login-submit`、`login-error`、`login-forgot-password`、`login-create-account`（及 signup / forgot 现有 id）

### 5.2 Home（对标：Apple Calendar + Fantastical 密度）

- 主任务：看清「这几天有什么」
- 日期条 + 周网格 / Agenda；强调色只用于选中日、拖拽目标、次要 chip
- Now 线保持独立红（`calendarNow`）；不要用品牌渐变刷格子
- 空态：一句 +「新建日程」实心 accent

### 5.3 Discover（对标：轻社交信息流）

- 主任务：浏览 / 筛选帖子与活动
- 列表行清晰层级；CTA「留言 / 参加」用 accent，不渐变铺底
- Create：系统 `confirmationDialog` / sheet，保持平台感

### 5.4 Chats（对标：iMessage / Discord 会话列表）

- Inbox：未读点 = accent；筛选 chip 选中 = accent 浅底
- 气泡：己方可用 accent 实心（非渐变）；对方系统灰底
- 少装饰，保可读与性能

### 5.5 Me（对标：个人中心枢纽）

- Hero：轻品牌 wash / 描边可保留；内部仍是头像 + 姓名 + 编辑
- Hub 列表：`SSListRow` 复用；行图标可用功能色区分（课程绿、计划蓝），但形状统一
- Settings：标准 List / Form，少自定义

### 5.6 Onboarding Tutorial

- 聚光 + 文案卡片；主按钮可用渐变一次；Tab 选中用 Rose
- 不挡主路径过久；可跳过

---

## 6. 落地分期

### Phase A — Token 冻结（0.5–1 天） ✅

- 扩展 `SideSeatTheme`：spacing、text、semantic `danger` / `success`、`bg` / `surface`、`calendarNow`
- 文档化「品牌面 / 产品面」注释（本 README + Theme 头注释）
- AccentColor 已对齐 Rose，不再改主色
- `ButtonFill` + `Interaction` 冻结；Auth / Tutorial 主按钮已改用

### Phase B — 基础组件（1–2 天） ✅

- 抽出 `SSPrimaryButton` / `SSCard` / `SSTextField` / `SSListRow` / `SSEmptyState`（及 Secondary / Secure / Section / Screen）
- Auth 三页全部改用组件（行为不变，只统一皮）；UITest id 保留
- Tutorial 主/次按钮复用同一 Primary / Secondary API
- Me hub 行与分组改用 `SSListRow` / `SSGroupedSection`
- Discover 空态改用 `SSEmptyState`

### Phase C — 产品面收敛（2–3 天） ✅

- Home / Discover / Chats / Me：去掉零散自定义蓝、杂圆角；统一 tint 与卡片
- 日期条 / 周头：**选中 = accent**，**今天未选 = calendarNow**（不再与选中共用红）
- 聊天己方气泡、未读、强调 chip 统一 `SideSeatTheme.accent` / `Chat.*`
- Me hub 行 tint 收敛到 `HubTint`；验证章统一 `verifiedSeal`
- 产品面错误文案批量改用 `danger`；课程无 hex 时用 `courseFallback`

### Phase D — 日历专项打磨（并行或紧随） ✅

- 对齐列宽 / 字号 / 选中态；保持跟手横滑
- 不引入品牌渐变进网格
- Now 线走 `calendarNow` token
- `CalendarChrome` 冻结：`weekMinDayWidth`、`dayChipDiameter`、`Typography`、`selectedWash`
- 日期条与周头共用 `CalendarDayChipLabel`；选中列浅 accent wash，今天列仍用 `todayWash`

### Phase E — 验收与冻结 ✅

- 对照清单走查 5 Tab + Auth（见 §8.1）
- Token 冻结写入 `SideSeatTheme` 头注释 + 本节；新功能必须复用组件
- Home Agenda / Chats 空态接入 `SSEmptyState`；Create 占位与 Home 背景走 Theme

---

## 7. Do / Don’t

### Do

- 新 UI 先问：系统控件能否覆盖？
- 颜色只从 Theme 取
- 主流程背景用系统 grouped（经 Theme 语义名）
- 对标日历 / 社交的信息架构与手势

### Don’t

- 每个 Feature 自造一套圆角 / 阴影
- 产品列表大面积粉橙渐变底
- 再引一套第三方 UI Kit「换皮」
- 用强调色同时表示「现在」「选中」「错误」
- **冻结后**在 Feature 内新增硬编码 hex / `.blue` / 私有圆角常量（用户内容色与已包装语义色除外）

---

## 8. 验收标准（Done）

- [x] Auth + Me + 至少一处 EmptyState 共用同一组件 API（Discover / Home Agenda / Chats）
- [x] 全 App 主交互色视觉上只有一种 Rose（产品面选中 / 未读 / 己方气泡）
- [x] 登录 / 注册能一眼认出 SideSeat（BrandMark + Rose / accentGradient）
- [x] UITest 访问 id 不回归（`login-*` / `signup-*` / `forgot-*` 仍接线）；Development 构建通过
- [x] 任意屏：去掉 Nav 后主流程仍为系统 Tab / List / Calendar 结构，非运营海报（品牌渐变限于 Auth / Tutorial）
- [x] 深色模式：品牌面 `softWash(for:)`；产品面跟系统 `bg` / `surface` / 语义色
- [x] Phase A–E 落地完成；tokens 冻结

### 8.1 走查矩阵（Phase E）

| 面 | 主任务 | 品牌/强调 | 组件 | 结果 |
|----|--------|-----------|------|------|
| **Auth** | 登录；注册/找回 Sheet | BrandMark + softWash + brand CTA | `SSScreen` / `SSCard` / `SSTextField` / `SSPrimaryButton` | ✅ |
| **Home** | 日程周/日/列表 | 选中 accent；Now = `calendarNow`；无网格渐变 | `CalendarDayChipLabel` + Chrome | ✅ |
| **Discover** | 找人/活动 | CTA/章 accent；列表无洗底 | `SSEmptyState` | ✅ |
| **Create** | 发帖入口 | 系统 confirmationDialog | Tab 占位 `bgGrouped` | ✅ |
| **Chats** | 对话 | 未读/己方气泡 accent | `SSEmptyState`；`Chat.*` | ✅ |
| **Me** | 个人枢纽 | Hero 轻 wash；hub `HubTint` | `SSListRow` / `SSGroupedSection` | ✅ |

---

## 9. 当前已有 vs 缺口

| 已有 | 可选后续 |
|------|----------|
| Theme + Components + CalendarChrome 冻结 | 真机（非模拟器）复跑 `capture-visual-qa.sh` |
| Auth / 5 Tab 走查通过；背景 / 空态二次收敛 | Me 底栏安全区 / 周历事件折行微调 |
| Auth UITest id；danger / success / HubTint / Chat / fillTertiary | |
| 模拟器 Light/Dark 截图归档：`docs/ios-native/visual-qa/` | |

---

## 10. 变更约定（冻结规则）

1. **新色值 / 圆角 / 间距** → 先改 `SideSeatTheme`（或 `CalendarChrome`），再改调用方；PR 需说明动机。
2. **新可复用控件** → 放 `Core/Design/Components/`，Feature 内不复制皮肤。
3. **产品面** 禁止新增大面积品牌渐变；例外需在 PR 说明。
4. **Rose / AccentColor** 不改主色，除非产品明确改版并同步本 README。
5. 修改本设计系统时同步更新本 README 的「状态」列与验收清单。
