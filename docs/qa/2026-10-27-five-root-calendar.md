# 五入口验收：日历阶段

**状态：日历未通过。** 同行236和计划238已通过；日历9个分开业务组已在Simulator244／246／250／251各自闭环，Files251完整8阶段及focused7额外回归通过，原PNG均实际审看。Phone已装251、普通97保留；14:41已解锁并精确重启，默认iPhone14Plus Core12已469.055秒／12GET轮次12ACK通过，12原PNG全审。251撤销弹窗空灰图标尚未修复，私有252两端已构建，尚未采纳／安装／验图。消息／我业务未开始；日历完整验收后才进入下一页。

## 当前修复

238真实截图中，个人日程详情右上角“编辑”被挤成两行，与分享共用系统背景，入口难以辨认。239改为现有工具栏组件的独立分享、铅笔操作，保留原本地化辅助标题、ID、条件和回调。只读计划投影仍没有编辑／个人日程分享。

239仅 `HomeRootView.swift` 和版本配置改变；其余266项App输入保持238。手机和Simulator构建成功，268项活跃／冻结／构建上下文输入、Local配置字节及严格签名已核对。默认手机已安装239；不能直接读取手机已安装的可执行字节，不作该项声明。

本阶段没有API、网页、Schema或生产部署改动，生产仍为 `dpl_HTsL9cNjKSrWp2wQUMGKGaj9ifvZ`。

239四组合的自动化交互随后通过，但实际审图发现最大字号详情图标压字，以及中文legacy日期编辑行横向溢出，因此视觉验收仍失败。240候选已通过独立最简复核，手机／Simulator构建、严格签名成功，268项输入及Local三方匹配；仅3项改变，265项保持239。已安装默认手机，Simulator四组合复验进行中：详情图标取消固定24×24占位；旧非五分钟日程的原生DatePicker仅在辅助字号改为纵向graphical布局，原值、绑定、范围、时区、ID、普通compact与五分钟分支保持。手机在240候选阶段仍锁屏，未启动该轮真机工具栏或完整业务验收。

241继续把重复截止的原生日期控件接入同一自适应布局，修复240实际审图新发现的横向裁切；其余规则和HomeRoot240保持。两构建／签名及268项输入核对通过，较240只2项变化、266保持；已安装默认手机，普通97保留。单中文最大字号诊断105.331秒通过，4图／4unique均实看，三个日期控件和Repeat可滚动完整呈现；选中月／日／分钟只在同一Editor实例比较，不跨每次会随Date.now重建的搜索fixture作持久化声明。241完整四组合601.374秒及独立德文最大菜单64.342秒分别通过，最终35captures／30unique全部实际审图；保存16安全原图，来源b6825f42已推送。德文收起的原生菜单值仍中间省略，展开选项完整，菜单外关闭后原值不变。真机仍锁屏，日历整体未通过。[布局专项与原图](../releases/2026-10-27-preview241-calendar-layout.md)。

## 闭环覆盖与执行状态

