# 四入口真机补验：净化汇总

状态：**IN PROGRESS**。这里只发布已经接受的同行9例／78阶段和日历核心8例／81阶段的安全派生汇总。日历整体、媒体19阶段与“我”109＋头像7仍未完成验收；最终普通Preview交付待收尾。

| 文件 | 范围 |
| --- | --- |
| [汇总索引](./summary-index.json) | 当前原生／生产版本、已接受范围与剩余工作。 |
| [同行真机汇总](./together-current-physical-summary.json) | 9个独立案例及各自controller／review指纹；Explore仅5份安全附件纳审，1份排除，不声明页头像素通过。 |
| [日历核心真机汇总](./calendar-core-current-physical-summary.json) | 8个独立案例及各自controller／review指纹；保留Share限定false补证、重复四天窗口、外部订阅Cancel及Transfer旧失败等边界。 |

这些JSON从Root接受证书按固定白名单提取，只含安全事实、计数、范围和SHA256；不是原私密canonical证书的逐字副本，也不修改其结论。对应Root canonical指纹为：

- 同行：`de54d30bb48ff4f2463e5eea125eea7f66ce83fe42c640bcdb6712bd8cabc4b2`。
- 日历核心：`fbfe3614ccff2aeec07f8c8ded01528dfd9cc1f379338413392b24b1608bc645`。

日历Share原controller保持false，经独立限定复核及0账号／2GET清理补证后接受。Transfer此前两次失败及只诊断／自有宿主清理记录继续保持原范围；最终独立8阶段文件闭环另有通过证据。生产GET“边界数”是验证轮次，不作为实际HTTP请求总数或SQL读取声明。

未复制私密运行源、fixture、账号、令牌、原始日志、私密文件路径、普通照片／文件、未知系统附件或通知图。被排除的通知内容不在本目录。当前目录不包含截图；视觉范围仅记录已实际复核的安全计数，详情保留在受控原证据中。

来源与剩余状态见[补验记录](../../2026-10-29-four-root-phone-supplement.md)。后续媒体与“我”页仍需实际执行、清理和独立复核后，才能更新整体接受状态。
