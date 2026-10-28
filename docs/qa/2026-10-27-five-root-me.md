# 「我」页面闭环检查：Preview260（NOT ACCEPTED／真机待重连）

**NOT ACCEPTED。** 本文记录2026-10-27—28的进行中状态，不能作为「我」页面或五入口整体通过的证明。同行、计划、日历、消息保留此前各自的验收范围；当前继续完成「我」。已完成的业务、画面与清理分开记录，后续用例必须实际闭环后才能更新状态。

活跃源码、默认iPhone14Plus及自有Simulator均为260，普通97保留；产品与QA20文件已提交并推送`9c501d8a9609adbc8929a06730a743716374fa49`，268项Git／活跃／冻结／构建输入及Local匹配，历史候选／安装／provenance证据不倒改。260反馈普通r1及最大AX5 full-r4的完整12阶段已分别通过并实际审图、精确清理；255 Core／Extended与258 FullProfile23／Courses16／专项保留各自范围，不写成260同包全套。

当前Me业务仅默认手机260资料7待用户USB重连／解锁回复，未执行，也未证明自动化恢复；正常手机最终启动尚未完成。官方QA同步后五源fresh build-only9.489秒通过，没有新增UI执行。消息nativeSwipe260八阶段仍严格待Me全部通过后执行；自有服务／DB与精确TS启动增量已收尾，本文档保存为独立检查点。Me及五入口整体NOT ACCEPTED，无本阶段后端、网页或Schema发布，HTsL只是上次生产核验记录。[260未验收检查点](../releases/2026-10-28-preview260-me-checkpoint.md)

## 已修复的问题

反馈投票的撤销请求使用可选`value`，Swift合成编码在nil时生成`{}`；现有API要求`value`键存在且允许null，因此撤销会被输入校验拒绝。255仅为`NativeFeedbackVoteRequest`增加显式编码：撤销发送`value:null`，UP／DOWN原值保持。不改变全局编码策略、资料PATCH中未修改字段的省略规则、接口或业务规则。

纯契约复现使用活跃DTO片段和现有API的原始schema片段：缺键被拒，null及UP／DOWN被接受。新增hostless Swift Testing suite使用完整新增unit正文，仅调整测试模块绑定；旧实现失败，修复后通过，共2个测试函数、nil／UP／DOWN三个参数情况。这不是完整App单元套件，也不是旧版本真实UI投票失败的复现。修复后真实投票与撤销由下方Feedback12单独验证。

## 已完成的255独立业务范围

| 范围／环境 | Native／controller秒 | GET轮次／ACK | 原PNG／unique | 当前状态 |
|---|---:|---:|---:|---|
| 基础资料与语言7，自有Simulator／生产API | 148.990／171.248884 | 7／7 | 2／2 | 业务、原图审查及清理通过 |
| 基础资料与语言7，默认iPhone14Plus／生产API | 157.618／188.758870 | 7／7 | 2／2 | 业务与原图通过；原controller保持false，独立清理补证通过 |
| 取消／确认解除拉黑6，自有Simulator／本地API＋DB | 94.847／108.969138 | 6／6 | 4／4 | 业务、原图审查及清理通过 |
| 反馈创建／投票撤销／评论12，自有Simulator／本地API＋DB | 187.224／201.695680 | 12／12 | 6／5 | 业务及清理通过；P3在258普通专项修复，259普通另有像素失败；260普通r1与MAX r4后来分别通过 |
| 退出／重登／取消删除／删除账号4，默认iPhone14Plus／生产API | 75.869／116.617693 | 4／4 | 0／0 | Native／GET、清理及独立资料复核通过；无画面验收声明 |
| 基础设置6，默认iPhone14Plus／生产API | 198.997／247.253468 | 6／6 | 2／2 | 业务、原图审查及清理通过 |
| 设置扩展12，默认iPhone14Plus／生产API | 230.823／279.475591 | 12／12 | 10／9 | 业务及原图审查通过；原controller保持false，独立清理补证通过 |

每项使用新建的两个专属账号、1个Native用例、0失败／跳过及0GET传输重试。GET轮次是阶段边界数，不是HTTP请求总数；不把独立账号、环境或QA版本拼成单次连续套件。每阶段先由只读GET／本地只读数据库核对，再以本轮nonce ACK允许Native继续，业务进展没有API补写。

基础资料7覆盖昵称／简介保存、重登保持、继续编辑／放弃修改、恢复初值，随后添加语言、保存与重登、取消修改、删除并恢复语言。保存与取消后的标准化资料hash相同，两次恢复均与基线相同，对方账号未变。两端各只保留两张首页原图，均实际查看；中间表单和放弃编辑弹窗以Native断言与GET为证，不宣称留存全部中间画面。真机AssistiveTouch部分盖住语言行右缘，未发现App文字或操作重叠。