| 流程 | 必须核对 | 当前状态 |
|---|---|---|
| 个人日程／分类 | 真实登录，月周日、Today、搜索和草稿取消；分类新建／改名／改色／删除；日程新建／搜索／详情／编辑／重启／删除；分类删除后日程保留；第二账号隔离 | Simulator244完整12阶段通过：Native456.825秒、UI0／observer0、12GET／12ACK；12张原PNG全部实看，双账号隔离和清理通过。另默认实体Phone251完成469.055秒／12GET／12ACK，12原PNG全审；各普通字号范围分别记录 |
| 个人日程共享 | UI生成并复制过滤后的链接；另一自有账号打开、添加、重登、再添加防重复；独立修改和源事件删除不影响副本；双方UI清理 | Simulator244实际完整13阶段通过356.445秒，13核验轮次／13ACK，11原PNG全部实看；真实原生Paste校验Copy、过滤、幂等和双方副本独立通过。旧controller因本机PythonCA在最终URL检查失败保留false；同一已清理链接另用标准TLS Node GET补证404。2账号／旧401／凭据封装清理；不声明Safari关联选择 |
| 日期时间与搜索 | 非Today跨月／周切换；创建起点／取消；空标题恢复；真正修改日期和时钟；搜索空态改词恢复、日期保留、重启读回 | Simulator244新cohort完整通过203.888秒，8核验阶段／8ACK，双方精确时间和重启／删除闭环；5张原PNG均实看，2账号／旧401清理；仅普通中文浅色 |
| 周视图替代写入 | 移动／调整时长的取消与确认、精确时间；复制粘贴和立即复制；按ID清理 | Simulator250完整263.788秒／13GET轮次13ACK通过，5原PNG均实看；09:30／11:00及三独立副本、重启／删除闭环通过；输入只放慢速度，旧失败保留；非Phone或最大字号 |
| 重复日程 | 范围选择取消保留；本次修改隔离相邻项；以后／全部作用边界；范围删除收尾 | Simulator244完整通过294.555秒，10核验阶段／10ACK，无重试；本次例外重登保留、以后拆分新系列、全部只作用于当前拆分系列及逐项删除通过。2张里程碑原PNG均实看，2账号／旧401／凭据封装清理；仅四天窗口，非无限历史审计 |
| 系统连接与传输边界 | 文件导入／导出选择器取消；自有订阅创建、复制、重登、撤销取消／确认；撤销后feed404与无缓存；另一账号隔离 | Simulator246完整10阶段通过167.957秒，10GET／10ACK、6原PNG全部实看；Copy／原生Paste、取消保留、确认撤销及重登0、feed200→404／no-store和最终清理404均通过。2账号旧401／runtime清理完整。另同源focused111.549秒／7阶段通过；仅普通中文浅色，不确认Apple系统订阅或外部Cancel，不读写普通文件 |
| 文件传输成功分支 | 非空单次日程UI导出到本轮Files目录、删源、选该文件导入、精确新ID读回／重登／删除 | Simulator251完整367.111秒／8GET轮次8ACK通过，12PNG／10unique全实看，无成功视频；439B单VEVENT与原API ICS的UTF8全文一致，Imported1／Skipped0、完整字段／新ID／重登／删除重登0及peer0通过；1次限定GET重试，文件／目录和双账号旧401清理完整。仅基本字段，不是完整分类／系列备份恢复 |
| 日程同行人 | 自有ACTIVE联系人选择／保存／详情／重登；取消移除保留、正式移除、删除；另一账号无日程或新邀请 | Simulator244完整通过453.293秒，10核验阶段／10ACK，无重试；10张原PNG均实看，2账号／旧401／凭据封装清理。仅自有ACTIVE联系人前置；现有功能只记录owner日程同行人，不新增邀请规则 |
| 智能文字输入 | 真实UI输入／解析预览／草稿Apply仍0事件／正式Add／详情、重登、隔离、删除 | Simulator244完整通过363.779秒，9核验阶段／9ACK，无重试；本次真实UI解析一次，未修正AI字段来通过断言，Apply仍0、正式保存恰好1条、同ID重登及删除闭环通过。30PNG／22unique全部实看，2账号／旧401／凭据封装清理；仅单句单事件，不涵盖语音／图片 |
| 工具栏视觉与路由 | 中文／德文、普通／实际系统最大字号、浅／深四组合；分享预览取消、编辑取消；计划投影无修改入口、管理入口可见 | 241四组合及独立菜单通过，35图／30unique全实看；244输入focused四组合通过590.863秒、48PNG／40unique全实看。后者仅四字单段Notes首行及Done，不代表整页大字验收；实际发现同行人碎词、固定网格时钟严重省略，私有245待实际UI验证。Phone待解锁 |

以上共9项独立业务用例，均有各自GET／ACK／UI终态及清理范围；准备或部分阶段通过不算验收。九组成功分开运行且版本不同，均限自有iPhone17Pro／iOS26.5 Simulator、普通中文／浅色，不能合成251同包不中断套件或默认手机通过。文中GET阶段／轮次指独立状态核验，每轮可能包含多条HTTP请求，不是HTTP请求总数。Apple Calendar、文件导入／导出和受开关控制的智能输入范围单列，不能以事件CRUD代替这些集成的验收。不得接触普通账号的系统日历或个人文件来补齐结果。

