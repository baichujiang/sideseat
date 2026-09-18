# 取消意愿有效期 — Preview 51 准备记录

后续状态：用户已确认正式后端和数据库变更，实际交付为包含最新资料编辑 UI 的 Preview 52。生产迁移、部署与真机安装均已完成，见 [正式发布记录](2026-09-12-persistent-intentions-production.md)。以下保留当时的准备记录，51 安装包未安装。

日期：2026-09-12。用户指出手机“我的意愿”卡片仍有有效期。

## 原因与修正

设备核对为 Preview 50。它从 Preview 49 的独立 UI 源码构建，保留了线上旧意愿契约；因此有效期和延期入口仍在。工作区已经实现的“取消有效期”尚未随正式后端和数据库上线，不能将手机上的这一功能标记为已删除。

Preview 51 已从当前工作区重新构建，包含长期有效意愿、最新同行卡片/滑动条和紧凑的资料编辑页。核对 Together 源码已无截止日期展示、延期动作、延期说明和基于有效期的编辑上限。意愿持续保留至用户结束，暂停只停止寻找；推荐卡独立决定期限不变。

## 已完成的准备

- 签名 Development 构建通过；`codesign --verify --deep --strict` 通过。
- 已核对身份：SideSeat Preview / `app.sideseat.mobile.preview` / 1.0.0 (51)，API `https://api.sideseat.de`。
- 保留的安装包：`/tmp/sideseat-persistent-preview51/SideSeat.app`。
- 源文件哈希：`/tmp/sideseat-persistent-preview51/source-manifest.json`。
- 构建记录：`/tmp/sideseat-persistent-preview51-build.log`。
- 既有功能与契约验证见 [取消有效期实现记录](2026-09-12-persistent-intentions.md)；后端构建及迁移影响审查见 [发布准备记录](2026-09-12-persistent-intentions-preview48.md)。本轮未重复宣称执行这些测试。

## 当时待执行的事项（现由 Preview 52 完成）

尚未安装 51、迁移生产数据库或部署正式后端。完整生效需要共同发布已审查的迁移 `20260912010000_persistent_intentions`、对应后端和新版 Preview。迁移会将仍未过期的活动/暂停意愿改为无期限，不恢复历史结束/过期记录。旧 iOS 客户端的意愿接口会要求更新。

依据 [RELEASE.md](../RELEASE.md) 第 1 节，正式后端和共享数据库变更需要本次操作的明确授权；此前的手机 Preview 安装授权已具备，不需重复申请。获得后端/迁移授权后，先刷新迁移影响与恢复点，再执行完整发布和真机验证。