解除拉黑6覆盖进入非空拉黑名单、取消保持、确认移除、双方重登及收尾。定向Block从1变0，原Connection始终BLOCKED，原两条TEXT及已接受FriendLink按精确ID和原值保留；双方Inbox／联系人为空，消息读取仍404，不会恢复旧聊天、计划或日历。联系人、两条TEXT和初始Block是明确的API前置，不计作App业务通过。4张原图均已实际审看，无material画面问题，无留存视频。

反馈12由空白反馈板开始，实际App依次取消草稿、创建提议、发起人重登、另一账号UP／撤销／DOWN／撤销、发表评论、评论者重登和发起人查看评论。没有API创建反馈或代替投票。每次投票的DB行、方向、分数、两账号myVote、作者、正文与评论数均精确核对；撤销后票数及DB投票行均为0，评论重登后仍保持。

反馈仅在自有隔离本地服务执行。开始前和每个阶段都核对实际父进程／监听进程、工作目录及邮件配置为空，证明邮件发送及反馈收件地址未配置；每个阶段`emailSentAt`／`emailProviderId`均为null。该范围没有发送邮件，也没有测试真实邮件交付。6张原图／5种像素已实际审看，无留存视频；DOWN1阶段没有单独原图，以Native＋GET／SQL为证。实际画面发现P3：列表导航行套用零水平内边距的通用操作按钮样式，灰色圆角背景随内容缩宽，文字贴近圆角边缘。258采纳plain列表行、整行布局与点击范围后普通专项通过；最大字号另发现真实P2，见下方258及259／260范围，不能把255或258最大画面写为零问题。

真机账号4业务、清理和独立资料复核通过：实际退出、重登、取消删除后保留账号，再输入本轮专属用户名确认删除；删除后原凭证GET为401，对方资料和业务保持。最后的清理bookkeeping只在UI删除已由GET证实后对账，未用API代替用户删除。owner由实际UI删除，peer由factory删除，receipt的accountsDeleted2是两者合计，不能写成两次factory DELETE。该成功方法无截图调用，留存PNG、视频和AX均为0，不声明删除弹窗或其他画面已验收。

真机设置6覆盖联系人隐私取消／保存／真实重登／恢复；主题system→dark→真实重登→system，以及语言system→en→真实重登→system，均按该设备原始偏好精确恢复。主题和语言是设备本地UI／重登证据，不是服务端GET字段；六轮资料核对及peer基线保持。实际输入反馈草稿再取消，浏览器帮助入口往返、个性化取消与会员非购买返回完成。该范围没有读取公共反馈列表，也没有独立证明服务端ownpost为0；反馈取消以Native草稿和返回断言为证，不计邮件测试。

设置6的两张原PNG／两种像素已实际查看，无视频或留存AX，无material App发现；中间隐私、语言、弹窗没有原图，不扩大为完整中间画面验收。截图只覆盖实际视口，滚出视口的上部行和AssistiveTouch覆盖范围保持限制。两次只读设备元数据查询首轮exit2，按500ms上限各重试一次成功；变更操作没有重试，API GET重试为0。账号4也有独立元数据重试记录，不能把0GET重试解释成所有工具都没有重试。

默认手机Core17是资料7、设置6、账号4三个分开的闭环；设置扩展12另用新账号独立完成，不能合称一次不中断套件。扩展12核对实际About唯一Cell的版本1.0.0／build255，留存两份真实AX；分享预览Done、系统分享取消后返回、隐私浏览器交接返回均通过，未对外发送或读取系统建议。当前仅一个配置城市，按只读城市核对，没有替换城市分支；通知已有设置，仅系统设置往返后核对原显示值保持，没有变更授权。

扩展中的教程首次1／5关闭、真实重登保留，再重放Next／Back、完成全部五步和最终重登通过；服务端仅owner教程字段产生两个严格递增的实际UI时间戳，peer在12轮资料核对中始终保持。会员空兑换码与无效认证邮箱均不可提交，没有兑换、验证码或证明材料发送。空意愿历史、课程入口及返回保持，未创建课程。10张原PNG／9种像素全部实际审看，无视频，无material发现；只有教程首末步骤有原图，中间Next／Back及持久化以Native＋GET为证。该轮业务12GET／12ACK及零GET重试通过，原controller因收尾两次apps元数据查询exit2保持false，独立清理详见下文。

## 新完成的258范围与当前待验收项