## 已发生的失败与范围

- 三次最初Phone运行在自动化会话初始化前失败，真实用例和业务检查均为0。专用自动化呈现进程恢复后，独立无fixture smoke实际执行并按预期跳过；这不是业务验收。
- 随后Phone238实际执行个人日程／分类流程，完成4个GET检查后，测试在备注输入未取得键盘焦点时失败。已删除靠右边缘的二次点按，改用实际原生输入、系统全选／剪切与精确文本读回；保留完整内容断言。没有证据把这次失败归为App保存错误。
- 独立Simulator238补充用例的UI完成12阶段、522.840秒通过，但只读observer在8／12后发生传输错误，所以整条补充验收仍失败，不能称完整通过，更不能替代Phone。
- 239工具栏初轮把原生sheet的AX框误当作完整布局命中区，44pt断言失败。后续中文普通字号分别实点分享／编辑中心偏移的八个采样点，均打开正确页面并取消返回，UI0、160.156秒；9次截图／5种像素均实际查看。源码声明44逻辑点，观察到AX高度42.25屏幕点；八点采样不能证明连续44屏幕点命中区，也不能证明其他组合或真机已通过。
- 四组合初轮在计划管理入口的滚动定位失败。已限定当前详情List及标题，继续要求管理入口完整可见；没有取消断言，也没有修改产品或点击管理入口。
- 修正滚动后的239四组合交互通过；实际20图全部审查后拒绝视觉验收。最大字号中德详情图标覆盖“开始／结束”，中文编辑日期行超出卡片。普通组合没有这两项重叠；最大字号单行活动名称输入框的省略／横向滚动另列范围，不混为标签裁切。240必须重新审图，不能沿用239交互通过作为像素通过。
- 239实体工具栏运行在测试开始前明确提示设备锁屏，实际用例0。已停止这一条自有等待命令，等解锁后使用修正后的runner重跑；没有切换其他手机。

241首轮Simulator core实际Native失败224.891秒，UI／GET／ACK均只完成4／12；observer结束后controller过早中断自身Xcode导致result bundle不完整，不能归为App闪退。controller现会在Native已报失败时先留自然收尾窗口，该2账号旧凭据401已清理。后续仅在离线假数据、loopback9执行文字输入诊断，无真实Save或API写入。普通点按备注能滚到真实键盘上方；HID CmdA令键盘收起／重现后遮挡，因此撤回快捷键测试方案，不据此修改产品。随后短文本末尾z探针、按实测字符数普通退格、严格空值与完整输入读回的独立离线诊断90.163秒通过，1项0失败／跳过；6次probe／清空、3次完整读回及Done后键盘离开均通过，Cancel完成。29原PNG／23unique全部实际审看，Notes保持键盘上方；只覆盖自有短单段值，不泛化长／多段文字。Core推广后两平台generic编译／签名通过，保留12阶段与原业务断言。旧失败保留。

Core使用新helper的新cohort重跑仍失败：Native87.193秒、UI65，只完成2／12 GET与ACK；原因是新测试误要求分类Form容器本身isHittable，不能据此判定其原生输入不可操作。实际录像末帧为完整新建分类页，没有App崩溃证据。已改为collection／table／scroll逐类查找唯一含calendar-name的稳定索引，输入可见／可操作断言保持，Phone／Sim重新编译冻结后再从头跑。该2账号删除与旧bearer401、fixture及credential runtime移除已完成；controller真实确认Mac自有session及指定Simulator的runner／Preview无活job后才清理。自有本机dummy父子／父退出孤儿两项、无关sentinel保留，以及runtime写出后meta失败的识别等6项离线收尾测试通过；不是新的业务验收。

