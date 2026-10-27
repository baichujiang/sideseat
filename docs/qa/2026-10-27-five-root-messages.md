# 消息页闭环验收：Preview254

消息页已于2026-10-27通过Root验收，下一页为“我”；“我”业务测试尚未开始，五入口整体未完成。默认iPhone14Plus已安装254并恢复正常进程PID11702，普通97保留。源码及测试聚焦提交ce1b9dd2已推送。[交付receipt](../releases/2026-10-27-preview254-messages-closeout.receipt.json)

## 修复

清除已保存备注原来显示Invalid input。可选Encodable在nil时省略remark键，现有API要求该键存在且允许null；253增加显式encode，254原样保留，清除发送remark:null，已有Unicode备注原值保留。两个hostless请求契约测试使用活跃完整DTO和新增suite逐字正文：旧实现1个issue，修复后2项／1suite通过；这不是完整App单元套件。

253真机实际审图另发现P2：备注行与GET已更新，顶部名称仍旧。254共用applyRemark处理live／fake，以服务端canonical remark或peer.displayName同步conversation，保留其他字段及self-notes名称，复用既有cache持久化和Inbox刷新通知。两项修复均经独立最简复核；未新增写接口，邀请、日历、匹配与安全规则保持。

## 六个分开的最终范围

| 用例／版本 | 实际环境 | Native／controller秒 | GET轮次／ACK | 原PNG／unique |
|---|---|---:|---:|---:|
| Main16／252 | 自有Simulator、生产API | 318.609／341.463815 | 16／16 | 9／9 |
| Main16／252 | 默认iPhone14Plus、生产API | 313.478／346.043978 | 16／16 | 9／9 |
| Ignore6／252 | 自有Simulator、本地API＋DB | 93.300／111.493880 | 6／6 | 5／5 |
| 备注／举报／拉黑13／254 | 自有Simulator、本地API＋DB | 208.783／227.681317 | 13／13 | 8／7 |
| 结束聊天6／254 | 另一新连接、本地API＋DB | 72.268／86.436944 | 6／6 | 5／4 |
| 即时名称与备注8／254 | 默认iPhone14Plus、生产API | 220.797／256.007091 | 8／8 | 14／12 |

各项1个Native用例、0失败／跳过、0GET重试，全部原PNG实际审看，无留存视频、无最终material画面问题。各次新账号／连接、版本与环境分别计证；GET轮次不是HTTP请求总数，也不是254同包全套重跑。最后一项原controller仍为false，清理由独立补证完成，详见下文。[6张安全原图与SHA](./evidence/2026-10-27-messages254-closeout/README.md)

Main覆盖快捷入口、通知读取、名称和历史消息搜索、双方真实收发、参与者信息、引用草稿取消与清空、真实引用、删除取消／确认、置顶与手动未读、重登账号隔离、对方删除同步及收尾恢复。引用／唯一消息／tombstone身份和通知计划保持正确；通知已读与手动未读按该设备各账号验收，不声明跨设备同步。

Ignore接收者忽略后列表为空、重登保持；发送者原文与等待回复保留，重登一致。实际请求IGNORED、opportunity UNAVAILABLE，发送者投影仍PENDING，没有泄露对方的私密决定，也没有生成正式聊天或计划日历。

Safety完成备注取消／保存／重登／另一账号隔离／清除，再验证消息举报取消／提交、拉黑取消／确认及双方重登。Report按精确peer、message、reason和详情核对；Native未传connectionId，按Message归属确认本轮关系。拉黑后Connection BLOCKED、owner Block1／peer0、双方inbox和contacts0、messages404，原TEXT保留。End独立新连接取消保留、确认ENDED及双方重登，blocks0；actions终态可200，原消息和FriendLink按既有规则保留。

254真机8阶段还明确检查保存和清除后的info header、聊天toolbar及Inbox row立即更新、旧名消失，并从同一row回开；六张即时截图均正确。API联系人／TEXT种子／通知计划为明确前置，不计为UI业务通过，后续业务动作来自实际App。Ignore认证与英语仅设置于严格空白的自有本地账号，生产未授予认证；本地observer只读。Together236的非空招呼Reply、Plans238的好友计划卡片和真实push保留各自范围；MVP不可达的群聊、课程群聊、公开资料和媒体tray未解除限制。

## 必须保留的失败与补证

- Main252旧三轮分别只完成1／16、5／16、4／16：SearchField角色定位、peer新引用未读应为1的oracle、长按编辑菜单清空策略。第二轮xcresult缺Info.plist，只恢复6张raw Data原PNG，Native未完整收尾。原失败与各自清理保持。
- Terminal252两轮均为5／13：首轮UITextField Cmd+A未全选、仅删末字；第二轮输入真正清空但保存被拒，触发显式null编码修复。第二轮没有空保存后的DB快照，不冒称该次已写入成功。
- Phone253首preflight在1.278232秒、0factory／0UI拒绝已有Preview；Root随后匹配Info／完整执行路径／fresh PID11642后精确停止，再重跑。
- Phone253备注8阶段Native179.516／controller218.078413秒、数据与清理通过，8／8原图实际审查有顶部旧名P2，保留为material finding；不是253引入的已证回归，也不作成功画面。254即时检查针对该缺口补齐。
- Phone254最后8阶段业务与原生测试通过，但收尾一次CoreDevice apps元数据查询失败，原controller false及SHA728148166b84cfc165120f51ac3df492823f6e3173f1ca8cc4184e2a813343c5保持。fixture／runtime当时安全保留。Root独立重读默认设备、锁、安装和进程，确认自有Mac组与Preview／MessagesQA已退出，无需终止进程；按同run／roles／runtime归属完成factory清理2账号、旧401、fixture.json和唯一凭据runtime移除、unknown0。补证与原SHA经独立复核，未改写旧controller，也不称六个controller全0。

## 来源与收尾

254每平台实际164个App Swift＋1generated、165条SwiftCompile，FileList／SHA／268输入与签名产品一致。相对253仅版本和Store两项App输入变化，266项及Local、DTO和unit源保持；unit文件不在App清单内，另记SHA。源码及测试提交ce1b9dd2已推送，268项活跃／冻结／提交blob和独立unit源匹配；Local配置按冻结私有字节另核，原构建时uncommitted记录保持。

六组各自2账号／旧401、fixture.json与凭据runtime清理完成；Main通知计划另404，其他组未创建计划。本地用户与业务0，只停自有Next88438／88449及保留的自有DB容器，3344／15434关闭；tsconfig／next-env只恢复明确启动路径增量，用户原无关tsconfig字节保持。构建与恢复上下文暂留后续页，未碰普通服务／StudiFind。

正常254 PID11702、空参数／仅TERM、完整安装执行路径与fresh PID匹配，MessagesQA不运行；普通97保留，普通身份、手机执行字节未读，没有AppData／Keychain重置。physical ACK范围为copy成功、device／domain／filename／size和Native消费，未作完整设备post-copy字节回读。仅普通中文浅色，不声明全App最大字号／全语言验收。本阶段无后端／网页／Schema发布，HTsL只是上次生产核验记录。[254交付](../releases/2026-10-27-preview254-messages-closeout.md)
