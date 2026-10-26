# 计划：时间表原页直接发送邀请（Preview232）

用户2026-10-26明确：已填写时间表的人就是默认邀请对象，选定最终时间直接发送；额外人选在编辑区域添加，不再必经名单确认页。

默认名单取当前已提交的 `participants`，包含明确提交没有空闲的人，按原身份ID区分同名App用户／游客，不按最终时段有空与否筛掉人。已共享但未填写的人不自动入选。可选「更多 → 编辑邀请」只管理额外人选／原有链接容量；发送计划卡保留原真实动作，发卡后仍需明确勾选额外未填者。旧邀请改期保留实际已邀未填者，20人上限不截断自动名单。

最终选时页唯一明确发送按钮复用原接口；活动待定在原布告栏选定，再串行选择活动／发送邀请。发送前必须成功刷新，活动选择后再算当前名单；后台定时、场景与通知读取在发送期间暂停，避免覆盖该次刷新。失败、账号或版本变化不沿用旧名单。普通后台读取失败不会由通用「重试」首次发邀请，选时页只保留明确发送按钮重试。没有新后端／Schema／请求类型。

原账号／token／版本隔离草稿扩展可选额外人、活动和链接人数，兼容旧JSON；旧review恢复只回原页，不自动弹旧名单页或发送。个人空闲仍明确提交，发送不代替保存。零其他人仍可直接生成原开放邀请链接、默认含发起人两人，人数可选编辑。受邀者接受／拒绝／不回应、发起人随时正式发布、只通知已接受App用户与其唯一SideSeat日历、网页游客留链接，保持原规则。

## 已执行检查与范围

最终源单元 **62项／3套／4.224秒通过，0失败／跳过**；领域 **8项／398.691毫秒通过**。新增单元覆盖默认响应者／空提交／同名身份、额外ID交集去重、刷新新参与者、旧草稿兼容、503／禁重复与明确重试、成功／失败刷新Bool及私人草稿保留。单元运行于既有Simulator的Development测试宿主，与物理Preview分开记录。初次Preview scheme不含unit导致0执行，以及旧guidance两项断言／1例4.208秒失败，均保留；只修当前已生效的先填空闲推荐断言，生产推荐逻辑未改。

真机定向分次验收：普通中文／真实最大德文的额外人编辑、重启恢复、私人空闲不提交、发送三人 **189.787秒通过**；零填写生成链接 **23.845秒通过**；德文联系人按钮短文案只读补验 **24.940秒通过**；活动原页明确选择并真实发送 **56.215秒通过**。初轮3例失败及后续恢复草稿／嵌套视口边界失败记录在[分次记录](./evidence/2026-10-26-plan-direct-invite232/preflight-and-domain.json)，不称一次全通过套件。所有错误定位修正都保留完整可见、可点击和新控件44pt要求。

大字号实图发现新增德文发卡按钮发送动词被省略，仅缩短该德语value为 `Plankarte senden`；267其他构建输入及业务源码当时相同。随后补3处后台读取协调，无布局或文案改动；最终源重新单元验收，完整混合流程另验。最大字号旧长说明／大底栏保留，三人发送截图未展示完整名单，不能用AX3人数冒充名单像素。实际UI三人断言与只读API核验明确提交没空者、额外未填者都入选，owner服务端空闲仍为[0,1,2,3]，私人[4,5]未提交。

## 最终混合流程与交付

最终冻结232包在默认实体iPhone14Plus连续 **561.821秒通过，1项0失败／0跳过，15／15阶段及9项公开网页检查完成**。发起人和两位App朋友、三位独立Chromium／WebKit访客在同一新计划中实际填写，时间表直接向其余5人发送，不经过名单页；随后接受／不回应／拒绝、发起人随时正式发出、SideSeat日历、晚接受、退出、取消及最终双方日历清空全部完成。App业务由真机UI操作，游客由公开网页UI操作，API只读核对，没有API补写主计划进度。不是把早期focused失败拼接作主链通过。[完整结果](./evidence/2026-10-26-plan-direct-invite232/main-final-summary.json)、[15阶段及网页检查](./evidence/2026-10-26-plan-direct-invite232/mixed-real-flow.json)。

主流程67次实际截图逐张复核，原生51／网页16，53种全局唯一SHA；保存14张主流程原生代表图和16张网页图，其他安全原图留私密QA材料。focused另14次实际图已复核，保存8张，加初轮安全失败帧1张。名单需分段滚动，部分role后缀图是同owner视口的重复像素；系统AssistiveTouch遮局部状态，日历标题与详情不保证同屏，接受横幅不作新APNs送达证明。旧网页390px拒绝文字末字换行在原按钮内、320px回复控件完整。0新增像素阻断／主流程隐私排除；不称全App最大字号、物理Safari或Apple Calendar验收。[逐图范围](./evidence/2026-10-26-plan-direct-invite232/images-review.json)。

268项活跃／冻结来源、Local、严格签名及最后UI前后二进制hash一致。默认手机已安装232并空参数／仅TERM普通启动 **PID10784**，实际进程对应；普通97与既有Flow222保留，本轮Flow232Runner移除，无本轮新增App系统报告。QA用ephemeral凭据，未读取普通身份。6专用账号旧Bearer401／4个本轮计划公开链接404已清理；其中活动选择改名计划按受控token、发起人、实际选定标题与版本严格核对后单独删除，其他仍走原防护清理。

无后端／网页／Schema发布，三域仍Ready `dpl_8zqCd2KWQVtuaytvqu89hCaYM9d5`；公开flag不等于逐账户assignment。5个本轮临时上下文和25个私密配置已移除，活跃Local、共享产物和既有Simulator保留；原始结果／截图0700、日志0600。公开隐私扫描通过，见[扫描](./evidence/2026-10-26-plan-direct-invite232/privacy-final.json)，不在公开材料保留密码、Bearer、计划token或恢复凭据。最后一个临时扫描模式文件已在交付正文复扫后删除。

[普通原页发送](./evidence/2026-10-26-plan-direct-invite232/direct-invitation-dock-zh-Hans-normal-light.png)、[可选编辑](./evidence/2026-10-26-plan-direct-invite232/direct-invitation-editor-restored-zh-Hans-normal-light.png)、[最大字号短按钮](./evidence/2026-10-26-plan-direct-invite232/direct-invitation-largest-contact-action-de-dark.png)、[活动原页选择](./evidence/2026-10-26-plan-direct-invite232/direct-invitation-activity-chosen-on-timetable.png)、[零填写链接](./evidence/2026-10-26-plan-direct-invite232/direct-invitation-zero-response-link-before-sending.png)、[像素范围](./evidence/2026-10-26-plan-direct-invite232/images-review.json)、[来源](./evidence/2026-10-26-plan-direct-invite232/native-build-manifest.json)。