后续两次Core各完成4／12 GET与ACK，Native235.698／235.186秒后因冷聚焦四字备注的末尾探针失败停止；标题／地点的精确清空和修改已过，尚未保存该备注修改，不能计整条通过。离线诊断10的四字第二轮为持续聚焦；真正Done后再冷聚焦的诊断11失败，已修正覆盖范围。诊断12原生双击无选择菜单；只改UITextInput类型判断的242候选同样失败，已将活跃源码、构建上下文、产品和Simulator完整还原241，Phone始终241。只取消window点击识别器的243私有实验也未改善该项，未发布。诊断13因短表单无法在无键盘时滚到上半屏，停在几何前置，未检验工具栏假设。244私有安全区Done栏实验首次出现原生选词菜单，单次剪切后仍剩两字，按严格全空要求失败；这是部分交互恢复，仍不是完整替换或业务通过，待同原冷探针对照。以上实验均为假数据／loopback9，无业务API或账号；截至该实验检查点，活跃源码及手机保持241。

分享最初两轮真实用例均仅完成2／13 GET与ACK，Native87.677／95.194秒后在隐私开关预览停下；实际失败原图均显示备注开关仍关闭，当时尚无链接生成或副本验收。默认点按覆盖整行的AX控件未触发实际开关，后续只修正QA的真实控制区点按；没有改变数据预期或API补写来跳过。两轮各2账号已删除、旧bearer401、凭据封装移除。离线Weekly planning样本note:nil，未拿它冒充有备注的开关用例。另一轮分享测试因Runner直接读取UIPasteboard触发系统权限边界而中止；最终改用App内原生Paste读取实际复制链接，取消草稿后仍要求日程总数不变。

重复日程旧轮218.485秒完成6／10阶段后，长标题末尾探针在横向滚动输入框中误把可见右沿当作全文结尾；该轮失败与清理记录保留。独立离线原生三击／软件Delete严格清空诊断80.412秒通过，12PNG／11unique均实看，才仅推广到Advanced测试的非空标题替换；最终新cohort完整通过，产品输入规则未改。

同行人首轮前置GET因QA缺少实际App使用的Persistent-Intent头返回426，真实UI0；仅补QA声明头。后续同行人与Smart各有一次原生中等高度详情sheet的延迟／屏外行定位失败；改为真实原生滚动、展开sheet并保留完整可见和具体值断言后，分别用全新账号从头通过。Smart旧轮真实解析与最终轮分开记录，不能把本次“一次解析”扩展为所有历史运行只调用一次。

系统连接旧轮分别止于文件选择器当前文件夹缺Cancel、外部Calendar返回的前台状态时序、撤销框按钮AX角色定位。已验证的取消／返回前缀保留，不计整条通过；未确认外部系统订阅或操作普通文件。最新精确撤销控件测试结果仍待收齐。

## Preview244 当前检查点

原生键盘工具栏挤占冷备注编辑的可用区域。244在两个实际日程编辑页复用安全区底部“完成”栏，以已有focus状态控制显示；原有空白处收键盘、滚动收起、文本／保存／邀请／日历规则保持。仅版本、CalendarEventEditorView与CalendarSmartAddView三项输入改变，265项保留；268输入、Local、两产品签名与binary provenance已核对。默认iPhone14Plus已安装244，普通97保留；尚未解锁执行244真机UI／普通启动。

相同旧诊断11源码在244实际通过93.728秒：六次严格末尾探针／清空、三次完整输入、Done收键盘和Cancel均通过，35PNG／27unique均实际审查。真实新账号Core随后完整通过456.825秒，12个GET与Native ACK顺序一致且无重试；创建、修改、重启、分类更改／删除保留日程、删除重启空结果及第二账号隔离通过，2账号删除／旧bearer401、凭据封装移除。12张业务原PNG全部实看；仅保存视口、普通中文浅色Simulator，不宣称全页／大字号／真机完成。原失败证据保留。

分享开关的独立离线诊断14实际89.541秒完成：两种进入路径中，开关AX覆盖整行，XCTest默认tap均未改变值，未记录其实际落点；实际右侧开关控制区点按均完成关闭／开启。该诊断不生成链接／写入日程。最终Share保留13阶段及隐私断言完成；原controller在业务和账号清理均通过后，因本机Python CA验证错误仍保留false。同一已清理的实际复制链接随后用标准TLS Node GET另行补证404，未重写旧结果，也不是另一次UI重跑。仅覆盖App打开复制的HTTPS路由，未验收Safari／系统Universal Link关联。

