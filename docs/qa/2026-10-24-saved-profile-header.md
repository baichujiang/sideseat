# 我的收藏：资料入口移至用户栏（Preview 204）

收藏卡片直接点击头像或姓名打开原资料／意愿详情；右侧小箭头提示可进入，正文删除独占一行的资料按钮。沿用原回调、入口ID与公开／私密资料规则。仅 compact 收藏卡片采用新入口，推荐／探索和聊天卡片原行为保留。

实现只将原用户信息提取为局部 `peerIdentity`，收藏分支使用无底框的 `SSPressButtonStyle` 和至少44pt点击高度；菜单保持同级，不嵌套交互。未增加状态、请求、通用组件或依赖。独立源码审查通过。

默认 iPhone14 Plus（UDID `00008110-001A69110CC1401E`，iOS26.6.1）最终同一App包专项测试 **209.294秒通过，1通过、0失败／跳过**：中文普通字号浅／深色、德文最大辅助字号浅／深色。每组仅以现有本地fixture收藏一次作准备，再核验收藏页内唯一入口、用户栏包含关系、完整可达及44pt；实际分别点击头像和姓名，共8次打开原私有意愿详情并关闭返回，保留收藏。底部收藏与打招呼入口可达，不触发招呼／消息／邀请。

初轮 **23.688秒失败**是测试查询不存在的卡片容器ID：现有外层 `together-bookmarks` 覆盖该AX标识。仅将唯一性查询改为当前收藏页范围；用户栏包含、44pt和实际打开／返回检查不变。App源码和二进制始终不变，不把初轮称为通过。详见[分次记录](./evidence/2026-10-24-saved-profile-header204/acceptance-runs.json)。

20张最终实际截图逐张查看，保存8张代表图。普通字号头像／姓名／认证标识同排，箭头在右；最大字号保留原认证标识纵排适配，无重叠。正文无独立资料行，底部操作完整；最大字号整卡需要滚动。原私有详情弹层实图为普通视觉字号，本轮只验打开／返回，**不称详情最大字号适配通过**。fixture无公开userId，公开资料分支仅源码审查，未测试公开资料网络请求或真实匹配／发送／邀请至日历完整API链；无单元／领域／浏览器重复。原详情安全菜单与系统AssistiveTouch圆点不属于本次改动。其他既有观察保留。

267项构建输入、私密Local、严格签名和测试前后二进制hash核验一致。Preview204已安装并无测试参数普通启动 **PID8022**，实际进程匹配；普通97保留。Runner清理，按报告文件名与 `metadata.lastModDate` 比较，本轮无新增App崩溃／资源报告；无真实账号／计划创建删除或后端写入。无后端／网页／Schema发布，api/www仍Ready `dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7`。公开flag与逐账户assignment分开记录。

[中文效果](./evidence/2026-10-24-saved-profile-header204/fixture-saved-profile-header-zh-Hans-light-normal.png)、[最大字号](./evidence/2026-10-24-saved-profile-header204/fixture-saved-profile-header-de-dark-largest.png)、[滚动后的操作](./evidence/2026-10-24-saved-profile-header204/fixture-saved-profile-actions-de-light-largest.png)、[实际图复核与范围](./evidence/2026-10-24-saved-profile-header204/visual-review.json)、[构建来源](./evidence/2026-10-24-saved-profile-header204/native-build-manifest.json)、[设备核验](./evidence/2026-10-24-saved-profile-header204/device-verification.json)。
