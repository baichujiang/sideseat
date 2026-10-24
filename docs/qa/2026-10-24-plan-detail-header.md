# 共同计划顶部层级 — Preview 198

保留平面布局、活动名称与右侧分享、次行状态／地点，名称与分享采用一致的最小 44pt 行高。普通字号地点使用剩余宽度自然换行，辅助字号改为纵向；没有新增字号上限。收集页将日期与时区分两行，和原填写人数／头像组件放入现有 `PlanAdaptiveRow`：够宽同排，不足则上下排。人数仍是文字，右侧头像仍是独立操作，保留三头像／更多人数及完整人员页。

顶部横距统一为 20pt、收集区间距为 8pt。确认页／过期页移除叠加的顶部 padding，仅标题补齐到 20pt；邀请时间表和正文的原横边距不改。活动提议原顺序、固定时间记录的日期分支、原位编辑、两个滚动定位 ID 与 anchor、页底操作和全部提交／邀请／日历规则保持。没有新状态、组件体系、请求或依赖。

## 首轮实际结果

同一产品包的八人摘要／完整人员入口普通字号 **25.053 秒**、深色最大字号 **28.667 秒**通过。检查三头像＋5、人数文字与操作至少 8pt 分离、44pt 入口和八人完整名单。实际图逐一复核：普通字号日期／时区、人数与头像同列，长地点在状态右侧自然换行；最大字号各层可完整读取，时间表位于后续滚动区域。这组最大图不证明详情格子旧显示问题已解决。

[八人普通图](./evidence/2026-10-24-plan-header198/compact-avatars-eight.png)、[八人最大图](./evidence/2026-10-24-plan-header198/compact-avatars-dark-largest.png)、[完整名单](./evidence/2026-10-24-plan-header198/compact-people-eight.png)、[最大名单](./evidence/2026-10-24-plan-header198/compact-people-dark-largest.png)。

同批次长标题／长地点专项 **32.933 秒失败**，发生在首个标题完整可见断言。录像中标题完整两行、长地点完整换行，无交叠或越框；仍没有把截图代替断言、把整批记为通过。[混合结果](./evidence/2026-10-24-plan-header198/layout-initial-summary.json)、[失败末帧](./evidence/2026-10-24-plan-header198/initial-visible-title-viewport-failure.png)。后续只修测试的视口计算及当前导航栏定位，产品未因此改动；具体最终 frame 与结果见下方验收记录。


复测 frame 证实测试错误：标题和滚动区均从 **109pt** 开始，当前导航栏底部 **101pt**；旧公式 `max(scroll.minY, nav.maxY) + 4` 得到 **113pt**，人为排除完整可见标题的顶部四点。修正为 `max(scroll.minY, nav.maxY + 4)`，并明确选择当前计划导航栏，保留全部完整可见、44pt、内边距与不交叠断言，不改产品。[实际矩形记录](./evidence/2026-10-24-plan-header198/viewport-correction.json)。

## 完整 App 链路

同一最终产品包的完整真机 **370.177 秒通过**，包含创建、原位名称／地点编辑与取消／保存、空闲点选／取消／拖选／明确提交、好友卡片投递与重复防护、双方填写、跨天最终时间草稿／邀请名单、接受、发布和双方日历；Mac 仅准备专用联系人并读 API，产品动作由手机完成。**8 阶段 API 通过**，计划卡片始终一条，最终双方精确且各一条日历。owner／participant × COLLECTING／INVITING／CONFIRMED 六次分享权限检查通过，原入口规则保持。

[完整结果](./evidence/2026-10-24-plan-header198/phone-summary.json)、[8 阶段 API](./evidence/2026-10-24-plan-header198/header198-api.json)、[零人新计划](./evidence/2026-10-24-plan-header198/compact-empty-timetable.png)、[两人填写](./evidence/2026-10-24-plan-header198/contacts-peer-inline-availability.png)、[跨天邀请](./evidence/2026-10-24-plan-header198/invitation-continuous-across-midnight.png)、[明确接受](./evidence/2026-10-24-plan-header198/contacts-explicit-acceptance.png)、[已确认发起人](./evidence/2026-10-24-plan-header198/share-permissions-owner-CONFIRMED.png)、[已确认参与者](./evidence/2026-10-24-plan-header198/share-permissions-participant-CONFIRMED.png)。这些普通字号图逐一复核，收集与邀请／确认顶部对齐；跨天日期、起止时间、受邀图例和高亮完整。两人填写截图未包含活动标题，单图不作为标题显示证明；标题由其余顶部图和专门布局断言核对。


第二轮 **143.356 秒失败**：中文普通组合已完成；中文最大字号的地点需再向上滚动约 21pt 才完全离开底栏。记录中地点范围 445.333–704.333pt，真实可视底边 683.167pt；AX ScrollView 却延伸至 926pt，默认 `scroll.swipeUp()` 起点在固定底栏区域，连续手势未改变内容 frame。只改测试为在真实视口左侧、按超出距离进行有界短拖，起终点均严格验证位于可视区，完整可见／边界断言不变；产品未改。[第二轮结果](./evidence/2026-10-24-plan-header198/layout-second-summary.json)、[最大地点未实际滚动末帧](./evidence/2026-10-24-plan-header198/second-large-place-before-real-scroll.png)。