244四组合focused回归590.863秒通过，48原PNG／40unique全部实看；普通／实际大字输入首行和Done无重叠，仅四字单段Notes首行，非整个多行控件。Smart最终业务另实看草稿标题聚焦、Done收键盘及原值保留。最大字号Companions碎词与固定网格时钟严重省略仍使整页视觉验收未通过；私有245候选只针对这两处UI，尚未执行其完整视觉用例或采纳，活跃源码／两设备安装仍244。

六组最终scoped报告已逐项核对：`calendar-sim-core244-final`、`calendar-advanced-sim-timing244-day-final`、`calendar-share-sim244-native-paste-final`、`calendar-companions-sim244-sheet-final`、`calendar-advanced-sim-recurrence244-triple-final`、`calendar-smart-sim244-sheet-final`。原始结果和逐图索引位于0700私有目录 `/tmp/sideseat-five-roots-private`，未公开凭据或原始认证日志。重复日程仅2张里程碑截图；各用例的未截图中间状态以原生断言和独立GET／ACK核对，不声称连续像素覆盖。

## 隔离与收尾

历史上截至重复日程首轮收尾的检查点，两组Phone自有账号共4个、十六组Simulator自有账号共32个已删除，旧bearer均401；该数字包含失败准备，不是当前全局累计或通过人数。上述六项最终运行各自另有独立2账号删除／旧401与凭据封装移除证据，部分fixture目录仅保留清理回执，不能宣称整个目录已删除。Phone第二组仅factory前置，没有执行业务；4份旧Phone凭据运行封装已移除，后续真机必须新建独立空账号。

新用例用独立GET核验后才释放下一步UI。同步文件只写自有UITest runner的Documents，App无新增钩子；随机nonce全局独占登记，拒绝跨运行复用，终态还需完整ACK顺序。Mac实际对自有runner完成一次文件复制／读回，9项完全离线helper测试通过；这些不是实际Phone闭环通过。复制超时可能已有写入，因此该观察运行必须失败，不能保证手机绝未继续一步。241新Simulator core实际完成前4／12阶段GET／Native ACK，随后文字替换失败，整条仍未通过；Phone等待／确认链尚未验收。GET有限重试与runner隔离读屏障共19项离线测试通过，不能替代真实业务。

同行阶段的自有API3344、故障代理3345及专属Postgres15434已停止；数据库容器保留为可恢复材料，其他服务和容器未动。Next生成文件已恢复到本任务开始前的精确字节，保留原有未提交配置。当前编译上下文、无凭据runner和私密失败证据暂留以便继续，活跃Local配置保留。

最终实际结果、可公开原图、来源提交和正常手机进程核对将随日历完成后补入。此文是进行中检查点，不能作为五入口完成证明。

## 撤销连接与245视觉进行中补充

独立focused244实际110.867秒失败：5个GET阶段／5ACK已核对到取消撤销，同一连接保留；随后真实点击确认、弹窗消失，但25秒后连接仍存在，未释放“已撤销”阶段，不能以弹窗关闭判定成功。2账号删除／旧401及凭据封装清理完整。源码复核确认：共享prompt先关闭binding，连接页setter同步清空pending，170ms后确认闭包再读pending时已为空。私有246只按值捕获当次连接，不改共享prompt、角色、取消或API规则；两平台编译／签名通过，尚未采纳或执行业务。

旧10阶段用例的弹窗在测试查询背景connections.isHittable时关闭。新focused避免背景命中探测后，取消与确认弹窗均保持到真实按钮点击；这支持测试探测造成干扰的假设，但未做同一录制的背景探测因果对照，不称已证明产品随机关闭。

私有245四组合实际700.790秒交互通过，30张原PNG已导出；Root已逐张检查普通10张，最大20张由独立reviewer继续核对。不能以交互通过先称像素验收；Simulator随后严格恢复244，两binary／Info／签名核对，Phone和活跃源码始终244。

## 246采用与待验收状态

