# 日历未显示日程提示（2026-09-27）

原有上下边缘的彩色短线改为可点击的文字胶囊：箭头说明方向，文字明确显示未显示日程数量。

- 日视图：统计当前日期上方、下方完全不可见的日程。
- 周视图：汇总当前可见日期，每个边缘只显示一个入口，避免窄列上的提示拥挤。
- 点击上方或下方提示，滚动至该方向最近的日程，保留 30 分钟前置空间。
- 排除全天日程与部分可见卡片；该方向没有隐藏日程时不显示提示。
- 保留至少 44pt 点击高度，支持动态字体、减少动态效果及 VoiceOver 描述；提供中、英、德文文案。

验证使用 DEBUG 日历固定数据，不修改真实日程。密集场景截图中的大数量来自每半小时一项的测试数据。

## 定位修复

连续测试发现：周视图向下跳转被日末边界限制后，绑定的目标时间可能与实际屏幕位置不同，随后向上点击可能不移动。现使用实际滚动位置计算提示与目标；iOS 18 及以上使用滚动几何信息，iOS 17 使用坐标偏移。

## 验证结果

- `CalendarTimelineScrollAnchorTests`：6 项通过，覆盖计数、可见日期范围、最近目标与部分可见卡片排除。
- `AuthenticationUITests.testOffscreenEventCuesShowAtBothTimelineEdgesAndJump`：主模拟器通过，验证日/周视图文字、44pt 点击高度、向下后再向上连续跳转。
- 主模拟器结果包：`/tmp/calendar-hidden-cues-fixed-20260927.xcresult`。
- 已检查 [周视图截图](evidence/2026-09-27-calendar-hidden-event-cues/week.png) 与 [日视图截图](evidence/2026-09-27-calendar-hidden-event-cues/day.png)。

模拟器运行版本为 iOS 26.5；iOS 17 兼容路径已编译，未在 iOS 17 设备上运行。

小屏 iPhone 13 mini 同一 UI 测试通过（0 失败），覆盖日/周视图连续上下跳转。最终版本编译通过。结果包：`/tmp/calendar-hidden-cues-mini-20260927.xcresult`。截图：[小屏周视图](evidence/2026-09-27-calendar-hidden-event-cues/week-mini.png)、[小屏日视图](evidence/2026-09-27-calendar-hidden-event-cues/day-mini.png)。
