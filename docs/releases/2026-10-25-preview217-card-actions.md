# Preview 217：计划卡片动作靠右，移除装饰图

默认 iPhone 14 Plus 已安装并正常启动 **Preview 217，PID 9008**，普通 SideSeat 97 保留。源码 **`e8cbc4bab14dd821a8a18d94a6c732450cbc7d10` 已提交推送**。

修正任务卡底栏整体按内容收缩、导致 `Spacer` 无法将「打开时间表」等动作推向右侧的问题。现在只固定数量／动作本身的尺寸，普通布局动作靠右下，空间不足沿用纵向回退；去掉无操作作用的右侧装饰图及死代码，保留原卡片着色判断、人物显示和资源文件。整卡原 Button、AX、状态、路由、日期选择及邀请／日历规则不变，无新请求／状态，独立最简复查通过。

最终真实候选四组合 **254.545 秒**、三类卡片导航 **182.700 秒**、最大字号完整卡片 **64.702 秒**分次通过；49 次原图捕获／39 种像素复核。最大长卡连续分段，离线导航与真实 API 候选范围分开。既有测试源码未改；216 的 20 项单元结果保留原范围，本轮未重跑单元／领域／浏览器或完整邀请日历 API 链，不作全 App 最大字号／人工性能声明。

四个 QA 收集计划测试前后精确状态保持。267 输入／Local／严格签名／冻结二进制及默认设备普通启动核验完成；2 个 QA 账号 401／4 链接 404，Runner 和私密材料清理，新增 App 报告 0 份。无后端／网页／Schema 发布，生产沿用此前记录 `dpl_3y9L5UfyX7v1hhUPsXGVg7Cg27zz`。

[完整 QA](../qa/2026-10-25-card-actions.md)、[来源](../qa/evidence/2026-10-25-card-actions217/native-build-manifest.json)、[设备](../qa/evidence/2026-10-25-card-actions217/device-verification.json)、[普通效果](../qa/evidence/2026-10-25-card-actions217/candidate-normal.png)、[xLarge 效果](../qa/evidence/2026-10-25-card-actions217/candidate-xlarge.png)。