Root已将246四项输入采用到活跃源码并冻结268项，264项相对244保持，Local字节一致；双平台编译／签名与实际Simulator的Info／两binary核对完成。Phone仍244。相同focused用例正在246实跑，未预先记通过。私有245的30图／29unique已经全部实际复核、36项geometry完整保留，700.790秒四组合专项通过；最大字号仍只覆盖已记录的固定网格／同行人及短备注首行，不泛化全多行。

最新Weekly244实际102.186秒失败，controller137.391秒完成且双账号旧401清理；只完成2阶段／ACK。真实hint已经按每轮查询点击，唯一事件AX仍为402×1363.667而非窄卡，不能继续以其尺寸计算拖动。该次未执行移动／调整时长写入；保留原强断言，正在核对真实像素、单子元素容器及Day差异。

## 246完整连接闭环与手机安装

完整连接167.957秒／1项0失败跳过、10GET阶段／10ACK通过，controller184.292秒passedtrue；6原PNG全部实际审查。相同focused另111.549秒、7阶段／7ACK通过，13原PNG／6unique全审，不能合并说同一个用例。两组分别清理双账号旧401和凭据封装；完整连接保留真实原生Paste、原token链、撤销前200／取消保留、撤销后两边界404与no-store、清理后标准TLS Node404。外部系统结果仅callback notice／未订阅，不称已确认Apple订阅或外部取消。

默认iPhone14Plus实际UDID／型号重核，已安装246并读取安装Info，普通97保留；268项、Local、严格签名与Phone编译产品已核对。不能读取已安装Phone可执行字节，不作该项声明。手机仍锁屏，正常启动及Phone UI闭环未执行。周视图247只准备一行容器语义实验，无采纳或UI通过声明。

## 活页面层级诊断与测试定位更正

稳定246的独立只读记录实际142.269秒失败、controller179.321秒，仍只完成2阶段／ACK，双账号删除／旧401与runtime移除完整。4棵活页面树、JSON和2张原PNG均已实际审查：精确日程ID仅1个Button，未见重复，也没有错误选中ScrollView；该Button与父canvas均为402×1363.667，但它唯一的直接Other子节点为实际绘制的47×55，并包含正确活动和时钟。App有124个descendants／26buttons／1scroll／2windows，并非旧收尾快照的空树。

此前把语义Button外框直接当成物理拖动区域的测试假设不成立。接下来仅修测试定位：父Button负责精确ID、唯一性和完整时钟；唯一直接绘图子节点提供新鲜触摸几何，仍要求真实列宽、完整可见视口，原13阶段和确认／精确时间／API断言全部保留。不把该定位修正称为VoiceOver完整通过，也不从外框数据单独断定其焦点或激活已损坏。

247容器109.667秒、248可访问shape103.118秒、249菜单包装外框104.324秒分别失败，均为2／13阶段且未进入原移动；每组双账号旧401清理完整。三次产品改动已全部撤回，当前活跃源码、Simulator和默认Phone均为246。失败的额外runner75记录与原业务失败分开保留，不称App闪退。


## 250拖动终点候选（未通过验收）

稳定246的真实Week卡片触摸已定位正确。`calendar-advanced-sim-weekly246-drawn-touch-final` 实际运行132.457秒，只完成3／13阶段；移动取消通过，第二次确认面板、成功提示和卡片都显示09:25，严格期望09:30未通过。观察器没有第4阶段读回，因此不据此声称服务器已保存09:25。两原图和三视频关键帧均实际审看；两个账号删除／旧Bearer401、凭据runtime和fixture清理已核对。

代码检查发现onEnded提交最后一次onChanged缓存的preview，没有按松手最终translation重算。250把既有move／resize目标计算提取为纯helper，在onEnded保留原操作类型、已有preview门槛及取消／菜单／清理规则，只用最终translation求目标；onChanged的动画和触觉条件保持。相对246仅版本及HomeWeekTimetableView两项改变，其余266项与Local保留。独立复查未发现阻断问题。当前只可称源码修复候选，尚未证实它是上述5分钟差异的唯一根因；原13阶段、09:30／11:00时间要求和真实手势速度／距离均未放宽，正在构建复测。