| 258独立范围／自有Simulator＋本地API／DB | Native／controller秒 | GET／DB轮次／ACK | 原PNG／unique | 实际审查 |
|---|---:|---:|---:|---|
| FullProfile23 | 761.948／779.675015 | 23／23 | 17／17 | 15项field AX、5坐标、1appearance viewport及3份Photos导航Cancel AX，无视频 |
| FullCourses16 | 259.237／275.340266（起止差） | 16／16 | 7／6 | 全原图实看，0AX／0视频 |
| NoScroll B5 | 149.415／166.002614 | 5／5 | 4／4 | 4项Profile AX及4geometry，无视频；只读未保存专项 |
| Archive B7 | 167.172／181.960766 | 7／7 | 11／9 | 11项课程AX，无视频；短归档专项 |
| Feedback普通12／English、L、浅色 | 188.062／203.744733 | 12／12 | 10／8 | 全图与4geometry实看；原P3列表行修复 |

FullProfile23完整到达照片取消22及peer UI23，学校／学生或校友／学位／专业及四项联系字段保存、重登、清空，预设头像与隐私取消／保存／恢复，Plus预览与免费外观取消／保存／重登／恢复均按原23阶段核对。完整资料字段以严格API标准化值比较，DB只读身份／认证／邮件null投影及业务0／原目录范围，不虚构所有资料列的原始SQL比较。五个原始清空路线自然保持完整可见，无QA gutter滚动修正；Photos仅导航Cancel，不读取图库。两账号／旧401、本地0、原目录、fixture／runtime均清理通过。

FullCourses16实际完成手动创建取消／保存／重登／退出取消与确认、收藏保存／重登／取消、归档删除取消／确认、恢复后自然关闭归档即在父列表打开同一课程、课表应用／重登／退出及peer终态。恢复后没有pull-refresh、范围切换、重登或API替代父刷新；官方时段按本轮唯一指纹核对周一09:00—10:00和精确地点，手动课程不虚构时段。精确三个自有课程目录项与两个账号／旧401清理，未知行0、原目录hash保持、fixture／runtime移除。258课程详情有非阻断英文“Remove from my courses”缺键观察，259只补中英德资源，CourseDetail业务源码未改。

258反馈普通12已实证列表P3修复；随后MAX r2实际失败Native130.263／controller166.668075秒、3ACK。画面作者宽度84.7pt被拆为六行，数字与图标重叠，属于实际P2，不是仅QA整行断言过严。259采用辅助字号AnyLayout：作者独占全宽，类型与计数另排一行；原字体、数据及投票／评论流程保持。但259普通完整12随后发现数字消失，不能将布局源码审查写成实际修复通过。

## 259／260反馈回归：普通260与最大字号分别通过

| App／自有Simulator、本地API＋DB | Native／controller秒 | GET／DB轮次／ACK | 原PNG／unique | 实际结论 |
|---|---:|---:|---:|---|
| 259普通L／EN／浅色 | 193.166／217.522769 | 12／12 | 10／7 | Native与数据通过，但列表数字0／1消失；像素失败，未验收 |
| 260普通L／EN／浅色，r1 | 192.539／213.514477 | 12／12 | 10／8 | 全部安全原图与4geometry实审、数字与图标分离，业务及清理通过 |
| 260最大AX5／EN／浅色，r1 | 163.716／199.114192 | 3／3 | 3／3 | 原controller false；详情仍在顶部，QA未滚动到懒加载投票行 |
| 260最大AX5／EN／浅色，r2 | 256.885／304.003445 | 8／8 | 11／9 | 原controller false；实际赞／撤销／反对／撤销通过，QA评论框查询错误，未输入评论 |
| 260最大AX5／EN／浅色，r3 | 265.573／304.383731 | 8／8 | 3张定向实看，未全图验收 | 原controller false；真实TextField已输入草稿，随后通用Submit reveal失败，未发送评论 |
| 260最大AX5／EN／浅色，full-r4 | 397.450／414.689045 | 12／12 | 35／27 | 全部安全原图、25AX／28geometry实审；单次发送、草稿清空、双方评论重登及严格清理通过 |

260仅将两个列表计数改为共用的显式Image＋verbatim数字Text，保留caption2、动态字号、已有三语读屏语义、AnyLayout作者布局及全部业务规则。普通r1从空板、取消草稿、创建、双方重登到投票／撤销、评论与发起人读回完整通过；四次真实右侧空白单点均为390,165（原geometry y165.666…），进入同一实际post与原正文。全部10张安全原PNG／8unique实看，列表0和评论1清晰、与图标不重叠。12次独立GET／DB、nonce与实际ACK、禁邮件监听进程证明、精确作者及正文、两次撤票为空和评论重登均核对；本轮两个账号／旧401、本地0、fixture与runtime清理。该结论仅覆盖普通L／EN／浅色，不是AX5或真机验收。普通验收receipt SHA `16a164133b0bb1c25d8d5bea4e0ed8fa68ff043516eed719d5e556b5fcced05c`。

