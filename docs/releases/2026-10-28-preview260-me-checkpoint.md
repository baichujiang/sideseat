# Preview260「我」检查点（NOT ACCEPTED／真机待重连）

**NOT ACCEPTED／默认真机待重连。** 当前活跃源码、默认iPhone14Plus与自有Simulator均为260，普通97保留。反馈普通r1与MAX full-r4完整12已分别通过；此前255／258各独立业务范围保持，Me业务补验只剩默认Phone260资料7，仍等待用户USB重连／解锁回复，未执行。产品与QA20文件`9c501d8a9609adbc8929a06730a743716374fa49`已实际推送；安装、编译或这些分项通过不等于整页／五入口验收。前四页保留原范围。[完整QA、失败与补证](../qa/2026-10-27-five-root-me.md)

255修复反馈撤销投票请求：可选值nil原先省略API必需的`value`键，现在显式发送`value:null`，UP／DOWN保持原值。只修改该DTO，不改变全局编码或既有业务规则。活跃DTO／API schema纯契约复现与2个测试函数、3个参数情况的hostless Swift Testing通过，旧实现失败；范围不是完整App单元套件。

此前255已完成的独立业务范围为：Simulator基础资料与语言7、默认iPhone14Plus基础资料与语言7、本地取消／确认解除拉黑6、本地反馈创建／投票撤销／评论12、真机账号4及真机基础设置6。前三项原图独立审查通过；反馈6张原图／5种像素发现P3，258普通专项已实证plain整行样式修复，最大字号另发现真实P2。账号4以Native／GET／清理和独立资料复核通过，0PNG／视频／AX，不声明像素验收；owner由实际UI删除，peer由factory清理，两账号为合计。255／258结果不是260同包全套重跑。

默认手机设置6 Native198.997／controller247.253468秒、6GET／6ACK、零GET重试，隐私取消／保存／恢复、主题system→dark→system和语言system→en→system均真实重登并精确恢复，两张原PNG／两种像素实际审看，无material发现。中间表单画面未留存，主题／语言是设备本地证据；反馈仅取消Native草稿，没有读取公共反馈或独立服务端ownpost0证明。两次只读设备元数据首轮失败、500ms后第二轮成功，变更操作未重试。

默认手机Core17（资料7、设置6、账号4）已分别闭环；设置扩展12另用新账号通过Native230.823／controller279.475591秒、12GET／12ACK、零GET重试。10张原PNG／9种像素及两份About真实AX全审，无视频、无material发现。教程仅owner产生两个严格递增的UI时间戳，peer12轮保持；单城市只读、既有通知设置往返不变、会员空码及无效认证输入不可提交，分享取消均保留真实边界。原controller因收尾apps两次元数据exit2保持false，独立恢复确认默认设备／Info255／完整路径与PID11805两次匹配，仅停止Preview后精确清理两账号／旧401、fixture及runtime，unknown0，已独立复核。

资料扩展旧轮701.059秒／16ACK后只读提示定位失败，后一次255 Full800.070秒／21ACK后Photos旧索引QA失败，均保留false及清理，不计Full23；21原图／21unique与五段安全外观视频帧实际查看，未称整段视频全审。旧Full major503—525pt被toolbar491—539pt稳定正面积遮住已证；另一独立NoScroll A的major自然359—381pt通过、Wechat469—491pt仅与toolbar贴边，glyph完整，只在4pt安全阈值487pt失败，两者严格区分。归档A255标题区域横拖无Delete，60.857秒／1ACK、前后两图已审且清理；未实际restore，父列表刷新缺回调是静态发现，不能称该缺陷已由旧UI复现。

S5 NoSave输入框、U5 NoSave外观和W照片取消分别保留各自通过范围，不补成旧Full23，S5未点击SelectAll，W无PNG／视频且不读图库。258后来完整Profile23通过761.948／779.675015秒、23GETDB／23ACK、17PNG／17unique，15field AX／5坐标及Photos导航Cancel范围全审；五条原清空路线自然可见，实际到Photos22及peer23。FullCourses16通过259.237秒／16GETDB16ACK、7PNG／6unique全审、0AX／视频，手动创建、收藏、归档、自然父列表恢复、课表应用重登和退出／peer完成；精确三个自有目录项、账号及runtime清理。NoScroll B5与Archive B7也分别实测及全图通过，其业务源在260保留，不能扩展成260同包全跑。

258反馈普通12通过188.062／203.744733秒、12GETDB12ACK、10PNG／8unique与4geometry全审，修复P3；MAX r2实际失败130.263／166.668075秒、3ACK，作者84.7pt宽拆六行、数字图标重叠是实际P2，不能归为仅QA断言过严。259采用AnyLayout将辅助字号作者放全宽、类型与计数另行；普通完整12虽Native／数据通过193.166／217.522769秒，10张原图显示数字0／1消失，属于像素失败，不能写259已验收。

260改为显式Image＋数字Text共用组件，保留原字体、读屏翻译、布局分支和规则。普通L／EN／浅色完整12通过192.539／213.514477秒、12GETDB12ACK，10PNG／8unique及四份geometry全部实际审查，数字0／1可见且不与图标重叠；四次右侧空白单点390,165均到同一详情及原正文，两次撤票与评论重登持久化、禁邮件和精确清理通过。该范围不是AX5或真机验收。

MAX260-r1保持失败163.716／199.114192秒、3GETDB3ACK：列表作者与0／0已正确、390,364点击成功；长详情将投票行排到首屏以下，QA未正常滚动。r2仅修QA露出投票行，实际各一次正常滚动后完成8GETDB8ACK和赞／撤销／反对／撤销，随后在评论输入前失败256.885／304.003445秒；11张安全原图及失败AX已审。QA在懒加载TextField未出现时固定返回TextView，滚动24次仍查错角色；当轮没有MAX评论框出现后的AX，不能凭源码宣称实际可用。r3另立执行265.573／304.383731秒、8ACK，真实TextField已输入精确草稿，但通用Submit reveal失败，未发送；3张定向安全PNG与AX诊断通过，不声明该轮全图／评论完整验收。三轮false、各轮两个账号／旧401、本地0及fixture／runtime清理保留，不把前缀相加作MAX通过。

