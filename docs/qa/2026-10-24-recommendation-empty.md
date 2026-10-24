# 同行推荐空态 — Preview 203

用户要求优化「同行→推荐」没有同行推荐时的文字、按钮排布和UI。改前202真机的两种夹具实图显示：左侧标题／长说明／小意愿按钮与下方寻找按钮割裂，寻找入口缺少主操作层级。

本轮将首次空态收为340pt以内的居中图标、短标题、说明和纵向主次动作；复用SSPrimaryButton实色「寻找更多推荐」及SSSecondaryButton文字「查看我的意愿」。探索开关关闭时仍只有原查看意愿动作。无需重复外框或额外卡片。中英德缩短文案，仍用真实findingCount区分已有意愿正在寻找与尚无寻找中的意愿；不把未发布／暂停／过期误称正在寻找。主动寻找成功但无结果改为图标、标题和说明的静态结果区，保留无无限重试入口的规则。

只将原三句搜索动作提取为一处函数，并用等价已有空态条件避免外部重复CTA；未新增状态、产品组件、依赖或请求。算法、按账户实验gate、公有featuregate、加载禁重复、按需探索、错误重试、分页会员额度、已有卡片保留、收藏／会话／隐藏过滤、旧匹配session和各入口ID均保留。inline原始数据非空但全部被过滤的既有空白边界未改。旧视觉测试的空结果ID定位调整为通用后代查询，专项测试使用当前Preview及本地夹具。

## 验收

同一最终产品包的两个专项均已通过，**分次验收**，不称一次完整套件全通过：[逐轮范围](./evidence/2026-10-24-recommendation-empty203/acceptance-runs.json)。

| 最终产品检查 | 实际结果 |
| --- | --- |
| 四种语言／主题／字号组合×两种意愿状态，44pt新CTA及入口往返、编辑取消、空搜索结果 | **322.259秒通过** |
| 初次骨架、搜索中禁重复、初载失败与真实重试恢复 | **26.855秒定向复测通过** |

[最终布局用例](./evidence/2026-10-24-recommendation-empty203/final-layout-summary.json)、[最终加载复测](./evidence/2026-10-24-recommendation-empty203/final-loading-summary.json)。最后只修测试对原生重试的范围；App源码与二进制不变。

父代理与3位独立审查者实际查看 **32张最终图**，另看2张改前图；保存12张最终代表图，以及2张改前和1张中间问题图。最大德文搜索结果碎词已消失，主次CTA文字、横向留白和边界均正常。最大字号且没有寻找中意愿时，说明较长，需要纵向滚动才看见两个按钮，滚动后控件完整；不称全部首屏可见。系统AssistiveTouch保留，遮挡处不据图宣称可见。[实图复核](./evidence/2026-10-24-recommendation-empty203/visual-review.json)。

[改前](./evidence/2026-10-24-recommendation-empty203/before-recommendation-empty-none-zh-normal-light.png)、[新版无意愿](./evidence/2026-10-24-recommendation-empty203/fixture-recommendation-empty-none-zh-Hans-normal-light.png)、[新版已有意愿](./evidence/2026-10-24-recommendation-empty203/fixture-recommendation-empty-active-zh-Hans-normal-light.png)、[深色](./evidence/2026-10-24-recommendation-empty203/fixture-recommendation-empty-active-zh-Hans-normal-dark.png)、[最大字号顶部](./evidence/2026-10-24-recommendation-empty203/fixture-recommendation-empty-top-none-de-largest-light.png)、[最大字号按钮](./evidence/2026-10-24-recommendation-empty203/fixture-recommendation-empty-none-de-largest-light.png)、[最终搜索空态](./evidence/2026-10-24-recommendation-empty203/fixture-recommendation-search-empty-active-de-largest-dark.png)。

中间包布局／入口八组合 **322.159秒通过**；加载／恢复 **7.262秒失败**，因为测试额外等待首页后在 **4.82秒**才查询已结束的4秒骨架。测试只提前瞬时状态检查，不改变App加载时间或规则。实际看中间图还发现最大德文搜索结果说明拆词，改用仅当前inline空态的短专属中英德文案，原共享Explore文案不变；重编／安装后需重跑最终两项。[中间结果](./evidence/2026-10-24-recommendation-empty203/intermediate-summary.json)、[修前碎词图](./evidence/2026-10-24-recommendation-empty203/intermediate-search-copy-de-largest-dark.png)。不将中间包或失败套件记成最终同包通过。

短文案最终包八组合 **322.259秒通过**；同轮加载用例骨架及禁重复已通过，但在原有未改的原生错误重试按钮AX高度34.333pt处触发额外44pt断言，**21.519秒失败**。本轮只对改动的两个空态CTA保持严格44pt下限；原生重试验证完整可见、可点击及实际恢复，既有AX几何不当作本次新增合同，未通过改App去满足无关断言。之后仅定向复测加载／恢复，产品未变；不将该混合套件称为一次全通过。[最终布局及同轮失败范围](./evidence/2026-10-24-recommendation-empty203/final-layout-summary.json)。

- 改前截图：已安装202，中文普通浅色，分别无意愿及1个ACTIVE自动寻找意愿；只本地夹具，不使用真实账号数据。
- 最终布局：中文普通浅／深、德文最大字号浅／深，分别无意愿／1个正在寻找意愿，检查两个CTA完整可达与44pt下限，逐张看实际截图。大字号允许正文自然滚动，另拍顶部和底部，不用整组文字必须同时在屏的假设代替可用性。
- 入口往返：查看意愿→原意愿页→原添加入口→编辑器取消→推荐空态；寻找更多→既有成功空结果，不出现额外寻找／错误重试。
- 状态边界：初次慢加载保持骨架，不提前显示空态／寻找；探索进行中禁重复；初载失败只显示原重试，重试后恢复空态。

没有发布意愿、发送消息、创建／删除真实账号或计划，也未执行真实匹配／通知投递／邀请至日历API链、单元／领域／浏览器测试。本轮为推荐空态专项，不称全App或所有最大字号整页验收。其他既有日历／详情／菜单／底栏／CPU／额外左滑观察未改。

## 来源和交付

[构建来源](./evidence/2026-10-24-recommendation-empty203/native-build-manifest.json)：248App／18配置脚本工程／1共享资源全部从活跃checkout刷新，隔离工程和私密Local逐字节一致，无新App文件；严格签名通过，普通97保留。无关tsconfig修改不入提交。

[设备核验](./evidence/2026-10-24-recommendation-empty203/device-verification.json)：默认iPhone14 Plus `00008110-001A69110CC1401E` 最终203普通启动 **PID8005**，无测试参数且对应实际进程，普通97保留。最终267输入与Local、严格签名及测试前后二进制hash一致；Runner、私密设备／测试JSON、xctestrun和生成scheme清理，日志0600、结果与导出目录0700。本轮初始手机报告基线后无新增App崩溃／资源报告，未删除既有报告。

无后端／网页／Schema发布。[生产状态](./evidence/2026-10-24-recommendation-empty203/production-status.json) api/www均Ready `dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7`。[公开配置](./evidence/2026-10-24-recommendation-empty203/public-feature-state.json) WeeklyIntent／MutualOpportunity／AutomaticMatching／ExploreIntents均开、维护关；探索关闭分支仅源码审查，当前真机夹具为开启。每个真实账号仍由其assignment控制，旧Discover的v2Recommendations不是本页开关，不以夹具声称全部用户开放。
