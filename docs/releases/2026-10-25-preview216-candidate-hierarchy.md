# Preview 216：候选日期更清楚

默认 iPhone 14 Plus 已安装并正常启动 **Preview 216，PID 8989**，普通 SideSeat 97 保留。源码 **`c4fd4dcdda906adbe96bd48f44846f19a1f64c4b` 已提交推送**。

用户手机确实已是 215；先前图片以已选定时段为主，未充分代表用户看到的七天候选卡片。本次优化该分支：月份单列，醒目的「25–31日」为主，实际数量和「时间待定」为辅；稀疏两天仍为两天，跨月／跨年端点完整，窄列以年份和完整月日分组。已知时段、完整 AX、原入口及邀请／日历规则保持，无新状态／请求／依赖，独立最简复查通过。

最终 20 项单元／0.054 秒、四组合候选卡片真机专项 **252.269 秒**通过；28 次最终原图捕获／20 种像素复核，最大长卡连续分段。初次 251.244 秒自动化通过但中文 xLarge 跨年实图碎行，修复后换包重验，该初次结果不计最终验收。单元的 Simulator 启动阻塞与德语 `Okt` 测试预期修正单列记录。

四个 QA 收集计划前后精确状态／端点／人数／本人空闲／邀请版本保持；267 输入／Local／严格签名／最终二进制及默认设备普通启动核验完成。2 个 QA 账号 401／4 链接 404，Runner 和私密材料清理，新增 App 报告 0 份。未重跑完整邀请日历 API 链，不作全 App 最大字号或人工性能声明；无后端／网页／Schema 发布，生产沿用此前记录 `dpl_3y9L5UfyX7v1hhUPsXGVg7Cg27zz`。

[完整 QA](../qa/2026-10-25-candidate-hierarchy.md)、[来源](../qa/evidence/2026-10-25-candidate-hierarchy216/native-build-manifest.json)、[设备](../qa/evidence/2026-10-25-candidate-hierarchy216/device-verification.json)、[普通效果](../qa/evidence/2026-10-25-candidate-hierarchy216/candidate-normal.png)、[xLarge 效果](../qa/evidence/2026-10-25-candidate-hierarchy216/candidate-xlarge.png)、[最大跨年首段](../qa/evidence/2026-10-25-candidate-hierarchy216/cross-year-max-part1.png)。
