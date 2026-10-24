# 分享网页：收集状态并入日期元数据

2026-10-24，Europe/Berlin。**已发布同一测试构建，正式双浏览器全流程与本轮状态布局验收通过。** 原生仍为Preview211，本轮未重建手机App。

## 实现与来源

活动名之后显示独立地点；候选日期下方为5px灰点、灰色caption和实际时区，中文「收集空闲」、英文「Collecting availability」。活动未定仍为「选择活动／Choosing an activity」。没有状态胶囊底、轮廓或点击动作。

唯一产品变更为 `components/time-polls/shared-time-poll.tsx` 的局部JSX，无新增状态、请求、组件、CSS或依赖。独立精简审查通过；旧FIXED、INVITING、CONFIRMED、CANCELLED、EXPIRED及关闭判断原分支保留。身份／恢复、草稿／手动提交、逐人回复、邀请版本、主动发出和Calendar规则均未改。

产品源码 **`55ac46672a925e39df3fcba981fb380539d1d93c` 已提交推送**。重新读取实际生产基线 `dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7` 的1393源项逐SHA1核对，零缺失／差异。仅覆盖1TSX并新增来源标记，1392项保持；候选实际上传1394项全部哈希匹配，未用活跃工作区覆盖其他生产差异。

Production skip-domain构建显式设 `SKIP_DATABASE_MIGRATIONS=1`、`SIDESEAT_ACTIVITY_RELEASE=none`，不运行迁移／活动发布hook。候选保护通过已有CLI授权访问，未更改保护设置。候选验收后提升同一构建 **`dpl_3y9L5UfyX7v1hhUPsXGVg7Cg27zz`**，api／www／根域名均核对READY；未重建一个替代已测候选的发布。

## 实际完整流程

每次独立运行创建一个专用owner、三个独立游客和三个专用计划。游客通过真实网页：匿名打开→填名加入→直接点空闲→明确提交→关闭页面重开恢复身份／原选择→收到跨午夜23:00–次日01:00正式邀请→看高亮后暂不回复／接受／拒绝→owner在仍有待回复／拒绝者时主动发布→三种回复保持、重复发布仍只有一条精确owner日历。发起人创建／定时／发邀请／发布及日历数据使用API；没有把API动作冒称网页owner操作。

三种布局分别为390px中文浅色、320px且根字号20px英文深色、1440px英文桌面。每次18组metadata检查，精确文字／完整时区、日期下方层级、灰色点、非按钮／无背景描边、完整文字边界／无页面横向溢出，以及关键44px操作区均核验。窄屏再严格检查完整metadata、日期、状态及每行文字全部处于实际视口、固定提交栏上方。活动待定与FIXED的独立呈现也通过。

| 最终运行 | 结果 |
| --- | --- |
| 候选Chromium | 32.032秒通过，18组metadata检查，1账号／3链接401／404清理 |
| 候选WebKit | 32.653秒通过，18组metadata检查，1账号／3链接401／404清理 |
| 正式www Chromium | 31.519秒通过，18组metadata检查，1账号／3链接401／404清理 |
| 正式www WebKit | 31.826秒通过，18组metadata检查，1账号／3链接401／404清理 |

所有最终运行浏览器pageerror均为空。API确认点格未提交时不写响应、显式提交的15分钟ID不变；不对齐邀请被拒且版本不变；接受后正式发出前无日历；跨天2小时正式发出／重复发出后owner精确唯一日历。游客没有账号Calendar，未声称其各自有日历条目。

## 原图与测试修正

访问预检曾因CLI参数被转发给curl导致cookie未生成，两个脚本在建立夹具或网络业务之前退出；该次不是产品验收。后续已有授权的 `/ios` HTTP200验证通过，未改保护。

首次候选双引擎35.446／36.478秒功能通过，但部分窄屏fullPage长截图把固定底栏拍在metadata上方，不能据此断言实际可读或产品裁切。仅加强测试：滚动metadata入视口、核对真实底栏上方完整可见、改拍窄屏viewport；原功能／文字／颜色／44px断言保留，产品源码和候选二进制未改，随后重新跑通最终候选双引擎。

初始60张原图逐张打开；最终候选42张PNG字节完全相同复用实际审查，18变化重新实看。正式60张中54张与已接受候选PNG字节相同，另外6张正式图重新实看。共84份原图被实际打开；保留16张最终代表图和1张初始遮挡图，其余最终原图保留在本机私有证据目录，完整哈希及分组记录可追溯。

窄屏长页需要滚动，不宣称未滚动首屏同时展示全内容。其他长截图仍可能有固定栏覆盖正文、邀请表内部滚动使两日无法同屏完整展开。原有320px／20px邀请底栏左按钮英文贴边／略越轮廓的观察保留；该INVITING样式未改，本次未宣称已修复或全站大字号视觉全通过。CANCELLED／EXPIRED保留仅经源码分支审查，本轮未新跑其业务路径；未改的原生、领域和全站e2e套件不重复执行。

## 清理与证据

含首次候选补验共6个专用账号失效401、18条计划链接404均确认，私有夹具及候选cookie／响应头移除；真实用户数据未改。

[生产发布](./evidence/2026-10-24-web-status-metadata/production-release.json)、[来源](./evidence/2026-10-24-web-status-metadata/source-verification.json)、[候选时长](./evidence/2026-10-24-web-status-metadata/candidate-timings.json)、[正式时长](./evidence/2026-10-24-web-status-metadata/production-timings.json)、[候选Chromium](./evidence/2026-10-24-web-status-metadata/candidate-chromium-result.json)、[正式WebKit](./evidence/2026-10-24-web-status-metadata/production-webkit-result.json)、[图审](./evidence/2026-10-24-web-status-metadata/visual-review.json)、[清理](./evidence/2026-10-24-web-status-metadata/cleanup-summary.json)。

[正式中文手机](./evidence/2026-10-24-web-status-metadata/production-chromium-mobile-light-anonymous.png)、[正式窄屏加入后的真实视口](./evidence/2026-10-24-web-status-metadata/production-webkit-narrow-large-dark-joined.png)、[活动待定视口](./evidence/2026-10-24-web-status-metadata/production-webkit-narrow-large-dark-activity-joined.png)、[正式跨天邀请](./evidence/2026-10-24-web-status-metadata/production-chromium-mobile-light-cross-day-invitation.png)、[正式已发出](./evidence/2026-10-24-web-status-metadata/production-chromium-mobile-light-published.png)。
