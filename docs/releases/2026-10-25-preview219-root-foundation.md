# Preview219：统一五个一级页面底板

默认 iPhone14Plus 已安装并正常启动 **SideSeat Preview219，PID9158**，普通SideSeat97保留。源码 **`e7e0a2ef1819d079c6f96d7883352536eb6affd6` 已提交并推送**。

同行、计划、日历、消息、我的背景、居中抬头、分栏、白卡和中性操作统一；计划仍在右下发起、整卡进入、需要处理纵排／等待他人横排。消息分组、搜索和个人管理组同步。固定导航与工具局部控制字号，正文保持系统最大字号；保留数据、权限、真实头像、用户个人样式和邀请／日历规则，未增接口或业务状态。

实图发现的最大字号碎词／日期省略／图标膨胀／姓名挤压均已修正；同时修正日历夏令时位置与反向编辑换算、接受后的等待提示。独立最简复查无遗留material findings。54项／5组单元0.069秒；冻结基线完整计划370.779秒／8API、五根四组合688.415秒通过。最后仅月历星期一行ID修复，其他267输入保持，四组合90.022秒补验通过；没有在metadata修复后重复无关完整链。93次实际截图／88种像素复核，离线、最大字号可见范围与系统浮层限制见QA。

最终268输入／Local／严格签名／二进制与源码提交一致；4测试账号401／2链接404、Runner／私密启动文件／生成工程清理。新增2份CPU资源报告均Action none，非终止报告，不作人工性能结论。无后端／网页／Schema发布，生产沿用此前 `dpl_3y9L5UfyX7v1hhUPsXGVg7Cg27zz` 记录。

[验收与五页原图](../qa/2026-10-25-root-foundation.md)、[来源](../qa/evidence/2026-10-25-root-foundation219/native-build-manifest.json)、[设备](../qa/evidence/2026-10-25-root-foundation219/device-verification.json)、[最后一行差异](../qa/evidence/2026-10-25-root-foundation219/weekday-repair.json)。