独立短gutter probe的API种子仅作诊断前置：Native124.253／controller147.658091秒、6GETDB／6ACK，9PNG／7unique、8AX／8geometry全审。3次x12真实内容区拖动露出完整Submit，底519距预测栏顶539有20pt；输入草稿后真实Back取消，恒post1／vote0／comment0，邮件null及严格清理通过。Native唯一新方法实际成功，observer误匹配旧full12方法，原controller／observer仍false，独立新方法终态补证另立而不倒改。评审SHA `d205a739e47a0145fe6299333dacee5735ae71a6190a5cf0122373608224e570`，终态补证SHA `1d3f5a1e6f3cf018e64c6fb21ba1375cbca42e40572f6dbbf38c5ea7d597e3e5`；该短诊断不计完整创建／投票／评论流程。

最终MAX AX5／EN／浅色full-r4由空板以实际App创建并完整通过397.450／414.689045秒、12GETDB／12nonce ACK、0重试。全部35张安全PNG／27unique逐张实看、25AX／28geometry核对；4次右侧真空白单点390,395进入原post及正文，数字／图标分离，3次裁剪gutter后完整Submit才点击，实际单次Send、真实field存在且异步清空、评论及双方重登读回同一ID／作者／正文。两次撤票DB0、最后四阶段评论严格1、资料及无关业务保持、监听进程禁邮件／存储邮件字段null；2账号删除／旧401／DB0／fixture与runtime清理完整。评审receipt SHA `92f10a969bc2f145bec784df86efb3149112a25341cd4a3596cf2a9ed68f708a`。普通r1与MAX r4是独立成功轮次；r4 fresh两源QA编译9.109秒，不是旧8.232秒产品复用，QA改动未改变App260，不扩展成Phone或Me全页通过。

258真机各次尝试保持失败：16.246367秒路径别名误拒、1.613442秒拒已有Preview、92.448298秒signed-in仅1GET／无ACK后copy15超时；rev3改为单copy30及移除锁轮询，86.087051秒仍NativeStarted0、启用自动化超时，不能声称copy30已成功。259／260尚无新增手机UI验收；260资料7仅准备，等待用户USB重连／解锁，不切其他设备或重启全局服务，不宣称自动化恢复。DIRECT原生swipe260八阶段仅准备，严格待Me全部通过后执行，旧254验过的是长按菜单；旧A258未执行，不能伪造A/B失败或改写旧验收。

真机基础资料7 Native157.618／controller188.758870秒、7GET／7ACK、2张原图实看通过；收尾CoreDevice读取失败，原controller保持false。Root独立重核设备和执行路径，精确停止匹配两次的自有Preview进程，再按本轮归属清理两个账号、旧401、fixture和唯一runtime，unknown0；原SHA及false未改。设置两次QA定位失败、Simulator前置执行开关错误及解除拉黑前置201预期错误均保留原失败与清理证据。

259历史六项变化与118.091／133.828秒构建、双端安装receipt仍保留。260较259仅版本与反馈计数组件两项变化，266项／Local和八个资料／课程／聊天／三语继承源保持；资料／课程业务源仍精确等于已验258。双build141.627／171.930秒、每端164 App Swift＋1generated／165 FileList及实际编译、逐源SHA、三binary／严格签名／默认14Plus profile／编译三语键均实核。Root已实际采纳、双端安装并读回Info260；主receipt `me260-app-adoption-receipt.json` SHA `21ed244dd35ee55df7f7da2fcc48477a9afd6622a480763632efe4d47ee9d9a8`及alias字节一致，manifest `89a2b4da…`、provenance `5f605354…`、source-proof `e68f215a…`完整值见QA。

实际MAX评审后才同步官方Campus6＋Safety3共九QA文件，保留原业务／设备guard／12阶段与DB、邮件、nonce、清理规则；新增独立settings scripts、外部依赖路径及expectedBuild严格匹配，静态审查无material发现。官方五源fresh build-only9.489秒、实际5条FileList／5个SwiftCompile及两严格签名通过，6个改动／新增Node脚本语法通过，不新增UI验收。产品8＋QA12共20文件`9c501d8a9609adbc8929a06730a743716374fa49`已实际推送，远端分支已包含该提交；268项Git blob／活跃／冻结／构建输入和Local逐项匹配，[提交绑定补证](../qa/evidence/2026-10-28-me260/native-source-commit-binding.json)另立，历史candidate／provenance／adoption原字节不改。

普通97保持，无普通身份读或reset；手机安装执行字节未读、自动化可用性与正常手机最终启动未验证。当前Me仅默认Phone260资料7待用户USB回复；消息260侧滑八阶段仍待Me全过后才执行，五入口整体NOT ACCEPTED。最终owned DB0／原catalog hash通过后，仅TERM两次fresh核对的自有Next97096／97106，3344关闭；精确15434容器停止并保留，TS／next-env只恢复已知启动增量，用户原修改保持，其他服务及设备未动。收尾receipt SHA `0e286090aef46c6b382328af6bb5e24fc46b484fb82e93fc29b88a1fe1945192`；未来本地测试必须显式新启动／PID／实际禁邮件证明，不能称97096仍存活。正常手机最终启动仍待真机复测后完成。历史false与独立补证全部保留，无本阶段后端／网页／Schema发布，HTsL仅上次生产核验记录。
