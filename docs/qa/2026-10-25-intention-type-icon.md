# 同行 · 意愿类型图标 — Preview225

2026-10-25，Europe/Berlin。产品源码 `0b0f81c72db468c7351464f517cb518c213c01ee` 已推送。默认 iPhone14Plus 安装最终225并正常启动PID9862，普通97保留，无本轮后端／网页／数据库发布。

## 调整与最简复查

紧凑意愿卡左上角使用既有类型图标，独立26×26pt等比显示，与原类型文字并排，活动名称在下方。类别色、标题字号、右上菜单44pt、时间／状态、横向分区与全部原规则保持。长类型行使用4pt间距，常规字号仅类型文字最多适配至90%；辅助字号不缩小文字，继续自然换行。

仅替换原类型Label的展示声明，另升构建号；该声明块外源码逐字节相同。无新状态、请求、组件、依赖或业务规则，独立只读最简复查通过。Store／模型及所有操作回调保持。

## 实际验收

同一冻结最终App，复用未修改的两个现有手机用例，**58.034／85.161秒，共143.195秒，2通过、0失败／跳过**。

- 中文普通：两张等宽意愿卡、横滑第三张、不误切分栏、同页推荐、收藏往返、实际创建第四张并自动可见。
- 德文真实系统最大：一张宽卡、完整标题、全部操作与取消可见／可点／44pt、编辑页打开再取消、原删除确认打开再取消、其他状态及推荐可达。
- **21次截图／15种原始像素**逐张原图复核，重复SHA复用查看。普通长学习类型完整，图标不挤活动名和菜单。像素连通边界比较确认首张普通卡前后均188×180pt；大字号保留自然高度。

首轮同包两项143.054秒功能通过，但实拍发现学习类型文字被截为省略号，视觉拒收。随后只收紧类型行间距并增加有界文字适配，重新构建安装，最终两例全部重跑。先期结果与最终结果独立记录，未把AX通过当成视觉验收。

全部为现有活跃内存夹具，无真实账号或业务写入；未重跑未改的真人匹配、在线分享、邀请／日历API、单元或浏览器。截图文件名沿用既有combined224前缀，实际均新导出自225最终结果，并非复用旧截图。系统AssistiveTouch、原编辑器／确认面板与推荐可见片段及既有确认图标紧距限制单列；不作全App、深色、中间字号或人工性能结论。

## 交付

268项源码／私密Local／严格签名／二进制及编译测试来源与产品提交匹配。手机225正常PID9862，无QA参数／环境，普通97保留；Runner卸载，生成Runner和含Local的临时源码清理。原始日志0600、结果／附件目录0700，新增App报告0份。

[真机效果（示例数据）](./evidence/2026-10-25-intention-type-icon225/final/combined224-two-tiles-and-recommendation-zh-Hans-light-normal.png)、[完整学习类型](./evidence/2026-10-25-intention-type-icon225/final/combined224-recommendation-same-page-zh-Hans-light-normal.png)。

[运行记录](./evidence/2026-10-25-intention-type-icon225/acceptance-runs.json)、[逐图范围](./evidence/2026-10-25-intention-type-icon225/visual-review.json)、[高度比较](./evidence/2026-10-25-intention-type-icon225/card-height-comparison.json)、[设备](./evidence/2026-10-25-intention-type-icon225/device-verification.json)、[最简复查](./evidence/2026-10-25-intention-type-icon225/minimal-implementation-review.json)。
