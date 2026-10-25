# Preview 219：五个一级页面统一底板

2026-10-25，Europe/Berlin。默认 iPhone 14 Plus 已安装并正常启动 **Preview219，PID9158**，普通 SideSeat97 保留。按已确认的本地[底板设计](../designs/2026-10-25-root-foundation-v1/README.md)实施原生页面；该设计目录保留为设计证据。

## 实现范围

同行、计划、日历、消息、我的共用自适应背景、居中品牌抬头、20pt 页面边距、白色内容面与轻量分栏。原生 TabView 保留，计划发起入口继续在右下方；需要处理纵排、等待他人横排、整卡点击及已有记录保持。根页卡片移除装饰宽色带和无意义图像，保留真实头像、事件颜色、状态及用户已选个人展示样式。

`SSRootTabs` 替代重复的分栏绘制，仅管理外观，选择状态仍由页面持有。消息两个快捷入口合并为一个内容组，搜索保留原生文字编辑与清除；会话及个人管理按内容分组。背景、卡片、管理行及按钮等共用组件同步，子页沿用原业务入口。没有新增请求、业务状态或依赖，没有重新实现私聊／共同计划或邀请规则。

实际最大字号截图发现导航碎词、月历日期省略、装饰图标放大和日期挤压联系人名，修正后重新验收。固定导航／工具局部设字号上限，输入、姓名及正文仍用真实系统辅助字号；最大字号会话姓名与日期纵排。完整 AX 标签及 44pt 入口保持。

流程截图另发现已接受参与者的底栏仍提示等待大家确认，现复用既有三语文案「待发起人正式发出」。原接受／拒绝／忽略、发起人随时正式发出及日历规则保持。

日／周视图的固定 24 小时时间轴原用午夜后的实际经过分钟定位，导致夏令时切换日事件错位、秋季末小时可能消失，空白点击的反向转换也错误。现在以共用本地时钟分钟进行正反转换；事件真实时间不变，移动保留实际时长。重复小时在同一时钟位置分 lane，跨回拨区间显示覆盖的小时范围；空白默认第一次重复时间，编辑保留原 occurrence，春季不存在时间前进至下一有效时刻。独立复查发现并修正跨回拨卡片 resize 位移；两端都以真实端点加显示位移换算，无位移保留原秒数，跨午夜保留日期。

## 验证记录

实际最终执行、逐图范围、来源、设备与清理结果由本页下方证据记录；静态审查、离线布局和真实 API 流程分别记录，不互相替代。

最终原生 Simulator 单元测试 **54 项／5 组，0 失败、0 跳过**通过（Swift Testing 0.069 秒），覆盖时间定位、正反转换、春秋切换、末小时、重复小时两端 resize、跨午夜与既有日历行为。使用原目标及实际生产 helper；初版 53 项通过后因独立复查发现 resize 问题，被本轮最终结果取代。[单元测试证据](./evidence/2026-10-25-root-foundation219/dst-unit.json)。

| 真机验证 | 实际结果 |
| --- | --- |
| 完整计划 | 冻结基线包 370.779秒、8阶段API；创建→主人空闲提交并分享→App好友卡片→朋友填写→23:00至次日01:00→正式邀请→接受→发起人发出→双方各一条精确日历；接受后上下均显示待发起人正式发出 |
| 五根页／只读子页 | 同一基线包 688.415秒；中文浅深普通、德语浅深真实系统AccessibilityXXXL；五标题与原生底栏、44pt入口、分栏状态保持、计划最后可达段及固定发起位置。两组浅色另测创建取消、消息通知／招呼／搜索、日历三视图／搜索／连接／分类、资料编辑取消及设置往返 |
| 最后星期修复 | 仅将月历星期ForEach从重复缩写ID改为列offset，其他267产品输入保持；90.022秒、四组合月→日→月及8次捕获／4种像素补验，七列完整。未在这一行视觉metadata修复后重复完整计划／单元／全根矩阵；差异与来源单列 |

93次实际捕获／88种原始像素完成复核，完全相同者依SHA复用；五根四组合与最终星期补验分开记录。最终版本的月历图片来自补验包，不以缺列旧图作为最终效果。[星期差异](./evidence/2026-10-25-root-foundation219/weekday-repair.json)。最大字号消息键盘展开时空态正文不在当前视口，清除／取消仍可见；七列最大事件摘要仅省略，完整事件由日视图查看。最终未触发最大离屏提示，局部字号上限已作源码复查，不声称该浮层已获实图验收。

前置轮次保留：138.583 秒因分栏 AX 子节点标识被父标识覆盖失败，产品增加 contain 修复；161.945 秒因测试未先关闭 iOS 26 原生搜索失败，仅修测试；首次完整计划流程 370.801 秒和八阶段 API 通过，发现上述等待提示；四组合自动检查 688.816 秒通过，但最大字号像素复核未通过，不计最终视觉验收。

离线首页夹具不提交业务表单，其计划网络提示不代表真实加载成功。真实流程仅使用专用临时账号。长卡最大字号允许连续滚动，本轮首页测试只验证末段可达／固定操作不遮挡；不作全 App 所有子页最大字号、完整七列事件标题或纯人工性能声明。系统 AssistiveTouch 遮住的像素不计已验。

本阶段仅原生发布；分享网页／后端／Schema 不变，网页生产沿用此前记录 `dpl_3y9L5UfyX7v1hhUPsXGVg7Cg27zz`，不作为本轮重新部署结果。

[执行](./evidence/2026-10-25-root-foundation219/acceptance-runs.json)、[逐图](./evidence/2026-10-25-root-foundation219/visual-review.json)、[最简复查](./evidence/2026-10-25-root-foundation219/minimal-implementation-review.json)、[最终 API](./evidence/2026-10-25-root-foundation219/final-native-api.json)、[来源](./evidence/2026-10-25-root-foundation219/native-build-manifest.json)、[设备](./evidence/2026-10-25-root-foundation219/device-verification.json)、[清理](./evidence/2026-10-25-root-foundation219/final-native-cleanup.json)。

## 来源与正常交付

源码 **`e7e0a2ef1819d079c6f96d7883352536eb6affd6` 已提交推送**。最终268产品输入、Local、严格签名与冻结二进制同提交核验；Plan完整链／根矩阵与最后一行星期修复包的差异、测试源hash分开保留。默认设备UDID `00008110-001A69110CC1401E`，无QA参数普通启动PID9158已与真实进程核对。

两轮共4个专用账号及2条链接已移除，401／404核验；设备Runner、临时fixture、私密启动配置与独立测试工程清理。新增2份CPU资源报告，事件均为cpu usage、Action taken none，发生于自动化交互时间窗，含accessibility采样；并非进程终止报告，不作人工性能或新算法因果结论。[报告摘要](./evidence/2026-10-25-root-foundation219/resource-report-summary.json)。

受控布局夹具原图：[同行](./evidence/2026-10-25-root-foundation219/together-normal.png)、[计划](./evidence/2026-10-25-root-foundation219/plans-normal.png)、[日历](./evidence/2026-10-25-root-foundation219/calendar-normal.png)、[消息](./evidence/2026-10-25-root-foundation219/messages-normal.png)、[我](./evidence/2026-10-25-root-foundation219/me-normal.png)。[最终最大月历](./evidence/2026-10-25-root-foundation219/calendar-month-max.png)、[最大消息](./evidence/2026-10-25-root-foundation219/messages-max.png)、[接受后状态](./evidence/2026-10-25-root-foundation219/accepted-waiting-organizer.png)、[交付](../releases/2026-10-25-preview219-root-foundation.md)。
