# 分享页日程改为双方 Plan 确认

2026-10-04，Europe/Berlin。

移除公开意愿页的个人日程快捷保存及独立时间表单。具体时段需主动选择，只作为协商上下文；计划被明确接受后，既有 Plan 服务按最终提议时间写入双方日程。注册接受摘要完整展示跨天结束日期。

- 源码：`71973c3c8d227c25fb27172777e1b0775760e1a9`，已推送 `codex/ios-uxui-20260922`。
- 正式部署：`dpl_GpCswCULmNxYoSyumfFBUZJFAJtg`，`READY`；`www.sideseat.de`、`api.sideseat.de` 回读确认。
- 候选：`https://sideseat-2jzhp9nct-baichus-projects.vercel.app`。候选检查通过后 promote，再做正式浏览器验收。
- 回滚：`dpl_4dAoxjXo9phVGTqp5wvYJrJGvVJZ`。受控目录仅覆盖分享客户端与三语文案两个运行文件；1864 个内容文件比对确认（不计发布记录及项目连接文件）。无数据库结构/迁移变化，146 个已有迁移同步；构建显式跳过迁移部署。
- 本地 7 个相关用例最终通过，覆盖未选时间、联系/注册不写日程、取消不写日程、游客注册接受、已有账号接受、协商后跨天时间一致、刷新不重复及用户名检查。相关 ESLint、diff whitespace、流程文档链接、正式构建/类型检查通过。
- 候选 11 项检查通过，分享客户端产物无个人日程写入路径。正式两个 QA 账号完成匿名联系、注册、原生 API 登录、回复、计划提议及接受。通过 App 同一日程接口确认：联系/注册/提议后双方日程为空；明确接受后每人恰好一条，关联同一 Plan，起止时间与协商后的跨天提议完全一致；刷新不重复。浏览器设为 Asia/Shanghai，计划按 Europe/Berlin 显示。浏览器异常 0、手机视口无横向溢出。
- API 配置、Privacy、Support、AASA 全部 200；交付时最近 15 分钟 error 日志 0 条，仅为短时检查。候选/正式/本地 QA 账号均已清理；临时开发服务关闭。
- 沿用 **Preview 96**，没有原生二进制变化或本阶段安装/真机跨 App 验收。刷新分享页即可使用新逻辑。个人日程服务和既有用户日程没有删除或修改。

[问题与验证](../qa/2026-10-04-share-plan-consent.md) · [交付证据](../qa/evidence/2026-10-04-share-plan-consent/delivery.json)。
