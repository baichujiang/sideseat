# Preview254：聊天备注清除与即时名称同步

清除已保存的联系人备注原来被API拒绝；保存或清除成功后，聊天信息顶部还会保留旧名称。现在清除请求显式发送remark:null，并把服务端返回的备注或原名同步到信息页、聊天标题、Inbox和既有cache。业务规则与接口保持，live／fake共用同一更新函数，两项修复经独立最简复核。

消息页已通过Root验收。六个分开的最终范围是252 Simulator Main16、252真机Main16、252本地Ignore6、254本地Safety13、254本地End6及254真机即时名称8；全部原图实际审看，最后真机14PNG／12unique。它们有不同版本、环境和账号，不称254同包全套重跑。两个hostless DTO契约测试通过，范围不是完整App单元套件。[完整QA](../qa/2026-10-27-five-root-messages.md)、[安全原图](../qa/evidence/2026-10-27-messages254-closeout/README.md)

254真机8阶段Native220.797／controller256.007091秒、8GET／8ACK通过；收尾CoreDevice元数据读取失败使原controller保持false。独立恢复补证确认设备和自有会话已退出，再按精确归属清理2账号／旧401、fixture和唯一runtime，unknown0，原SHA及false未改。253真机“数据通过但顶部旧名”的P2、此前QA失败与preflight范围全部保留，详见QA。

默认iPhone14Plus已装254并正常启动PID11702，空参数／仅TERM、完整安装路径与fresh PID核对，普通97保留；普通身份和Phone执行字节未读。268来源、Local、两端实际164 App Swift＋1generated／签名／产品匹配。254自有服务和启动文件增量已精确收尾，用户原无关tsconfig保持。来源及测试提交ce1b9dd2已推送，268项活跃／冻结／提交blob与独立unit源匹配，Local按私有字节另核；原构建时uncommitted记录保持；无本阶段后端／网页／Schema发布，HTsL只保留上次生产核验记录。[receipt](./2026-10-27-preview254-messages-closeout.receipt.json)

同行、计划、日历、消息已逐页通过；“我”仅准备／只读审查，尚无UI或业务测试，五入口整体未完成。
