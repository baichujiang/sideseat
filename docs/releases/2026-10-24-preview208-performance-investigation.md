# Preview208：CPU分段调查

本项保持App源码ee243bf2和208二进制不变，测试与证据 **dc5fe0b6d404c113f944269ae56a0f11de573870 已提交推送**。默认真机／同一七天候选表上四段Time Profiler录制，全部严格落在对应静置／坐标／AX窗口内；真机 **300.997秒，1通过、0失败／跳过**。手势真实选中／擦除校准，4次配对操作后空选、两格位置和尺寸稳定、80次AX读取后仍空选，0提交／邀请。

| 段 | Running采样权重／记录时间 | 权重估算 | 其中AX／XCTest栈权重占比 |
| --- | --- | --- | --- |
| 空闲表静置 | 0.708／36.429秒 | 1.944% | 0.565% |
| 最终选时静置 | 0.715／36.053秒 | 1.983% | 0.140% |
| 缓存坐标自动化 | 30.292／35.950秒 | 84.262% | 95.127% |
| 连续AX查询 | 34.595／35.949秒 | 96.234% | 99.485% |

权重估算是统计采样而非硬件计数；栈比例是重叠inclusive上下文，不能相加。缓存坐标仍经过XCTest注入／快照，静置仍保留定时GET。坐标段主要为accessibilitySnapshotOrError／userTestingSnapshotForElement→AXRuntime→UIAccessibility→SwiftUI可访问性树，已知TimePoll557ms／DateFormatter109ms，未见产品业务计算为主热点。因此未增加缓存／改网格或手势，也不声称纯人工CPU已优化。

本轮确有 **1份CPU resource**：208 PID8500、16:12:39–16:14:21、90CPU秒／102.07秒、平均88%、action none，正对应坐标／AX高负载；原报告也含同类框架栈。同PID测试通过，无崩溃退出。报告私密保留，安全摘要公开。不能写零资源报告或用无报告替代采样结论。

4张真实图复核、保存2张；七天性能表与原布局表服务器0响应／0提交／0邀请版本。208普通启动恢复 **PID8510**，实际进程／二进制／严格签名一致，普通97保留，Runner／私密配置清理；专用账号与计划暂留最后补验统一回收。无真实用户写入／后端网页发布。后续只剩资料补验、完整主流程与文档收尾。

[完整QA](../qa/2026-10-24-sequential-reliability-fixes.md)、[采样方法和实际时长](../qa/evidence/2026-10-24-performance208/sampling-metrics.json)、[调用栈归因](../qa/evidence/2026-10-24-performance208/stack-attribution.json)、[资源诊断摘要](../qa/evidence/2026-10-24-performance208/current-resource-observation.json)。