MAX r1已实证作者单行、列表0／0与图标分开，402×496卡片完整位于402×675可用视口，390,364空白单点打开原详情。详情的长作者／标题／正文将投票行放到首屏以下；原QA只等待exists／enabled／Selected而未正常滚动。r2只为QA增加可见投票helper，保持可见时零手势、最多8次正常滚动、唯一实际详情容器、两个准确ID完整处于Nav／Tab视口且enabled／hittable，再执行原精确Selected／Not selected断言。两次进入详情实际各正常滚动1次后投票可见，8阶段只读DB及8ACK证实UP／撤销／DOWN／撤销，未通过API补写业务。

r2随后在评论框前停止：213.16秒首次TextField查询时该懒加载行尚未出现，`input()`根据当时exists固定返回TextView；之后12次向上、12次向下滚动一直查TextView，最终失败AX回到0%，没有评论框。相同App260的普通成功日志明确通过TextField完成Tap／Type，但r2没有捕获MAX评论框出现后的AX，当时不能宣称最大字号输入框实际可用，亦未建立App输入框故障。r2的8阶段、两次正常投票滚动、全部11安全PNG及失败AX均独立审查；原false、账号／旧401、本地0、fixture／runtime清理保持，不能与后来前缀相加作通过。

r3改为实际TextField查询后，真实露出、点击并输入精确草稿，空草稿及输入值断言均通过；失败目标是后续Submit，不能再写作“未输入评论”或“评论框角色未知”。输入前真实TextField为32,471／338×68，键盘／预测栏将内容视口裁到y116—539；原通用CollectionView swipe随后未露出提交按钮。末次AX回到列表顶部，不能仅凭此断定手势只滚输入框或App不可用。3张定向安全PNG及相关AX／几何已独立诊断，未声明全图验收；8ACK、原false、两账号／旧401、本地0及runtime清理保持。独立诊断receipt SHA `80a71128a19500cf3f1f76b5a6700b28101d73c69c54be4d4f2f9c45550aba13`。

随后另建两个新账号做短gutter诊断，明确通过API创建一条自有反馈仅作前置，不计创建／投票／评论完整流程。Native124.253／controller147.658091秒，6GETDB／6nonce ACK，全部9张安全PNG／7unique、8AX／8geometry实际审查。真实输入草稿后，3次x12、内容裁剪区内的正常拖动将Submit露为16,443／370×76，整框底519距预测栏顶539有20pt；保持键盘，真实Back取消，6轮恒post1／vote0／comment0且邮件null、资料及其他业务不变。Native唯一新方法实际通过，但observer错误匹配旧full12方法，使原controller／observer保持false、报告ACK数组未填；实际6份原nonce封装、ACK复制精确字节及Native ACK另经核对。精确2账号／旧401／DB0／runtime清理通过。独立评审SHA `d205a739e47a0145fe6299333dacee5735ae71a6190a5cf0122373608224e570`、唯一新方法终态补证SHA `1d3f5a1e6f3cf018e64c6fb21ba1375cbca42e40572f6dbbf38c5ea7d597e3e5`；原false和原字节不改，不把API前置或短6步计为full12。

最终full-r4独立重跑原完整12：由实际App空板开始取消草稿、创建、五次实际AX5登录、赞／撤销／反对／撤销、仅一次Send、真实field存在且异步清空、精确评论、peer及owner重登读回。普通已可见时0手势，MAX使用最多8次正常x12 gutter、实际Nav／Tab／键盘／预测栏裁剪视口；不让partial按钮或不存在的field冒充成功。实际Submit前3次拖动，第2次部分露出仍拒，第3次完整可用；发送后反向1次露出评论，双方重登各正常1次显示同一comment ID／作者／正文。四次真实右侧空白单点为390,395，均在所有Text／Image之外，402×558整行处于402×675视口并打开原post／正文；列表0／1与图标分开、作者独占一行。全部35张安全原PNG／27unique逐张实看、25AX／28geometry核对，12独立GETDB与12原nonce ACK精确原序，0重试；两次撤票DB严格0，最后四轮恰好同一条评论，资料及其他业务保持、邮件字段null／实际监听进程禁邮件。Native397.450／controller414.689045秒，ui0／observer0／controller通过，精确2账号／旧401／DB0／fixture与runtime清理完成。评审receipt `me-safety-feedback-sim260-maximum-rightblank-r4-review/scoped-report.json` SHA `92f10a969bc2f145bec784df86efb3149112a25341cd4a3596cf2a9ed68f708a`。该结论仅本次AX5／EN／浅色Simulator，不与普通r1拼为一次连续套件，也不代表Phone260或Me全页通过。

