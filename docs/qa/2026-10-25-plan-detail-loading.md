# 计划卡片进入详情的加载过渡 — Preview222

2026-10-25，Europe/Berlin。产品／测试源码 `e0744e6bc57798248b710d5c9bc507498ea1e8af` 已推送。默认iPhone14Plus已安装Preview222并无测试参数正常启动PID9656，普通97保留。无本轮网页／后端／数据库发布。

## 修复

原详情在首个请求完成前显示空白与中央转圈，随后整块切成内容，快速网络也会闪一下。现在沿用同一详情表面，先显示所点卡片已有的活动名称、候选日期或确定时间／完整时区，以及静态时间表占位，响应成功后原位替换。不是提前构造完整计划，也不提前提供编辑、分享、邀请或日历操作。

只增加当前导航的一份可选列表摘要；写入／读取按token匹配，原生返回、reset及无摘要入口清理旧值。正常卡片仍替换为原根层级，历史仍append。无摘要深链使用同结构中性占位。原GET、授权、草稿、明确提交、十秒刷新、邀请／正式发出和日历逻辑保持；日期格式只改为共享dates参数。独立最简审查通过，未添加预取、持久缓存、业务请求或产品测试hook。

## 最终验收

- Navigation **26项／0.035秒**通过（既有Simulator目标），含新增token隔离、返回／换计划、history append／replacement／reset。
- 同一冻结App在默认14Plus完整原生流程 **410.714秒／8API阶段通过**：创建→手动填写提交分享→好友卡片→参与者填写→跨天最终时间→邀请→接受→正式发出→双方唯一日历。普通中文浅色稳定节点实图另验。
- 同包真机加载专项 **3用例，122.952／26.853／101.008秒，0失败／跳过**：候选／已确定，英文普通浅色／真实AccessibilityXXXL深色；快速响应、首个GET挂起至少三秒、失败与Retry、返回换计划／重入、无卡片摘要深链。占位实际可见、名称／日期／时区正确、无独立spinner、无提前动作、成功后真实内容与入口正常。
- 专项通过Runner仅本机回环只读服务控制请求，回放Mac刚从本轮2条QA计划读到的接口响应，限owner授权与两token，含本地500／gate。完整链才是实时生产API端到端验证。首次专项3项因Runner公网Wi-Fi path denied失败，修复仅测试运输方式，App未改；失败来源与时长如实保留，不冒充通过。

共66次捕获／50种原始像素实看，完全同SHA复用。完整链未捕捉瞬时加载，占位由受控GET图验证。最大字号成功页仅拍到上段，未遍历完整时间表；Retry截图保留原错误页，未捕捉点击瞬态。AssistiveTouch遮挡和部分参与者名单末行未入镜单列，不作全App／全部语言最大字号或人工性能结论。

实图：[loading-slow-start-confirmed-maximum](./evidence/2026-10-25-plan-detail-loading222/loading-slow-start-confirmed-maximum.png)、[loading-slow-start-collecting-normal](./evidence/2026-10-25-plan-detail-loading222/loading-slow-start-collecting-normal.png)、[loading-failed-normal](./evidence/2026-10-25-plan-detail-loading222/loading-failed-normal.png)。

## 交付

268输入／Local／严格签名／二进制与提交匹配；编译的原生测试与Navigation源码核验。2个一次性账号已删除并token401、2链接404；Runner、私密运行配置／夹具及生成工程清理。新增App报告0份，实际分类见设备与资源记录。

[验收运行](./evidence/2026-10-25-plan-detail-loading222/acceptance-runs.json)、[实图复核](./evidence/2026-10-25-plan-detail-loading222/visual-review.json)、[设备](./evidence/2026-10-25-plan-detail-loading222/device-verification.json)、[最简复查](./evidence/2026-10-25-plan-detail-loading222/minimal-implementation-review.json)。
