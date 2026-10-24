# 计划／同行顶部小导航 — Preview 200

两页复用 `ssSectionNavigationTrack` 与 `ssSectionNavigationItem`：中性 `fillTertiary` 底轨，选中 `surface`＋0.5pt `ControlSelection.border`，选中主文字／未选较深次要文字，原加粗／普通字重保持。去掉底轨整圈绿灰描边、暖粉底和选中深色提交色；保留 4pt 内距、44pt 点击区、原圆角及字号规则。

只修改 Plans 双栏、Together 三栏及宽度不足／大字号下拉入口；原生选项列表、绑定、标识、选中语义、横滑、滚动定位和全部业务规则保持。没有修改全局颜色 token、卡片、兼容页面或服务端；新增共用视觉实现 19 行，删除两处重复外框／填色，无新状态、依赖或请求。设计合同同步至 `DESIGN_SYSTEM.md`。

## 默认手机验收

同一 Preview **200** 产品包，iPhone 14 Plus `00008110-001A69110CC1401E`：

| 检查 | 实际结果 |
| --- | --- |
| 现有正常会话只读导航 | **21.222 秒通过**；无测试登录／外观／字号参数，实际打开同行、计划，仅保存分栏元素截图 |
| 中文／德文 × 浅色／深色 × 普通／最大字号，8 组合、两页 | **449.852 秒通过**；逐项点选、唯一选中语义、长文字、原生菜单选择与完成返回、44pt／屏幕范围和创建入口 |
| 真实横滑／固定分栏／创建取消 | 定向复测 **68.634 秒通过**；同行四次和计划两次分页，实际内容位移后核对固定位置，创建取消回到同一分栏 |

首轮手势 **15.779 秒失败**：prefix `firstMatch` 查询选到了隐藏的 `together-section-intentions`，当时实际选中的是 recommendations。只修测试为明确当前分页 ID，并要求目标可点击；保留原拖动坐标、实际手势和严格选中断言。产品未变。[具体修正](./evidence/2026-10-24-root-section-navigation200/gesture-test-correction.json)、[首轮两过一失败](./evidence/2026-10-24-root-section-navigation200/initial-summary.json)、[定向复测](./evidence/2026-10-24-root-section-navigation200/gesture-summary.json)、[各项最终结果及逐轮记录](./evidence/2026-10-24-root-section-navigation200/acceptance-runs.json)。不能将分批复测称为一次整套通过。

正常会话没有创建账号、注销、改资料、收藏、发送消息或提交计划，只作导航与分栏截图。测试矩阵另用受控离线夹具，红色协调接口错误不算真实 API 失败，也不作为清洁页面证据；未把夹具开关等同于线上开关。

实际截图逐项复核：普通三栏／双栏及大字号下拉保持同一色系，长标签未碰边；深色选中填色较接近底轨，但细描边、白色主文字与字重仍可辨识。最大字号疑似淡色背景的问题经独立复看及只读像素取样确认：白色选中块、浅灰轨道均存在，没有编辑图片或改产品。[取样记录](./evidence/2026-10-24-root-section-navigation200/largest-light-pixel-check.json)。验收仅顶部导航，既有卡片／正文最大字号排版不在本轮范围。

[正常会话：同行](./evidence/2026-10-24-root-section-navigation200/normal-session-together-selector-strip.png)、[正常会话：计划](./evidence/2026-10-24-root-section-navigation200/normal-session-plans-selector-strip.png)。代表布局：[浅色同行](./evidence/2026-10-24-root-section-navigation200/fixture-section-together-zh-Hans-light-normal.png)、[浅色计划](./evidence/2026-10-24-root-section-navigation200/fixture-section-plans-zh-Hans-light-normal.png)、[深色同行](./evidence/2026-10-24-root-section-navigation200/fixture-section-together-zh-Hans-dark-normal.png)、[深色计划](./evidence/2026-10-24-root-section-navigation200/fixture-section-plans-zh-Hans-dark-normal.png)、[德文最大同行](./evidence/2026-10-24-root-section-navigation200/fixture-section-together-de-dark-largest.png)、[德文最大计划](./evidence/2026-10-24-root-section-navigation200/fixture-section-plans-de-dark-largest.png)、[原生选项](./evidence/2026-10-24-root-section-navigation200/fixture-section-together-options-de-dark-largest.png)、[滚动／创建取消后](./evidence/2026-10-24-root-section-navigation200/fixture-plans-after-scroll-create-cancel.png)。正常账号只发布无私人内容的元素截图；不发布正常账号全页录像或自动诊断附件。

## 安装与范围

[构建来源](./evidence/2026-10-24-root-section-navigation200/native-build-manifest.json)：248 App／18 配置脚本及 project.yml／1 共享资源从活跃工作区刷新到隔离生成工程并逐字节一致，私密 Local 配置匹配，严格签名和二进制 hash 核验。两版测试源码 hash 独立记录。

[设备核验](./evidence/2026-10-24-root-section-navigation200/device-verification.json)：已安装 **200**，无测试参数普通启动 **PID 7858** 与实际进程对应；普通 **97** 保留。Runner／私密 xctestrun／设备 JSON 已清理，原始日志 0600，结果／附件目录 0700。没有创建服务端测试账号或删除账号／计划。本轮基线后 **0 新 App 崩溃／资源报告**；这不代表修复 Preview 199 的 CPU resource 或额外末页左滑观察。

本轮没有重跑邀请到日历的真实 API 完整链；[199 的既有验收](./2026-10-24-plan-create-entry.md)保留独立范围，不冒充本次执行。既有菜单回顶、详情最大字号和固定底栏问题未修改。无后端／网页／Schema 发布，也未重复领域／单元／浏览器测试；[api/www 只读重验](./evidence/2026-10-24-root-section-navigation200/production-status.json)仍 Ready `dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7`。无关 `tsconfig.json` 保留且不提交。