标准260-r1及MAX-r1诚实复用原cc3e、8.232秒实际两源QA编译；MAX-r2使用新e03d9637、8.727秒fresh两源编译；full-r4使用新Native `67bf5231452088648d9d56e83bcf7527cef89bca8c85b0afece8ef4887223c86`、9.109秒fresh两源QA及严格签名，freeze `7f4c3e22de7f4d5d8e446747ac4b770078e05f174d6d44bf2583f6e789bd076c`，不能称旧binary复用。旧259数字消失、258 MAX真实P2、r1／r2／r3及短probe失败／补证保持；这些QA修改均未改变App260。

| 范围 | 计划核对的实际操作 | 当前状态 |
|---|---|---|
| 基础设置6 | 联系隐私取消／保存／恢复；主题和App语言切换后恢复；反馈取消与设置返回 | 默认手机最终范围已通过；此前Simulator失败独立保留 |
| 账号4 | 退出、重登、取消删除、输入专属账号名称后真实删除 | 功能、清理及独立资料复核通过，无像素材料 |
| 资料扩展23 | 学校／身份／学位／专业／学期或毕业年、性别、联系信息、头像预设／免费外观、其余隐私与对方隔离 | 258完整23已通过；260业务源精确保持，不冒称260同包执行 |
| 课程16 | 手动创建／收藏／重登／退出；有时段课程恢复／应用／日历投影；过期记录移除 | 258完整16及父自然刷新已通过；260业务源保持，保留259三语缺键修复 |
| 设置扩展12 | 版本、分享取消、隐私页往返、城市条件入口、通知状态、教程关闭／完成、会员与认证边界、历史／课程入口 | 默认手机最终12阶段业务、原图及独立清理补证通过；旧失败保留 |
| 反馈12 | 空板／取消／创建、双方重登、UP／撤销／DOWN／撤销、单次评论与双方读回 | 260普通r1和MAX r4各自完整通过并审图清理；两次独立范围，不是一次连续套件 |

已执行的认证／会员／通知／分享／单城市范围以上文为准，不扩展成成功认证、兑换、授权变更、对外发送或换城市。照片短3及完整资料22均完成系统选择器取消，不声明照片上传通过。当前未开放的用户名、登录邮箱、密码编辑、公开资料／群聊等入口不因测试而启用。

临时257-B输入手势诊断已结束，当时Root先恢复自有Simulator255并核对Info、三项binary及签名，未采纳父输入行手势改动。原255以稳定后的真实窗口端点也能显示Select／SelectAll菜单，并完成严格清空，不能把旧脚本定位问题定性为必须修改生产手势；菜单出现本身不证明SelectAll操作已测通。后续另一条完整资料路径独立证实焦点输入被工具栏正面积遮住，因此258采纳的是焦点／键盘出现时复用原滚动定位，未采纳257-B手势实验；258已通过对应完整自然清空流程，该业务源现原样保留在260。

两个独立NoSave专项已通过并实际审图，均不计作Full23资料保存／重登或整页完成：

| 专项／自有Simulator255＋本地API／DB | Native／controller秒 | GET／DB轮次／ACK | 原PNG／unique | 范围 |
|---|---:|---:|---:|---|
| S5输入框 | 75.863／93.225844 | 5／5 | 5／5 | 稳定可见窗口端点点按，真实Delete删除旧值字符数＋1后严格为空、精确回填、Done、Cancel／Discard；不保存 |
| U5外观 | 89.510／103.831161 | 5／5 | 3／3 | Ocean＋None锁定提示和Save不可用、Rose＋Sun可用预览，两次Cancel／Discard；不保存 |

S5没有点击SelectAll或操作选择范围，不声明通过SelectAll清空；U5的Ocean行部分在截图上方，其选中以真实AX与Native断言为证。U5完整提示Cell／Image在实际Form视口内，读取内容不要求可点击。两项每轮owner／peer资料与本地只读DB均保持原基线，业务计数为0，课程目录保持；U5另核对FREE／null会员、membership／redemption为0。各自两账号／旧401、fixture及runtime清理完成，原图全部实际查看，无material发现、无视频。它们只证明未保存草稿及取消，没有成功保存外观、升级或持久化声明。

