# 聊天入口去掉多余轮廓 — Preview 202

本轮延续201按钮边界清理，针对当前可达私聊入口：顶部头像／名称与“更多”取消系统共享底板，“更多”改为无圈省略号；输入栏“计划”去掉灰色圆底。相识意愿条及聊天信息的参与者行取消共用按钮重复软底；未读／回到最新保留各自单层浮动底色。输入框、消息气泡、内容卡片、菜单、地图上的材料背景及发送／取消回复语义图标保留。

只复用现有 `ssStandaloneAction`、`SSActionButtonStyle(softFill: false)`，未新增产品组件、状态、请求或依赖。顶部名称和更多补足44pt下限，其他命中区、ID、禁用／按压反馈、路由、草稿及邀请／日历规则保持。当前计划条与记录原本已是无框操作，不做重复修改；兼容附件面板仍不可达且未改动。[逐项审计](./evidence/2026-10-24-chat-entry-buttons202/chat-entry-audit.json)。

## 检查范围

默认 iPhone 14 Plus，UDID `00008110-001A69110CC1401E`，同一最终 App **202**。测试只用本地夹具及回环不可用 API：中文普通浅／深色、德文最大字号浅／深色，聊天顶部／计划打开取消／未发送草稿／信息／搜索／参与者资料往返；独立未读跳转／真实滚动触发最新／返回底部。没有点击发送、提交计划、修改备注、结束或拉黑，也没有打开真实聊天、修改真实已读。

最后同一最终安装包、同一次完整套件 **2通过、0失败、0跳过**：[结果](./evidence/2026-10-24-chat-entry-buttons202/final-summary.json)。

| 检查 | 最后同包结果 |
| --- | --- |
| 中文普通浅／深、德文最大浅／深四组合完整聊天入口往返、计划取消、草稿保留 | **244.413秒通过** |
| 未读定位、真实历史滚动显示最新、返回底部 | **22.649秒通过** |

父代理及两位独立审查者实际查看最终 **19张**截图，保存 **10张**代表图。更换系统关闭步骤后全部四组合完成；分隔线收尾后重新完整跑过，未沿用旧包功能结果。[逐轮范围](./evidence/2026-10-24-chat-entry-buttons202/acceptance-runs.json)、[实图审查](./evidence/2026-10-24-chat-entry-buttons202/visual-review.json)。

[聊天浅色](./evidence/2026-10-24-chat-entry-buttons202/fixture-chat-entries-zh-Hans-light-normal.png)、[深色](./evidence/2026-10-24-chat-entry-buttons202/fixture-chat-entries-zh-Hans-dark-normal.png)、[德文最大](./evidence/2026-10-24-chat-entry-buttons202/fixture-chat-entries-de-dark-largest.png)、[聊天信息](./evidence/2026-10-24-chat-entry-buttons202/fixture-chat-info-zh-Hans-light-normal.png)、[未读](./evidence/2026-10-24-chat-entry-buttons202/fixture-chat-unread-jump.png)、[返回最新](./evidence/2026-10-24-chat-entry-buttons202/fixture-chat-latest-after-history-scroll.png)。

本次按钮入口未发现新增视觉阻塞。既有最大德文正文卡仍有拆词，最大草稿截图只显示首段，不能以草稿值保留的功能断言声称全文同时可见或最大字号整页完美。系统原生返回圆底及AssistiveTouch浮层保留。

## 逐轮记录

- 初轮：主用例 **25.567秒失败**，合并AX上下文行frame包括导航栏，原归一化点击命中了导航区域；改为实际窗口与导航栏下方可见区域中心。未读用例 **19.844秒失败**，12条未读全部可见时“最新”本来就不显示；修测试，先确认未读定位，再真实向历史滚动触发“最新”。
- 第二轮：未读／最新 **22.219秒通过**；主用例 **20.736秒失败**，系统浮动面板将逻辑44pt控件投影为42.355pt。只对原生面板关闭按钮按实际面板宽412／窗口宽428换算逻辑点击区，继续断言可点、完整在屏及真实关闭；其他控件仍44pt。
- 第三轮主用例 **51.180秒失败**：面板关闭已通过，搜索启动时系统原生“关闭”代替源中Done标识，测试改用实际工具栏按钮；产品包未改。实际测量 sheet=(8,429.632,412,488.368)、Done=(351.012,448.885,45.885,42.355)、window=(0,0,428,926)。

- 第四轮：主用例 **53.543秒失败**，系统Close只结束搜索输入，随后应点击本页Done关闭；修测试按真实两步退出。未读／最新 **22.666秒通过**。
- 实图复查发现聊天信息意愿条中央多余竖分隔线，移除该装饰overlay并重建202；前四轮均属于此视觉收尾前的包，后续最终验收需用新包完整重跑。

- 最终包最初两次尝试在测试启动前 **destination timeout**，Xcode提示observing system notifications failed；0个用例执行。随后CoreDevice核验USB连接、booted、developer mode enabled、DDI可用及passcodeRequired=false，重连后仍超时，随后只重启Mac侧CoreDevice服务并重新核验默认设备，重试同包测试。不把基础设施失败算作功能通过。

初轮和中间结果保留自身范围，不冒充最终矩阵通过。前四轮定位／尺寸修复只改测试，期间旧包不变；实图分隔线收尾后重新构建并冻结最终源码和二进制，再重跑完整套件。

## 构建与交付范围

[来源](./evidence/2026-10-24-chat-entry-buttons202/native-build-manifest.json)：248 App文件／18配置脚本工程输入／1共享资源从活跃checkout刷新，私密Local配置逐字节一致，严格签名通过。无关 `tsconfig.json` 保留。没有读取、复用或更改归档实现。

[设备核验](./evidence/2026-10-24-chat-entry-buttons202/device-verification.json)：最终202普通启动 **PID7963**，无测试参数且进程可执行文件与启动返回一致，普通97保留。测试前后最终二进制hash一致，严格签名复验通过；Runner与私密设备／测试JSON、xctestrun和生成scheme已清理，日志0600、结果与导出目录0700。从本轮初始报告列表基线后无新增App崩溃／资源报告，未删除既有手机报告。

本轮仅聊天UI与入口专项，没有执行邀请至日历完整API链、单元／领域／浏览器测试，也没有创建或删除真实账号／计划。公共配置只证明原生认证可用、维护关闭，不证明真实聊天发送或用户实验组；[配置范围](./evidence/2026-10-24-chat-entry-buttons202/public-chat-flags.json)。无网页／后端／Schema发布，api/www只读核验仍Ready `dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7`。

既有德文最大日历日期裁切、详情格子、长底栏、菜单回顶、额外末页左滑和CPU观察未修复或重新验收，不能称全App最大字号全页通过。
