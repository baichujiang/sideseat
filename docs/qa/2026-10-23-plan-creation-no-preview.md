# 创建页去掉时间表预览 — Preview 194

第一步保留活动名、地点、候选日期、每天可选时段、时区和朋友提议活动选项；删除只读时间表预览。沿用原 COLLECT 创建和自动打开分享面板，关闭分享后详情立即显示可填写的时间表，无需等待有人回应。手动提交、最终选时、邀请／接受／发布和日历规则保持。

清理创建专用 `table` 状态、初始化／重建时间格的计算和三个监听；请求直接使用相同的唯一排序日期键与日历时区。删除共用网格中只服务该预览的三个参数及死分支，视图文件净减 36 行。没有新增状态、请求、依赖或入口。日期范围、每日起止、标题／地点校验及幂等键保持。

源码 **`d3a6c066c0bdc20b6fede9ab85c43d83f4ccde49` 已提交并推送**。以下均使用同一最终 App 产品包；两次专项修正只改测试点击方式，产品哈希未变。

## 实际验收

默认 iPhone 14 Plus／iPhone (4)，UDID `00008110-001A69110CC1401E`，iOS 26.6.1。Mac 准备两个专用好友账号并读取 API，真实业务操作由手机完成。

| 范围 | 结果 |
| --- | --- |
| 完整真机流程 | **328.239 秒通过**：创建前无网格，分享后出现空闲表，App 好友卡片投递，双方点选／提交，最终时间取消／拖选／跨天草稿，正式邀请、明确接受、发起人发布、双方精确唯一日历 |
| API | **8 阶段通过**；另核实实际创建保留 7 个唯一排序日期、09:00–17:00、Europe/Berlin 和 224 个底层候选时段，不自动代填 |
| 创建页四组合 | **69.351 秒通过**：中文浅色／德文深色，各普通和最大辅助字号；无预览／日期表头，保留日期、每日时段与原主按钮；输入时隐藏底栏，键盘不遮挡当前输入。实际截图逐张检查 |
| 日期及小时专项 | **57.505 秒最终通过**：展开／收起日历保留名称地点和时段；精确选择 08:00、无效结束 07:00 会禁用发起、改回 18:00 恢复；最后保持 08:00–18:00 |

证据：[完整结果](./evidence/2026-10-23-creation-no-preview194/phone-summary.json)、[8 阶段 API](./evidence/2026-10-23-creation-no-preview194/collection194-api.json)、[创建数据](./evidence/2026-10-23-creation-no-preview194/candidate-configuration.json)、[小时最终结果](./evidence/2026-10-23-creation-no-preview194/hours-final-summary.json)。四组合用例在初轮混合结果中单独通过；同轮小时用例失败，不能将该整轮写为全部通过。

## 实际画面

[第一步无预览](./evidence/2026-10-23-creation-no-preview194/create-before-publish.png) → [发起后零人填写时即有可填写时间表](./evidence/2026-10-23-creation-no-preview194/editable-after-publish.png)。

[中文普通](./evidence/2026-10-23-creation-no-preview194/creation-regular-zh.png)、[中文最大字号](./evidence/2026-10-23-creation-no-preview194/creation-largest-zh.png)、[德文普通](./evidence/2026-10-23-creation-no-preview194/creation-regular-de.png)、[德文最大字号](./evidence/2026-10-23-creation-no-preview194/creation-largest-de.png)、[小时修改后的有效表单](./evidence/2026-10-23-creation-no-preview194/daily-hours-valid.png)。

## 中间失败与范围

第一次小时专项 **40.632 秒失败**：XCTest 对菜单中尚未显示的 18:00 使用元素点击，实际变成 03:00，所以按钮正确保持禁用。[失败画面](./evidence/2026-10-23-creation-no-preview194/hours-initial-wrong-auto-tap.png)取自该次真机录像结尾。第二次添加可见性检查后，元素点击仍把画面中的 07:00 点成 01:30，新增的值断言在 **41.486 秒**捕获该问题。

最终测试改为滚动到选项可见、点击其实际屏幕矩形中心，并核对每个确切值；**57.505 秒通过**，未修改产品时间逻辑或降低校验。[尝试记录](./evidence/2026-10-23-creation-no-preview194/attempts.json)保留失败与成功范围。产品包哈希保持不变，因此无需因另一测试方法的操作修正重跑已通过的完整链路。

本轮没有重复模型／领域／浏览器、活动提议完整链路、日期快速连点或 31 日上限执行；旧日期测试的废弃预览断言已同步更新并编译，不计为本轮执行。**最大字号验收只覆盖创建页。Preview 193 已记录的德文详情时间格空白仍未解决，本轮不宣称修复，也不把本次创建页通过当作详情视觉通过。**

## 构建、手机与清理

[来源与哈希](./evidence/2026-10-23-creation-no-preview194/native-build-manifest.json)：隔离目录从活跃工作区复制，248 个 App、18 个配置／脚本输入及共享日历资源逐字节核验，工程由同一 `project.yml` 生成。严格签名通过，`app.sideseat.mobile.preview`／194。

[手机核验](./evidence/2026-10-23-creation-no-preview194/device-verification.json)：最终安装及无测试参数普通启动 **PID 7556** 与实际进程一致，环境仅 TERM，普通版 **97** 保留。阶段内无新增 App 崩溃或资源报告。两个专用账号／一个计划链接清理，令牌 401、链接 404 已核验；Runner、私密夹具／xctestrun／设备 JSON 清理，原始日志 0600、结果及原始附件目录 0700，未清除用户数据／钥匙串。

无后端、网页、Schema 或迁移发布；api/www 只读重验均 Ready `dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7`，见[线上版本](./evidence/2026-10-23-creation-no-preview194/production-status.json)。无关 `tsconfig.json` 工作保留且未提交，冻结归档未改。