照片短3（W／255）独立通过Native73.451／controller88.744536秒、3GET／DB及3ACK，使用系统导航Cancel的语义定位后返回，未读取图库或相册资源。留存PNG／视频均0，仅导航Cancel AX，不能写为照片画面或上传验收。两账号／旧401、本地业务0、原课程目录、fixture及runtime清理通过；此Native语义取消已在258完整Full22实际完成。首W虽然UI结束码为0，oracle把默认随机preset误当null而失败，原false及清理保留，不能洗成旧Full23通过。

258真机资料新增尝试仍未完成：首preflight16.246367秒、0UI／0ACK因`/tmp`与`/private/tmp`路径别名QA guard拒绝，已修并清理；第二轮1.613442秒在0factory前拒绝已有Preview。精确重启后的92.448298秒一轮只有signed-in的1GET、无ACK，CoreDevice copy15秒超时且锁状态查询迟缓。rev3移除UI期间持续锁轮询、单次copy超时改30秒且不重试变更操作，但实际86.087051秒仍NativeStarted0，在启用automation mode超时，两个账号／旧401清理；不能声称copy30已成功。259／260手机尚无新增UI验收；260资料7仅准备，待用户USB重连／解锁后执行，不声称自动化已恢复，不切换其他手机或重启全局服务。旧259准备与复用编译证据保留，不写为实际执行。

另有260消息原生侧滑八阶段准备，尚未执行：DIRECT行已读／置顶两项恢复系统按钮样式，此前254已通过的是long-press菜单路径，不是原生swipe。旧A258从未执行，不伪造A/B失败或抹掉254原验收；新八阶段严格只在Me全部通过后执行。不可达Hide／legacy MyPosts／SavedPosts不随此改动启用。

## 保留的失败与恢复补证

