# Preview220：弹出位置与已确定卡片日期

2026-10-25，Europe/Berlin。默认 **iPhone14Plus 已正常启动 SideSeat Preview220，PID9516**，普通 SideSeat97 保留。产品源码 **`ed8cb66ff5a0b327508442d0e86433c8e9c60312` 已提交推送**。

## 实现

普通字号会话菜单贴近触发卡片，按空间选择上下位置；辅助字号保留可滚动大面板。发布／取消／删除计划、删除同行意向、分享错误和放弃个性化修改，六处产品确认复用现有 `ssActionPrompt`，按系统安全区居中。连续创建／编辑保留大面板；日历只读详情在辅助字号直接打开大面板。候选日期仍原位展开，每日时段菜单仍贴按钮；系统分享、输入、权限及显式日历区域操作保留原呈现。

已确定卡片按[批准底板](../designs/2026-10-25-root-foundation-v1/README.md)采用排版式日历：小月份／星期、大日期、下方完整起止时间，跨天保留结束日期与时间。设计没有另加日历方框或彩色月份条。年份／时区分支、完整 AX 描述、整卡入口、筹划中与等待他人卡片保持。

七个现有 UI 文件及 Preview 版本号复用已有菜单、确认组件和 formatter；没有新业务状态、请求、组件或依赖。原绑定、文案、按钮角色、异步回调及邀请／日历规则保留。独立最简复查及两次窄补修复查均无 material findings。冻结归档未使用，兼容 TapOrLongPress 实现保持原字节。[盘点](./evidence/2026-10-25-popup-calendar220/popup-inventory.json)、[最简复查](./evidence/2026-10-25-popup-calendar220/minimal-implementation-review.json)。

## 实际验收与来源边界

| 验证 | 实际执行与范围 |
| --- | --- |
| 完整计划 | 基线包 **384.819 秒、8 API 阶段通过**：创建→自己填写／提交并分享→App好友卡片→朋友填写→23:00至次日01:00→邀请→接受→发起人正式发出→双方各一条精确日历。删除／取消先保留，发布先取消再确认 |
| 已确定卡片 | 同基线包 **87.098 秒、四组合通过**：中文浅色普通、德语深色普通、中文深色及德语浅色真实系统 AccessibilityXXXL；普通 OCR 核验日期层级，最大卡片以24pt重叠连续段覆盖，原整卡入口保持 |
| 普通确认／日历 | 两个独立普通字号迭代在 **295.314 秒运行的前段完整完成**，随后最大字号离屏行的测试定位失败；仅采用已完成的18张确认／日历图和对应操作，不将整个用例记为通过。旧窄菜单另行修复 |
| 最终普通菜单 | 加宽后 **55.091 秒通过**，中浅／德深普通两组合、首末两行菜单；四张最终原图均通过，中文不再3+1拆字，德文按整词换行 |
| 中文最大字号 | **263.121 秒运行中的独立中文迭代完整完成**，后续德文滚动容器测试定位失败；采用完成的15张中文原图，不将整个用例记为通过 |
| 德文最大字号 | 独立续验 **200.712 秒通过**，长删除确认初始内容到按钮可滚动、错误框关闭重开、草稿保留／丢弃／恢复、日历大面板；实图发现放弃按钮碎词，再作下列补修 |
| 最终放弃按钮 | 仅移除重复垃圾桶装饰，**73.918 秒窄补验通过**；德文最大字号 `Änderungen`／`verwerfen` 整词两行，保留编辑、放弃关闭、重开经典样式且保存禁用，三张最终原图通过 |

最终验收采用 **94次实际捕获／74种原始像素**，每种已实际打开查看，完全相同 SHA 复用；初始四张窄菜单及两张碎词按钮图排除在最终采用数之外，保留未通过记录。自动测试通过没有替代实图验收。[执行与六次测试脚本前置失败](./evidence/2026-10-25-popup-calendar220/acceptance-runs.json)、[逐图总表](./evidence/2026-10-25-popup-calendar220/visual-review.json)、[API](./evidence/2026-10-25-popup-calendar220/final-native-api.json)。

两个视觉补修均为现有参数删改：Inbox最小宽度132默认→180（原上限204）；放弃动作去掉可选图标。各次补修只有一个参数，其他267输入分别与上一包相同；最终相对完整链基线仅两个文件的这两处参数不同，其他266输入保持。没有在宽度／装饰修复后重复不受影响的完整链、卡片和普通确认。各执行包、编译测试源 hash 和最终二进制分别保留，不声称所有阶段是同一二进制。[宽度差异](./evidence/2026-10-25-popup-calendar220/menu-width-repair.json)、[装饰差异](./evidence/2026-10-25-popup-calendar220/appearance-icon-repair.json)、[来源](./evidence/2026-10-25-popup-calendar220/native-build-manifest.json)。

六次前置测试定位问题分别涉及：私聊误要求群聊才有的隐藏操作、缺已有同行功能开关、安全区与物理屏幕中心参照不同、系统中面板Done缩放AX宽度、虚拟化列表离屏行尚未加载、滚动提示本身是ScrollView而非其后代。对应作用域及耗时保留在执行表。系统Done验证可点并真实关闭；自定义菜单／确认动作44pt检查保持。

离线布局仅用127.0.0.1:9，真实数据由专用账号完整链验证。最大长卡／确认使用连续滚动，不宣称一屏容纳。跨午夜有真实流程原图，跨年／时区分支依未变源码核验；不冒充新增跨年实图。原私聊德文提议按钮拆词、原大面板放大图标间距、原日历Edit工具栏换行另列既存限制，不计为全App排版通过。AssistiveTouch等系统浮层遮住的像素不计已验。没有全App所有弹窗、全部子页最大字号或纯人工性能声明。

## 正常交付

最终268产品输入与提交逐SHA核对，Local配置／严格签名／冻结二进制匹配；最终编译测试源也与提交匹配。默认设备UDID `00008110-001A69110CC1401E`，正常启动参数为空，PID9516与实际可执行文件一致。2专用账号已删、2 token401／1链接404；设备Runner、私密启动配置、临时凭据与生成工程／隔离源码已清理，原始日志与结果保持私密权限。新增1份CPU资源报告Action none，非终止报告，发生在自动化时间窗，不作人工性能或变更因果结论。

[设备](./evidence/2026-10-25-popup-calendar220/device-verification.json)、[账号清理](./evidence/2026-10-25-popup-calendar220/final-native-cleanup.json)、[本地清理](./evidence/2026-10-25-popup-calendar220/local-cleanup.json)、[报告摘要](./evidence/2026-10-25-popup-calendar220/resource-report-summary.json)。本轮无网页／后端／Schema发布，未重复无关领域单元测试。

原图：[真实跨午夜卡片](./evidence/2026-10-25-popup-calendar220/confirmed-cross-midnight.png)、[普通日期卡片](./evidence/2026-10-25-popup-calendar220/confirmed-calendar-normal.png)、[最终普通菜单](./evidence/2026-10-25-popup-calendar220/inbox-menu-normal.png)、[居中发布](./evidence/2026-10-25-popup-calendar220/publish-centered.png)、[最大长确认抬头](./evidence/2026-10-25-popup-calendar220/delete-max-scroll-top.png)、[最大长确认动作](./evidence/2026-10-25-popup-calendar220/delete-max-scroll-actions.png)、[最终放弃按钮](./evidence/2026-10-25-popup-calendar220/discard-max-final.png)。[交付记录](../releases/2026-10-25-preview220-popup-calendar.md)。
