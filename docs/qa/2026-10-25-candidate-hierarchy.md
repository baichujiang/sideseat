# Preview 216：候选日期卡片层级

2026-10-25，Europe/Berlin。默认 iPhone 14 Plus 已安装并正常启动 **Preview 216，PID 8989**，普通 SideSeat 97 保留。最终四组合真机专项 **252.269 秒**，单元 **20 项／0.054 秒**；28 次最终原图捕获、20 种像素已复核。

## 问题与实现

用户查看的确实是已装 215 的 iPhone 14 Plus。差异来自卡片数据：用户看到仅有七天候选日期的筹划卡，先前展示以已选定具体时段的卡片为主；不能归因于打开另一台手机或旧版 App。

仅调整候选日期分支：同月先显示月份，主日期加粗为「25–31日」，下方以较弱字级合并实际数量与「时间待定」。仅选择 25 日、31 日时仍显示「2 天可选」，不会把日期跨度当成七个选项。跨月／跨年保留完整端点；宽度不足时按年份和完整月日分组，避免「2027年1月／1日」碎行。单日期／无日期回退保持。

复用原 `candidateDays`，新增两个 formatter 显示属性和一处卡片端点回退，无新状态、请求、依赖或 Schema。已知时段分支及卡片之外页面逐字保持，完整 AX 数量／日期／时钟／时区、原路由、横向分区、发起按钮和邀请／日历规则不变；独立最简复查无实质问题。

## 最终验证与限制

| 验证 | 范围与结果 |
| --- | --- |
| 原生单元 | 20 项、0 失败／跳过、0.054 秒；七天及稀疏两天实际数量、同月层级、中英德跨月／跨年、单日期／无日期和原状态／时钟／时区契约 |
| 真机候选卡片 | 252.269 秒；中文 L 浅色、中文 xLarge 浅色、英文 L 浅色、德文真实 AccessibilityXXXL 深色；七天短标题、七天长标题、稀疏两天、跨年两天共四类 |
| 入口与可达性 | 精确 AX 数量／完整首末日期／时间待定、无虚构时钟；原严格视口和 44pt 断言；每组合首张卡进入原详情并返回，不填写或提交 |
| 服务端保持 | 两个专用 QA 账号、四个 COLLECTING 计划；前后 phase、chosenStart／chosenEnd、participantCount、mySlotIds、invitationVersion 一致，均未产生空闲或邀请写入 |

最大长卡通过有重叠的连续原图分段复核，不声称全部信息同屏。最终 28 次捕获／20 种像素，完全相同者按 SHA 复用原图审查。系统浮层及具体图片限制以逐图记录为准。

初次真机专项 251.244 秒虽自动化通过，实图发现中文 xLarge 跨年末日碎行，因此未计入最终验收。仅修正端点显示回退，重建 App 并重跑全部四组合；formatter 和 UI 测试源码保持。单元初次 Simulator 启动阻塞尚未执行测试，针对指定 Simulator 重启；随后一个用例的两条断言把德语独立月份误写成 `Okt.`，按 iOS 实际 `Okt` 修正测试字面量后 20 项通过，产品未因该问题改变。最终手机产品的 formatter 与通过单元测试的版本一致。

本轮未重复完整发邀请至双方日历 API 流程、网页验收或既有加载／空页面测试，也不作全 App 最大字号或人工性能验收声明。

## 来源、手机与清理

源码 **`c4fd4dcdda906adbe96bd48f44846f19a1f64c4b` 已提交并推送**。267 项产品输入、Local 配置、严格签名和最终冻结二进制与活跃源码／隔离构建／提交核验一致；默认设备 UDID `00008110-001A69110CC1401E` 身份、无 QA 参数普通启动 PID 8989 与真实进程匹配，普通 97 保留。

两个专用 QA 账号／四条计划链接已清理，账号 token 401、链接 404；Runner、私密 fixture／启动配置／生成工程移除。按报告名称及 lastModDate 比较新增 App 报告 **0 份**。无本轮后端／网页／Schema 发布，生产沿用此前记录的 `dpl_3y9L5UfyX7v1hhUPsXGVg7Cg27zz`，不作为本轮重新核验部署结果。

[执行记录](./evidence/2026-10-25-candidate-hierarchy216/acceptance-runs.json)、[单元](./evidence/2026-10-25-candidate-hierarchy216/unit-tests.json)、[最简复查](./evidence/2026-10-25-candidate-hierarchy216/minimal-implementation-review.json)、[逐图](./evidence/2026-10-25-candidate-hierarchy216/visual-review.json)、[服务端之前](./evidence/2026-10-25-candidate-hierarchy216/candidate-server-before.json)、[服务端之后](./evidence/2026-10-25-candidate-hierarchy216/candidate-server-after.json)、[初次范围](./evidence/2026-10-25-candidate-hierarchy216/initial-attempt-scope.json)、[来源](./evidence/2026-10-25-candidate-hierarchy216/native-build-manifest.json)、[设备](./evidence/2026-10-25-candidate-hierarchy216/device-verification.json)、[清理](./evidence/2026-10-25-candidate-hierarchy216/final-native-cleanup.json)。

[普通实图](./evidence/2026-10-25-candidate-hierarchy216/candidate-normal.png)、[xLarge 实图](./evidence/2026-10-25-candidate-hierarchy216/candidate-xlarge.png)、[最大跨年首段](./evidence/2026-10-25-candidate-hierarchy216/cross-year-max-part1.png)、[交付](../releases/2026-10-25-preview216-candidate-hierarchy.md)。