- 首轮基础资料Simulator在17.021790秒、0UI／0ACK停止：私有观察器仍要求Messages执行开关。仅修正为Me开关，离线正反验证后重跑；原失败与两账号／旧401清理保留。
- 设置首轮Native21.461／controller58.676560秒、0／6ACK。测试通用44pt高度条件在点击系统Switch前拒绝；没有保存隐私、切换主题或语言。第二轮21.821／61.599473秒、0／6ACK，原生Switch的AX行中点落在左侧文字，开关仍OFF；严格值断言停止。两轮各自已清理两个账号／旧401，原视频和派生画面、失败状态保持。下一版QA只单次点击真实开关右侧，并严格等待0↔1，未放宽业务断言或修改App开关逻辑。
- 第三轮设置Native72.640／controller113.479271秒已完成隐私取消／保存／恢复、3／6GET及ACK，随后主题picker的实际值未被QA识别而停止，主题／语言闭环未完成。两账号／旧401、fixture及runtime清理完成。保留该轮失败，后续不能把三个通过阶段称为完整设置验收。
- 独立设置扩展首轮controller54.768560秒在baseline标记后、0ACK发生设备元数据失败，UI及observer由自有controller停止，原false及SHA `351b1285dac0f2ed567946d9050ed2ceee973c621de0d95b428f567b4f613a64`保持，不计业务通过。Root另核默认14Plus／Info255、完整执行路径与PID11750两次fresh匹配，仅停止该Preview；测试会话退出后factory清理两账号／旧401、fixture和唯一runtime，unknown0，独立恢复审查通过。下一次新账号尝试Native32.196／controller78.713090秒，baseline完成1GET／1ACK后，在About版本／build值的QA判断停止；该轮正常清理通过，不能称设置扩展完成。
- 最终设置扩展12业务、原生和观察器通过，但收尾apps元数据两次读取均exit2，原controller仍false，SHA `1f5e4b153b1dc7e3eea67d67543a2a1946e39c75e783063ddc56bdc924b7a4c3`未改。Root独立核对默认14Plus／Info255、完整执行路径与PID11805两次fresh匹配，仅停止该Preview；确认Preview／MeQA退出后按精确run及runtime归属factory清理两账号／旧401、fixture和唯一runtime，unknown0。业务、10张原图及恢复补证经独立复核通过，不倒改原controller，也不称所有controller为true。
- 首轮默认手机基础资料preflight在1.792559秒、0factory／0UI拒绝已有Preview。Root核对默认设备、Info及完整执行路径与fresh PID后仅停止该Preview，再执行新一轮。
- 真机基础资料7业务及原生测试通过，收尾CoreDevice元数据读取失败，原controller仍false，SHA `60d81bdef5731eb806d69ea79b7cf52da598b8e6556e1136aafd162cfd171f65`未改。第一次恢复发现Preview仍在，安全拒绝清理；随后重新核对默认14Plus、安装255和完整执行路径，PID11723连续两次匹配后仅停止该进程。自有Mac测试组、Preview／MeQA退出后，按本轮精确归属删除两个账号、旧凭证401、fixture.json和唯一凭据runtime，unknown0。原false和独立恢复补证均经只读复核，不称原controller全通过。
- 解除拉黑首轮13.759069秒、0UI／0ACK：前置Block接口实际返回201，QA期待200而停止。前置Block确实创建，因此按本轮归属清理；只将预期状态改为201后重跑，保留其他源码及QA产品字节，不计原轮为解除拉黑通过。
- 资料扩展23首轮Native12.531秒、0阶段／0ACK，在登录提交的可点击条件停止。Root随后只读检查发现该QA的启动环境遗漏本地API地址override，尚待修正后重跑；不能计入资料业务通过。该轮两个账号／旧401、fixture和runtime已清理。
- 资料扩展第二轮54.958秒、0ACK，键盘遮住登录CTA，触摸后未进入五栏首页；第三轮改用真实密码键盘Go，完成4ACK后在毕业年份Stepper的本地化子控件定位停止，Native180.301秒；第四轮只改为实际观察到的Stepper子ID，完成6ACK，Native236.353秒，之后专业输入框额外坐标点击落在重排后的键盘Done，失去焦点，删除事件失败。第五轮移除该额外点按，仍在完整旧值清空断言停止，Native235.490秒、6ACK。各轮两个账号／旧401、fixture及runtime已清理。QA保留23／16阶段及精确空值／数据断言，后续另做输入专项，不把此前阶段相加宣称23通过。
- 后续Full23在原255及已证明的稳定输入方式下完成16GET／DB与ACK，Native701.059秒，在会员锁定提示的只读定位条件停止；原轮失败和清理保留。U5随后明确只读提示／Form视口规则，但该专项没有补完Full23。课程旧轮完成6ACK，在实际收藏点按后POST尚未结束时过早读取而停止，已确认该请求耗时1173ms；没有API补写进展，该轮按精确归属清理。后续仅合入已证U5辅助和收藏完成的精确等待，最终258另立完整23／16证据，不把历史阶段相加作通过。
- 再次旧255 Full（9672）Native800.070／controller834.509630秒，21GET／DB及21ACK后在Photos旧索引定位停止，原controller false及SHA `8efaa906b54fedce94972a99996c7542f55ec1f51a4e4044a114e6f22be67c25`保持。21原PNG／21unique和五段安全外观视频帧实际审看；视频只审该五段，不称整段看完。21阶段证明资料／头像／隐私／外观的已执行前缀，不能补成Full23成功。该次普通自有Simulator受控两次同输入点按路径，major稳定503—525pt被toolbar491—539pt正面积遮住，属已证产品可用性问题；未单独证实单次点按或真机相同复现，QA手动滚回恢复不是产品修复。该轮已清理。
- NoScroll A／255独立失败Native107.419秒、3ACK，5PNG／4unique实看，另5AX／4geometry。此路径major自然359—381pt通过；Next后的Wechat469—491pt仅与toolbar491—539pt贴边，gap0、文字完整，没有正面积遮挡证据。失败在保留4pt安全边距的视口上界487pt，不得与旧Full major的真实遮挡混为一谈；原false和清理保持。
- 归档A／255明确对标题区域横拖仍无Delete像素或AX，Native60.857秒、1ACK，拖动前后两张原图均实看，只见Done及两个Restore按钮；该轮未执行restore，已清理。静态检查发现父列表与归档列表各自持有store、成功后缺父刷新回调，258新增onChange后父load；不能称旧255已通过UI复现父刷新缺陷。258归档B7及Full16后来实际补齐删除、取消、恢复后父自然刷新，原A失败保持。

## 来源与待收尾事项

当前260较259仅版本与反馈显式Image／Text计数组件两项变化，其余266项／Local保持；ProfileEdit、CourseList、CourseDetail、CourseStores、ChatsRootView及三份locale资源八个继承源逐字节保持259，资料／课程业务源仍等于已验258。这只证明来源保持，不是260同包全套重跑。双build141.627／171.930秒，每端164个App Swift＋1generated／165条FileList与实际编译、逐源SHA、产品三binary／严格签名／默认14Plus profile、编译后三语课程键和计数读屏键均实核。manifest SHA `89a2b4da5152cee72e455a40d9360f7fda038bd2a616b5001b4efb17c2f6e184`，provenance SHA `5f605354b0b307bf790c6e028c0e25fa6b89bcb0b4f2b6e83edceba8a000381b`，source-proof SHA `e68f215afaf28fa8a126ae19fd31be8fe46054fb7d11556a65d99c5e8c40082f`。Root已实际采纳、双端安装与读回Info260，主receipt `me260-app-adoption-receipt.json` SHA `21ed244dd35ee55df7f7da2fcc48477a9afd6622a480763632efe4d47ee9d9a8`及alias字节一致；手机执行字节未读取，自动化可用性及正常手机最终启动未验证。普通97保持，无普通身份读或reset。

