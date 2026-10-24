# Preview 204：收藏卡片资料入口

我的收藏直接点击头像／姓名打开原资料或私有意愿详情，右侧箭头提示入口；正文不再单独占一行。仅调整收藏卡片，复用原用户信息、回调、入口ID和无框按压样式，点击高度至少44pt。原收藏／打招呼、推荐／探索／聊天和公开／私密资料规则保持，无新状态、请求、通用组件或依赖，最简实现审查通过。

源码 **`985af339ae4ec99ebc10f292c19f9072d96ebce3` 已提交并推送**，包含专项测试、QA和代表图。最终同包中文普通字号／德文最大辅助字号、各浅深色共四组合 **209.294秒通过，1通过、0失败／跳过**。分别点头像和姓名共8次进入原私有详情并返回，保留本地收藏，底部操作完整可达。20张最终实际图逐张复核、8张保存。初轮23.688秒测试容器AX定位失败仅修测试，产品不变；不冒充初轮通过。

最大字号整卡需滚动；原私有详情弹层实图为普通视觉字号，本轮只验路由往返，不称详情最大字号适配。fixture无公开userId，公开资料分支仅源码审查，未测试公开资料网络、真实推荐／发送／完整邀请到日历API链，无单元／领域／浏览器重复。原详情安全菜单、系统AssistiveTouch及其他既有观察保留。

默认iPhone14 Plus `00008110-001A69110CC1401E` 已安装204并无测试参数普通启动 **PID8022**，实际进程对应；普通97保留。267输入／私密Local／严格签名和测试前后二进制hash一致。Runner、私密JSON／xctestrun／生成scheme清理，无真实账号／计划创建删除或后端写入，无本轮新增App崩溃／资源报告，无关tsconfig保留。

无后端／网页／Schema发布，api/www仍Ready `dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7`。公开开关与逐账户assignment分开记录。

[实际效果](../qa/evidence/2026-10-24-saved-profile-header204/fixture-saved-profile-header-zh-Hans-light-normal.png)、[最大字号](../qa/evidence/2026-10-24-saved-profile-header204/fixture-saved-profile-header-de-dark-largest.png)、[完整QA与证据](../qa/2026-10-24-saved-profile-header.md)。
