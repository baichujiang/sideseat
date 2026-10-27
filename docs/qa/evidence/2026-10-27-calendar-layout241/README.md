# Calendar layout241 证据

来源 `b6825f42`。本目录只证明Simulator布局专项，日历页面完整业务及Phone验收尚未完成。

- 四组合：中文浅色普通、德文深色普通、中文深色最大、德文浅色最大；同一次UI测试601.374秒通过。
- 独立德文最大原生菜单：64.342秒通过，展开选项完整、外点关闭且选值保持。
- 两次最终运行35 captures／30 global unique全部实际查看，隐私排除0；本目录16张PNG为安全原图，字节未编辑。
- 全部为离线fakeauth／ephemeral／loopback9 fixture，仅打开及取消；没有发送、保存、API业务或Phone交互。

[测试摘要](./test-summary.json) · [逐图与范围](./images.json) · [来源核对](./source-binary-provenance.json) · [线上只读核对](./production-readonly.json)

| 视口 | 原图 |
|---|---|
| 中文普通详情 | [详情](./zh-ordinary-personal-detail.png) |
| 德文普通详情 | [详情](./de-ordinary-personal-detail.png) |
| 中文最大详情／结束时段 | [详情](./zh-max-personal-detail.png)、[结束](./zh-max-ends-detail.png) |
| 德文最大详情／结束时段 | [详情](./de-max-personal-detail.png)、[结束](./de-max-ends-detail.png) |
| 中文最大日期控件 | [开始](./zh-max-start-picker.png)、[结束](./zh-max-end-picker.png)、[重复截止](./zh-max-repeat-until.png) |
| 德文最大日期控件 | [开始](./de-max-start-picker.png)、[结束](./de-max-end-picker.png)、[重复截止](./de-max-repeat-until.png) |
| 计划只读管理入口 | [仅显露，未点击](./de-max-readonly-plan-manage.png) |
| 未发送的个人分享预览 | [预览后取消](./zh-ordinary-unsent-share.png) |
| 德文最大重复结束菜单 | [展开完整选项](./de-max-repeat-ending-expanded.png)、[关闭后原值](./de-max-repeat-ending-collapsed-unchanged.png) |

最大日期控件分图滚动验证，不称一张截图展示全表单。德文收起的原生菜单值中间省略，展开可完整读到；单行名称输入框省略／横向滚动按实际视口保留。只在同一Editor实例比较原生月／日／分钟；动态搜索fixture不作持久化验收。源码44逻辑点不等于原生sheet的AX屏幕框；旧中文普通八点采样不证明连续44屏幕点或其他设备命中区。

旧238／239／240失败、单最大字预备诊断、凭据、原始日志和运行封装未复制到本目录。包含普通用户信息、认证或系统桌面的图片不进入公开证据；最终本组没有此类图片。