实际MAX评审后才将Campus6与Safety3共九QA文件同步到官方源码：保留23／16／12业务阶段、物理设备guard与DB／邮件／nonce／清理规则；新增独立settings prepare／observer，不覆盖Main17。外部harness依赖和expectedBuild显式参数化、fixture／variant严格匹配；这些参数仍有既有owned目录及依赖约束，不宣称任意root通用。独立静态审查无material问题。随后官方五源fresh build-only实际9.489秒、5条FileList／5个SwiftCompile和两份严格签名通过，6个改动／新增Node脚本语法通过；没有由此新增UI、实际API或业务验收。产品8＋QA12共20文件提交`9c501d8a9609adbc8929a06730a743716374fa49`已实际推送，远端分支已包含该提交；268 Git blob／活跃／冻结／构建输入及Local逐项匹配，见[独立来源绑定](./evidence/2026-10-28-me260/native-source-commit-binding.json)。历史candidate／provenance／adoption原字节保持，本文档保存为独立检查点。

259历史来源保留：较258六项变化为版本、反馈辅助字号metadata布局、聊天DIRECT两项系统侧滑样式和中英德缺键资源，其余262项／Local保持；构建118.091／133.828秒及双端安装另立，主receipt SHA `ddcff6ffaf527d131aa7fc1a6e67bb23690ac05b640b282410cc26f143192a02`与alias一致。259普通12数据通过后原图显示数字消失，不能因构建、安装或前序源码审查通过而写为259像素验收。

258历史构建135.876／150.977秒、版本／反馈行／资料焦点／课程归档四项变化及264项／Local保持的证据仍留存；当时Root只停止完整路径及两次fresh匹配的Preview11811后双端安装。原candidate构建时未采纳／未安装标志保持历史原值，Root采用补证独立记录，不倒改旧文件。259及260普通r1诚实复用8.232秒的原QA产品；260 MAX-r2另有8.727秒fresh QA编译。原始通过、像素失败及未完成前缀分别记录，不将不同App／QA轮次合成一次通过。

255来源的历史范围仍保留：较254仅版本与投票DTO两项变化，266项／Local及两项备注修复保持；产品、版本和unit三文件提交`a0ffcaa7d5ed2cead737245ae7a56b7db80d0a6d`已推送。当时268项Git blob逐字节等于255已构建／私有冻结／活跃输入，原构建时uncommitted记录不改；这不等于当前260未提交改动也已绑定该提交。新增unit源不在App清单内，另记SHA。

上述七次255业务各自的两个账号均已删除、旧401及fixture.json／凭据runtime已清理，账号4由owner实际UI删除与peer factory清理合计，真机基础资料与最终设置扩展使用独立恢复补证。258完整资料、课程及专项、259普通、260普通／MAX r1—r4与短probe均按各自精确归属清理，旧false和像素失败不改写。

最终收尾已实际完成：先以canonical `/private/tmp` frozenCampus `verify-after-cleanup`得到精确成功文字，确认自有users／business0、原catalog SHA `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`保持、unknownDeleted0。确认无自有UI与锁冲突后，fresh parent97096／listener97106的UID、cwd、command、start、PGID及mail heartbeat两次匹配，仅TERM自有PGID97096，未KILL，3344已关闭；准确15434容器只stop并保留、未remove。随后仅在当前文件匹配启动SHA时恢复tsconfig至 `d46e76c6e35074916301d3de58624167dc63084e04f5c252f50e64ca356b630c`、next-env至 `85ae5aee75f011967cf2d25cbc342f62d69314e9d925f7f4aa3456fc2cffcca6`，当前哈希已独立读回、用户原tsconfig修改保持。其他服务、容器和设备未动。收据`me260-official-qa-build/local-services-closeout.json` SHA `0e286090aef46c6b382328af6bb5e24fc46b484fb82e93fc29b88a1fe1945192`；未来任何本地测试须显式新启动、新PID／监听与实际禁邮件证明，97096只是历史PID。

Me业务补验仅默认Phone260资料7待用户USB重连／解锁回复；正常手机最终启动仍待真机复测后完成。消息260原生侧滑八阶段仍仅准备，严格待Me全部通过后执行，五入口整体NOT ACCEPTED。构建／失败／补证上下文保留，不把服务收尾写成真机或业务通过。