250首次复测 `calendar-advanced-sim-weekly250-release-final` 仍未通过：Native132.091秒／controller167.977950秒，3GET-round／3ACK后原09:30精确时钟断言失败；2账号删除／旧Bearer401与runtime清理通过。原失败保留，不把纯终点重算认定为该差异已解决。接下来单独验证自动化输入采样：只把28.25pt拖动的速度由250pt/s改为40pt/s（名义113ms→706ms），同App250、实际坐标／距离、0.34s长按和0.1s停留、09:30／11:00及全部13业务检查不变；这一步是QA输入实验，不能提前记为功能通过。


250测试候选已安装指定默认iPhone14Plus：安装前设备UDID／型号核对、active／冻结268及Local、Phone产品全部二进制hash／严格签名均一致；安装后Info250及普通97保留已读回。手机执行字节未直接读取，未正常启动或通过Phone UI；12:21再次实际lockState为passcodeRequired=true，已请求人工解锁。来源和安装仍不能替代业务验收。


## 250周视图最终通过；文件成功分支／Phone仍待补验

`calendar-advanced-sim-weekly250-slow40-final` Native263.788秒、controller281.942184秒，1项0失败跳过，完整13GET-round／13ACK、0transport retry。移动和拉伸的取消保留、精确09:30／11:00、复制不新增、独立粘贴／复制、重启后3ID及精确时钟、逐项删除至0、peer保持均通过；2账号删除／旧Bearer401、runtime与fixture实际清理。

5原PNG全部实际审看：取消前移动确认9:30、拉伸确认09:30–11:00、保存成功、14:00–15:30粘贴和三个独立卡片精确时间；成功运行没有视频attachment，不假称第二确认有连续视频。两张安全原PNG原字节采用。40pt/s只改自动化输入速度，距离／坐标／hold／原13业务要求保留；同250快输入失败证据仍在，不把终点重算单独当作差异已解决的因果证明。[250阶段](../releases/2026-10-27-preview250-calendar-release-position.md)。

覆盖复核发现既有Connections10只到导出picker／取消及API空ICS核验，没有真实Files保存和成功导入。正在准备独立ownedSim单次事件导出→删源→选同文件导入→新ID精确读回／重登→UI删除的真实闭环；保持现有导入规则，不假设重复手选文件会去重或完整恢复分类／系列。Phone Core12仍待解锁。因此日历与五页任务均未完成，不能进入消息。


## 251文件成功闭环与弹窗正文修复；整页仍待验收

Transfer250前五次失败分别涉及QA搜索返回、iOS原位命名、空TextView的nil值、目录自动进入、文件名StaticText未选中文件，均保留原失败与实际图，不改业务断言。第五次已经完成实际439B ICS保存／UTF8全文与API导出严格一致，以及删源后GET0；旧默认空文件夹由创建前后实际图、精确birthtime/inode证实属于本轮，Root只rmdir该空目录，有独立补充receipt。后续baseline会保留所有原项，未知新增文件不删除。

第六次 `calendar-transfer-sim250-file-cell-final` 实际点唯一原生File Cell后已关闭picker，但结果弹窗只有标题、图标和OK，正文完全空白，晚期AX及实际视频帧一致。Native214.618／controller249.279809秒，4／8GET-round和Native ACK通过，导入后的第5阶段未到，不能判断本轮后端是否成功；439B文件及目录、2账号／旧401、runtime与fixture.json均清理。原Imported1／Skipped0断言保持，未通过API补写。

源码定位到Popovers提前创建AnyView、异步present与live Bool结合旧String正文快照的时序风险。251仅把ssActionPrompt message改为escaping autoclosure，经过两层provider转发，在实际提示框body读当前message；其余actions／Binding／dismiss／布局保持，独立最简复查通过。较250只版本和SSViewModifiers两项变化，266项及Local保留；两端164个App Swift＋1generated、268输入／Local／三binary／签名均核对。默认14Plus已安装251并读回Info，普通97保留；没有直接读取Phone执行字节，Phone Core12尚未完成。

