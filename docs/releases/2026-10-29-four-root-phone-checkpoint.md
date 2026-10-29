# 四入口真机补验检查点（未完成）

状态：**IN PROGRESS，非最终交付。** 当前仅记录已接受的独立范围与剩余工作，不代表四入口全部通过。[当前QA报告](../qa/2026-10-29-four-root-phone-supplement.md)与[净化证据索引](../qa/evidence/2026-10-29-four-root-phone/summary-index.json)持续保留各自范围，旧失败不改写为通过。

原生继续使用Preview260，App源码 `9c501d8a9609adbc8929a06730a743716374fa49` 与268项冻结输入、Local保持匹配。此前安装保留，本轮已反复读回默认iPhone14Plus的安装Info260及普通97；本轮没有重建或重新安装App，私有QA Runner构建不属于App更新。**本轮最终普通Preview启动尚未进行。** 未读取普通账号身份或重置AppData／Keychain。

## 当前接受范围

| 范围 | 当前结论 |
| --- | --- |
| 同行 | Root接受9个独立真机案例／78阶段；使用真实隔离API／DB，前置与UI业务分开记录，不称一次连续套件。Explore6份附件仅5份安全画面纳审，1份受通知影响的画面排除，不作页头像素通过声明。 |
| 计划 | 保留此前4个真机案例／47阶段及11项Mac网页检查；15个相关文件未变。保留原Preview238范围，不称本轮260重跑。 |
| 日历核心 | Root接受8个独立案例／81阶段。Share保留原controller的false及独立公开清理限定补证；Transfer保留旧失败和诊断链，最终独立实际文件往返才计通过。 |
| 日历媒体 | 图片9、语音10均未通过，整体Calendar仍未接受。图片的自动系统选择器定位失败；语音进入Listening并完成受控播放，但未识别固定完整语句。失败轮次清理按原报告保留，尚未建立App问题。 |
| 我页与头像 | 核心69＋额外40，共109阶段，以及独立真实头像7阶段均尚未运行本轮补验。静态READY及已上线后端不代替真机UI通过。 |

正在准备辅助图片案例：仅由人工选择本轮自有合成图，随后仍须经过真实Vision识别及精确已知内容匹配，才可解析、截图或保存。该辅助案例**尚未执行**；即使后续通过，也不能回溯认定自动picker通过。语音仍需要手机摆位配合，图片需要本轮素材选择配合。

日历核心的外部Apple Calendar范围仅为订阅编辑器取消；真实Files往返仅覆盖一个自有非重复事件；重复日程核对限四个连续Berlin日期。生产GET边界不是字面HTTP总次数，也不作SQL验证声明。各项详细边界见QA报告。

## 已上线头像后端与尚待UI验证

后端源码 `d2f94a7f6db06fccfee766ea99f456c241c6d8b9`、`fe02e127a3d95b66178e9482a53b6ea647eb39b6` 已提交、推送并由Root实际提升至生产 `dpl_78FQQyqiDPP7gxqNsbnn3moi9KW6`。两项修复分别处理头像事务失败后的自有对象清理，以及成功响应完整返回原语言／熟练度与readiness。

本轮在 `2026-10-28T22:04:29Z` 的实际生产来源核验确认api／www／根域名均指向该READY部署，1,399项远端源匹配，保留1,397项基线，仅覆盖头像route并新增来源标记，无Schema变更。这里引用已完成的核验，不声称本检查点另做了fresh网络核验。既有9项针对性route测试、lint及全量TypeScript检查通过；真实图片上传与即时语言保留UI仍待验收。

## 安全摘要指纹

公开摘要仅包含固定安全事实、计数、范围与指纹；不复制私密运行源、凭据、原始日志、系统标签或截图。

| 记录 | SHA256 |
| --- | --- |
| [当前净化索引](../qa/evidence/2026-10-29-four-root-phone/summary-index.json) | `edbaa345e3bccada00b98cc412eddba691b7b564c8e88bc6cdf01cad789d85f9` |
| [同行净化摘要](../qa/evidence/2026-10-29-four-root-phone/together-current-physical-summary.json) | `aabbad72ee88ddec66e1787ea0e795e80195ee7f2d35ba1a27d1f61d2b013afe` |
| [日历核心净化摘要](../qa/evidence/2026-10-29-four-root-phone/calendar-core-current-physical-summary.json) | `ecb856166f39523f83a1201391fc76eb6f7f0ee822dcbe7c617166d2be420bc4` |
| 实际生产来源核验 | `67b1383a65638a89b7f42933705c799bd7582461280edd4e79a017870e3bc246` |

剩余媒体、我页与头像须分别完成真实业务、精确清理和独立复核，再由Root形成页面接受记录并完成最终普通Preview启动。本检查点不增加未执行范围的验收结论，也不替代此前各轮发布记录。