第三轮 **135.934 秒失败**：中文普通已完成，中文最大字号的长地点／日期／人数区域经真实拖动全部通过完整可见与排布断言；随后点击人员按钮中心时命中了系统 AssistiveTouch 浮球，打开系统菜单而非 App 名单。按钮框为 (337.667, 594.333, 70.333, 44)，中心约 (372.8, 616.3)，正被浮球覆盖。[第三轮结果](./evidence/2026-10-24-plan-header198/layout-third-summary.json)、[点击前浮球位置](./evidence/2026-10-24-plan-header198/third-system-overlay-on-people.png)。未把本轮说成完整通过；仅改测试触点为按钮内未遮挡的左侧点，并在开头轻点状态栏空白关闭残留系统菜单，不关闭或更改辅助功能。App 产品未改，仍要求真实名单打开和取消返回。


## 最终四组合与实际图片

最终相同产品包的长名称／长地点中文、德文普通／最大字号 **371.018 秒通过**。检查标题／分享相对位置、44pt、20pt 横边距、状态地点普通横排／辅助字号纵排、日期／人数／头像自适应分组、人数文字与按钮至少 8pt、完整可见／无交叠；实际打开完整人员页、打开分享／关闭、地点追加编辑并取消，核对名称和原地点准确保留。修复后的手势在真实视口内完成，名单通过未被系统浮球遮挡的按钮内触点实际打开。

[最终四组合结果](./evidence/2026-10-24-plan-header198/layout-summary.json)。[中文普通顶部](./evidence/2026-10-24-plan-header198/detail-heading-top-normal-zh-Hans.png)、[中文普通表头](./evidence/2026-10-24-plan-header198/detail-heading-metadata-bottom-normal-zh-Hans.png)、[德文普通顶部](./evidence/2026-10-24-plan-header198/detail-heading-top-normal-de.png)、[德文普通表头](./evidence/2026-10-24-plan-header198/detail-heading-metadata-bottom-normal-de.png)、[中文最大顶部](./evidence/2026-10-24-plan-header198/detail-heading-top-largest-zh-Hans.png)、[中文最大下部](./evidence/2026-10-24-plan-header198/detail-heading-metadata-bottom-largest-zh-Hans.png)、[德文最大顶部](./evidence/2026-10-24-plan-header198/detail-heading-top-largest-de.png)、[德文最大下部](./evidence/2026-10-24-plan-header198/detail-heading-metadata-bottom-largest-de.png)。八张实际逐一复核：普通长名称／地点各两行，无省略或碰边；中文表头同排，德文长人数文案使表头自然分行。辅助字号需分段滚动阅读，中文下部图含完整长地点，德文下部图含地点末尾、完整日期时区／人数入口；完整地点的可视区域由逐项滚动的 frame 断言核验，不把德文下部单图说成全地点同屏。

大字号验收限定顶部与相关入口，不是整页一屏展示验收。已有德文固定底栏较高、详情时间格最大字号旧空白问题及长时段菜单滚动回顶原因／手动影响均未改，未将本次头部通过描述为这些问题已修复。

## 精简与交付

源码 **`806ec019bec5550402450ff28b850c69575c815b` 已提交并推送**。产品仅在三个已有视图中局部调整排布，复用 `PlanAdaptiveRow`、`PlanDetailHeading`、`PlanResponseSummary` 和已有间距／字体；不抽取新框架、状态或请求。测试新增可复现 `heading-layout` 专用长名称／地点夹具模式，复用既有清理字段。三次失败均保留结果和范围；App 产品在四组合测试查看方式修正期间未变，完整流程、初轮和各次修正的测试源码 hash 分别记录，未混称相同测试文件。

[构建来源](./evidence/2026-10-24-plan-header198/native-build-manifest.json)：隔离生成工程复用，248 App／18 配置脚本输入及共享日历资源与活跃工作区逐字节一致，私密 Local 配置另行相等核验；最终二进制 hash、严格签名及测试源码 hash 核验。未使用冻结归档或把隔离目录当活跃项目。

[手机核验](./evidence/2026-10-24-plan-header198/device-verification.json)：默认 iPhone 14 Plus／iPhone (4)，UDID `00008110-001A69110CC1401E`，iOS 26.6.1；**198 安装，无测试参数普通启动 PID 7781**与进程一致，普通 **97** 保留，无新增 App 崩溃／资源报告。[清理记录](./evidence/2026-10-24-plan-header198/header198-cleanup.json)：两专用账号／三链接清理并验证 401／404；Runner、私密夹具／xctestrun／设备 JSON 已清理，原始日志 0600、结果及附件目录 0700。没有删除用户数据／钥匙串或更改辅助功能设置。

无后端、网页、Schema 或迁移发布；[api/www 只读重验](./evidence/2026-10-24-plan-header198/production-status.json)仍 Ready `dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7`，真实流程验证相应 API，未声称审计全部全局开关。未重复单元／领域／浏览器、活动提议、固定时间兼容流程或过期业务链；过期页本轮仅局部 padding 静态复查。无关 `tsconfig.json` 工作保留且未提交。
