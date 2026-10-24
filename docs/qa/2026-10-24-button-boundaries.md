# 按用途清理按钮描边 — Preview 201

用户指出消息顶部图标被套上多余外框，并要求检查全 App。以当前原生实现为范围：导航／工具图标透明无框，文字链接直接显示，常规次要操作保留软底，提交操作保留实色；字段、内容容器、选中／部分状态以及头像和角标隔离边界有实际用途，保留。

共用 `SSActionButtonStyle` 的 75 处显式使用及全局继承操作统一去掉强制 stroke；App 默认 `softFill: false` 取消普通操作的底框，同时保留原尺寸、字体及危险操作红字，显式次要控件自行保留软底。`SSPrimaryButton`、`SSSecondaryButton`、分享海报、收藏／联系和确认弹窗按钮去掉重复外描。消息新招呼／通知保留图标底色、名称和未读角标，移除整块外框；标签采用与紧凑导航一致的 xxxLarge 上限，完整辅助功能名称保持。通知「全部已读」使用共用无框工具图标，去除自定义底框与系统工具栏两层外观，已读规则和完整辅助功能名称不变。计划分享／好友行、Quick fill、卡片操作提示、长按菜单取消、日历智能输入取消／重来和屏外事件跳转也去掉多余装饰边。`SSFlowChoice` 只在选中时描边并保留勾选。逐类审查见 [审计记录](./evidence/2026-10-24-button-boundaries201/outline-audit.json)。

删除不再使用的 `ssActionOutline`、`actionBorder` token 和弹窗的边框计算函数；只增加一个控制背景的视觉布尔参数，避免删除全局样式后逐个补回点击范围和角色颜色。没有添加产品文件、状态、请求或依赖，点击范围／禁用反馈／按压反馈、原标识、路由、提交／邀请／日历规则保持。保留兼容功能的专用实现和合同，未读取或复用归档实现。

## 真机检查

同一最终 Preview **201**，默认 iPhone 14 Plus `00008110-001A69110CC1401E`，最后一次完整三项套件 **3 通过、0 失败、0 跳过**：[结果](./evidence/2026-10-24-button-boundaries201/final-summary.json)。

| 检查 | 最后同包结果 |
| --- | --- |
| 现有正常会话消息入口，只读元素截图 | **10.033 秒通过** |
| 中文普通浅／深、德文最大浅／深四组合：五主页、消息往返／搜索／创建取消 | **270.400 秒通过** |
| 登录主次按钮及密码图标：中文普通浅色／德文最大深色 | **39.335 秒通过** |

初轮正常会话 **9.561 秒**、四组合 **273.780 秒功能通过**；登录 **6.472 秒失败**，原因是测试 reveal 无条件查询登录页不存在的 NavigationBar，只修测试窗口定位，保留完整控件范围和点击断言。实际截图还发现最大德文快捷名称碎行，以及通知「全部已读」双层外观，分别修产品的标签字号上限和默认／工具栏外观。中途登录 **38.928 秒**、消息标签版正常／四组合 **9.587／272.615 秒**属于各自中间包；不冒充最终包验收。最后重新构建、安装后同次完整三项通过。[逐轮范围](./evidence/2026-10-24-button-boundaries201/acceptance-runs.json)。

父代理及两位独立审查者实际查看最终 **47 张**截图，未用功能断言代替视觉验收。消息名称保持两行以内、图标及角标清楚，通知工具栏无双底／标题挤压，创建和登录操作保留主次层级与完整文字。只保存 15 张经检查的代表实图，[视觉审查范围](./evidence/2026-10-24-button-boundaries201/visual-review.json)。

正常账号 [消息快捷区](./evidence/2026-10-24-button-boundaries201/normal-session-outline-message-shortcuts-strip.png)；离线夹具 [消息浅色](./evidence/2026-10-24-button-boundaries201/fixture-outline-tab-3-zh-Hans-light-normal.png)、[深色](./evidence/2026-10-24-button-boundaries201/fixture-outline-tab-3-zh-Hans-dark-normal.png)、[德文最大](./evidence/2026-10-24-button-boundaries201/fixture-outline-tab-3-de-dark-largest.png)、[通知普通](./evidence/2026-10-24-button-boundaries201/fixture-outline-notifications-zh-Hans-light-normal.png)、[通知最大](./evidence/2026-10-24-button-boundaries201/fixture-outline-notifications-de-dark-largest.png)、[创建](./evidence/2026-10-24-button-boundaries201/fixture-outline-creation-top-zh-Hans-light-normal.png)、[登录主次操作](./evidence/2026-10-24-button-boundaries201/fixture-outline-auth-primary-zh-Hans-light-normal.png)。

- 正常会话：无测试启动参数，只读进入消息，检查三个顶部入口和截图快捷区。不打开通知／招呼，不修改已读或发送。
- 受控离线夹具：中文普通浅／深色、德文最大字号浅／深色，五主页、消息通知与招呼进入返回、搜索清空、创建与提议切换取消；检查控件完整可见、44pt 范围和相互间距。
- 登录表单：中文普通浅色／德文最大深色，主次操作与密码显示图标。只输入本地测试文字，不发送登录、恢复密码或注册请求。

离线夹具的错误提示不作为真实 API 失败或清洁页面证据。详情、分享弹窗、日历智能输入／屏外事件控件仅做本轮源码审查；没有执行邀请到日历 API 完整链、单元／领域／浏览器测试，也没有服务端测试账号创建或计划写入。之前完整链的结果保留自己的日期与范围，不冒充本轮执行。既有菜单回顶、德文详情最大字号格子、固定底栏、额外末页左滑和 CPU 观察未修复。最终图仍可见德文最大字号日历周表日期抬头裁切／窄事件省略号，及若干很高的正文布局；这些几何未改，未确认为新回归，不称全 App 最大字号全页视觉通过。

## 构建和交付

[构建来源](./evidence/2026-10-24-button-boundaries201/native-build-manifest.json)：248 App／18 配置脚本与工程／1 共享资源从活跃 checkout 刷新，隔离工程输入及私密 Local 配置逐字节一致；最终全局工具底色／通知工具栏收尾重新构建后才运行最后完整三项套件，严格签名通过。无关 `tsconfig.json` 保留，不进入本轮提交。

本轮仅原生 UI 交付，无网页／后端／Schema 发布。api/www 只读重新核验 Ready `dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7`。

[设备核验](./evidence/2026-10-24-button-boundaries201/device-verification.json)：最终 **201** 普通启动 **PID 7916**，无测试参数，进程可执行文件与启动返回一致；普通 **97** 保留。严格签名和测试前后最终二进制 hash 一致。Runner、私密设备／测试 JSON、xctestrun 和生成 scheme 清理；日志 0600、结果和导出目录 0700。没有创建／删除测试账号或计划；从 **01:04:35 UTC** 基线后无新增 App 崩溃／资源报告，未删除既有手机报告。
