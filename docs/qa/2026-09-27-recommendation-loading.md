# 推荐页加载体验调整（2026-09-27）

首次进入推荐页时，“寻找更多推荐”会先于首批卡片出现。本次将按钮的展示与首批推荐成功加载绑定。

## 当前行为

- 首次请求尚未完成：显示三张静态骨架卡片，隐藏加载更多按钮。
- 首批成功：显示卡片或空状态，再展示寻找更多入口。
- 加载更多：保留已有卡片；按钮显示“正在加载推荐…”并禁用，避免重复请求。
- 首次请求失败：显示错误与重试入口，不展示加载更多。
- 再次进入同行：保留当前内容并刷新；刷新失败保留卡片，显示可重试提示。
- 探索结果为空：显示空状态与重试入口；服务端没有更多结果时隐藏更多按钮。

本次只调整原生页面加载呈现，不变更会员配额、推荐排序或 API 分页协议。

## 验证

使用 SideSeat UX QA（iOS 26.5）运行原生 XCTest UI 测试，通过 DEBUG 延迟与失败注入验证界面时序。测试使用本地固定数据，不表示生产网络或推荐算法已完成验收。

- `testRecommendationLoadingWaitsForCardsAndKeepsExistingContent`：首屏骨架、按钮延后、加载更多禁用及保留卡片。
- `testRecommendationInitialFailureCanRetryWithoutShowingMore`：首次失败不显示更多，重试后恢复。
- `testRecommendationRefreshFailureKeepsCardsOnReturn`：切换日历后返回同行，刷新失败仍保留卡片。
- `testRecommendationsSearchOnDemandWithTierLimits`：现有免费及 Plus 推荐加载回归。

结果：4 项 UI 测试全部通过，0 失败；已检查首屏骨架、加载更多和刷新失败截图。

结果包：`/tmp/recommendation-loading-final-20260927.xcresult`。

## 截图

- [首次加载](evidence/2026-09-27-recommendation-loading/first-loading.png)
- [加载更多](evidence/2026-09-27-recommendation-loading/more-loading.png)
- [首次请求失败](evidence/2026-09-27-recommendation-loading/load-error.png)
- [刷新失败保留卡片](evidence/2026-09-27-recommendation-loading/refresh-error.png)
