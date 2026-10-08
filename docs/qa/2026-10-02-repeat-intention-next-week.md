# 「再约一次」默认下周时间

日期：2026-10-02。

## 行为

- 从已过期意愿点击「再约一次」，默认选中明确时间并展开开始、结束时间，可以直接发布或继续调整。
- 首个原时段安排到当前日期的下一个日历周，保留原星期和本地时刻。历史意愿无论多旧，都不会回落到今天附近的默认时间。
- 多时段一起按整周移动，保留顺序、间隔及各自时长；跨夏令时保持本地开始时刻及实际持续时长。
- 原意愿没有明确时段时，使用一周后的默认时段。
- 发布仍然创建新意愿，原记录和聊天保留。普通新建／编辑以及计划取消后的「寻找新的同行」保持原有逻辑。
- 中、英、德提示文案说明已预填下周时间。

## 验证

- `WeeklyIntentModelsTests` 18 项通过，其中新增再约时间的参数化场景涵盖常规下周、较早历史、跨年、春秋两次夏令时切换；同时验证多时段和原时间缺失的情况。
- `testExpiredIntentionRepublishesWithNewTime` 通过：历史默认折叠，点击再约保留活动内容，具体时间已选中，发布按钮直接可用；发布成功后新卡片出现、旧意愿保留。
- 同次构建还执行了 `CourseModelsTests` 4 项，全部通过。
- 已检查模拟器中文截图，开始／结束时间、已选时间和发布按钮正常显示。
- 三种语言 strings 文件格式检查及 `git diff --check` 通过。

结果包：`/tmp/sideseat-repeat-next-week-20261002.xcresult`、`/tmp/sideseat-repeat-time-models-20261002.xcresult`。
截图：[预填时间](evidence/2026-10-02-repeat-intention/repeat-intention-new-time-zh.png)、[发布后保留历史](evidence/2026-10-02-repeat-intention/repeat-intention-history-zh.png)。
