# Preview251：日历导入结果正文恢复

该页保留251阶段结果；日历最终收尾已在[Preview252](./2026-10-27-preview252-calendar-closeout.md)通过。251来源d0d58003及receipt提交257dfe42保持。

250真实选中ICS后，结果弹窗只有标题、图标和OK，没有正文，实际视频及晚期AX一致；当轮未达第5个读验阶段，不能追溯认定后端已导入或未导入。251把共用prompt的message改为escaping autoclosure，经过两层provider，在实际body读取当前结果，避开提前创建AnyView时的旧String快照。只改版本与SSViewModifiers两项，266项和Local保持；无新状态、规则、actions、Binding、dismiss或布局改变，独立最简复查通过。

同一原Native及双QA二进制的8阶段真实闭环在251通过：Native367.111秒／controller394.363338秒，1项0失败／0跳过，UI0／observer0，8GET轮次8ACK。UI导出439B单个VEVENT到专用Files目录，文件与原API导出UTF8全文一致；UI删源并GET0，再以原生File Cell选择同一文件，明确显示“已导入1个日程，跳过0个”，独立新ID及完整标题／时间／地点／备注正确，重登保留同ID，UI删除后重登为空、peer0。GET轮次不是HTTP总请求数。一次source-deleted owner/me ENOTFOUND按冻结750ms／最多1次重试恢复，未放宽业务断言或经API补写进度。

12张原PNG／10unique全部实际审看，成功包只有12PNG＋1私有树，无视频。[安全前后图](../qa/evidence/2026-10-27-calendar251-transfer/images.json)包含250失败视频的实际200.361667秒导帧与251原生结果／详情截图，均为synthetic QA数据，未修改或裁切。[执行摘要](../qa/evidence/2026-10-27-calendar251-transfer/test-summary.json)。文件SHA与export／cleanup一致，文件及本轮目录、2账号／旧401、runtime与fixture.json实际清理；fixture目录只保留cleanup-receipt，provider根为空。单个普通非重复事件的基本字段闭环不代表分类、参与者或系列完整备份恢复，也不新增同文件重复手选去重规则。

共用弹窗focused7最终`calendar-connections-focused-sim251-composite-return-final`通过：Native120.398秒／controller149.161733秒、UI0／observer0、7GET／7ACK、零重试，counts0→0→1→1→1→0→0；撤销取消保留、确认／重登0、peer及categories保持。13PNG／6unique全部实看，无成功视频，系统订阅取消由native记录核验。双账号删除／旧401、runtime与fixture.json清理，目录只留receipt。最终两编译源／双QA binary／runtime已独立对齐，7阶段主体数据未改。首轮2／7及第二轮3／7失败仍保留：复制工程实际引用旧244 QA源，新helper并未编入；第二轮仅callback-notice、未核验取消，并在重启仍loading时即时误判计数，不能归为业务规则失败或已通过。

该focused实际审图另发现四张撤销弹窗的link.badge.minus为空灰圆，251尚未修复此视觉问题。当时私有252只准备改用link与版本，尚未构建、执行UI或装机；该阶段活跃源码与手机仍251。

两平台构建／严格签名、164个App Swift＋1generated、268来源与Local、三项产品binary hash已核对。默认iPhone14Plus已安装251并读回Info，普通97保留，未直接读取手机执行字节。14:41已解锁；首Core preflight因已有Preview进程在0factory／0UI退出。随后精确Preview重启核对Info／完整执行路径／fresh PID，未重置AppData／Keychain；早期Core12检查点为4／12GET／ACK，随后完整通过，最终统计见下文。

**251阶段尚未完成日历整体与五入口验收。** 九组业务是244／246／250／251的分次闭环，不是一套251同包全重跑；Share旧controller TLSfalse及独立404补证保持。默认Phone Core12及撤销弹窗图标仍待完成，消息／我未开始，按用户顺序等待日历验收后再进入下一页。本阶段无后端、网页或Schema发布；HTsL仅为上次生产核验记录。来源 `d0d58003` 已推送；[receipt](./2026-10-27-preview251-calendar-live-result.receipt.json)记录当前安装及验收边界。


默认实体14Plus的Core12也已真实通过：Native469.055／controller503.450988秒，12GET／12ACK、0失败跳过；12原PNG全审，成功包有1MP4。创建／编辑／重登、分类改名改色、删除分类保留日程及最后删除重登为空均正确，2账号／旧401／runtime与fixture.json清理。两张安全物理原图加入上方images索引；该阶段普通会话启动仍待收尾，252灰圆glyph修复尚未验收，不提前进入消息页。

252已修复上述空灰图标，完成focused7及默认手机普通会话核验，日历最终通过；九组跨版本业务范围和全部早期失败仍保留。消息／我尚未开始，五入口整体未完成，详见252交付。