原8阶段真实复测367.111秒、controller394.363338秒、1项0失败／0跳过、UI0／observer0、8GET轮次8Native ACK通过。真实保存的439B／1VEVENT与原API导出严格UTF8全文一致；先UI删源／GET0，再选择同一文件导入，明确显示Imported1／Skipped0，新ID与原ID不同，title／start／end／location／note精确读回，重登仍同ID，UI删除后重登0、peer0。12张原PNG／10unique全部实看，1棵私有树，无成功视频。source-deleted的owner/me有一次ENOTFOUND按冻结750ms／最多1次重试恢复，不能称零重试。export／file／cleanup三SHA一致；2账号删除／旧401、runtime与fixture.json实际移除，fixture目录只留cleanup-receipt；本轮文件和目录删除、baseline/noUnexpected/filesClean，provider根实际为空。

focused251首轮Native135.002／controller175.971536秒只完成2／7GET与ACK，snapshot超时；实际视频仍在系统AddSubscription编辑页，未回App，也未到RevokeCancel／Confirm。只读probe证明host为mobilecal、标题“添加订阅日历”及cancel-button，没有Lookup／Subscribe；额外cleanup probe因Calendar非foreground停下，0Cancel、无fullhash，不称旧UI已清理。第二轮`system-cancel-final`为Native47.766／controller87.531895秒、3／7GET／ACK：创建连接并返回App notice成功；重启后1.7秒仍loading，被即时5条计数门槛误判，externalOutcome仅callback-notice，取消未核验。随后查明复制project仍绝对引用244源，实际编原2604而非新4ad；两次旧run均保留失败范围，不能声称新取消helper已执行。Root确认先前实际编译清单核验遗漏。

fresh XcodeGen后，实际两SwiftFileList的源路径／hash、双QA binary与runtime已独立对齐；仅修系统返回helper与35秒内同时等登录两字段消失／精确5条，原7阶段主体数据不变。最终`calendar-connections-focused-sim251-composite-return-final`为Native120.398／controller149.161733秒、UI0／observer0、7GET／7ACK、零重试，counts0→0→1→1→1→0→0，撤销取消保留、确认／重登0、peer／categories保持。13PNG／6unique全部实看，无成功视频；externalOutcome=calendar-subscription-cancelled／verified=true来自native记录。2账号删除／旧401、runtime与fixture.json移除，fixture目录只留receipt。四张撤销prompt中的link.badge.minus实际为空灰圆，251未修；私有252候选只准备替换link和版本，尚未构建／测试／装机。

14:41默认14Plus系统已解锁。首Core251 preflight因Preview PID11543已运行而在0factory／0UI退出；单独授权的精确Preview重启核对Info251／完整执行路径／fresh PID，无AppData／Keychain重置，普通97不触。新`Core251-restart-final`正在运行，本次记录4／12GET／ACK（创建event已过），不称Phone已完成。日历目前9个分开业务组和额外focused回归通过，整页与五入口任务仍未通过，消息／我未开始。[251交付与原图](../releases/2026-10-27-preview251-calendar-live-result.md)。


## 默认iPhone14Plus251 Core12完成

`calendar-phone-core-251-restart-final`在指定默认实体14Plus真实通过：Native469.055秒、controller503.450988秒，1项0失败／0跳过、UI0／observer0，12GET轮次／12Native ACK。新建、编辑完整字段、重启、分类改名／改色、删分类保留日程及无分类状态、删日程和重启搜索为空、peer隔离均通过；12张原PNG全部实际审看，真机成功包保留1MP4（与Simulator成功包无video分别记录）。普通中文／正常字号和AssistiveTouch可见范围保留，非全字号或普通身份数据验收。

首次preflight发现已运行Preview11543而停在factory之前，未建账号／未启动UI；Root随后依据完整闭环授权，独立精确匹配default设备／Info251／installed executable路径／freshPID，只终止Preview进入隔离QA，无AppData／Keychain reset、普通97未触。第二次完整流程2账号删除／旧Bearer401、runtime与fixture.json实际移除，目录仅保留cleanup-receipt。普通会话最终启动尚未恢复，Root下一阶段处理空灰glyph后统一装机；消息／我继续等待日历整体验收。
