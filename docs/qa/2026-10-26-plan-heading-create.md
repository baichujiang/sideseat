# 计划内容标题与发起入口验收（Preview233）

「需要你处理」改为「计划安排」，避免与「筹划中」重复。发起入口由底部移到内容标题右侧，逐项沿用同行「添加」的软底胶囊、字体、颜色和44pt命中区；辅助功能大字号时同样改为标题下方满宽按钮。已确定分栏也保留入口，历史页无创建入口。标题位于加载／失败／空记录内容之前；删除底部占位并用共用浮动Tab尾部留白。

保留原计数含义、纵向当前操作／横向等待区、分栏、创建与取消回调、记录、邀请和日历规则。仅一个原视图、三个翻译项和Preview版本变更；删去失去用途的一层VStack，没有新组件、状态、接口或业务分支。独立只读最简审查无阻断发现。

## 实际执行

- 默认实体iPhone14Plus（iOS26.6.1），最终233包，两项UI测试一次通过，**146.517秒，2通过，0失败／跳过**。标题矩阵108.559秒，空／失败入口37.958秒。[结果](./evidence/2026-10-26-plan-heading-create233/test-summary.json)
- 中文浅／深普通字号、德文浅／深系统最大AXXXL：筹划／确定两栏标题和创建位置、44pt及窗口边界、文字；普通并排／最大纵排、等待横轨／最大纵排、内容滚动移出与恢复。
- 创建页打开和取消：跨两分栏及两语言；未填写或提交。历史进入／返回且原分栏保持。PlansStore空／失败时仍可创建。
- 既有两份UI测试的视口基准由旧底部创建按钮改为浮动Tab上方；删除旧固定创建位置断言。三份Swift语法检查、翻译语法与diff检查通过；旧两大矩阵本轮未重跑。
- **11张／11种原始截图全部实际查看并保存**，新标题与创建按钮无重叠、越界或文字裁切。[逐图记录](./evidence/2026-10-26-plan-heading-create233/images.json)

这些UI夹具仅提供内存私聊计划，协调接口故意指向localhost:9；红色网络错误是受控条件，空记录图不是成功联网的全页空态验收。德文最大字号旧卡片只露出局部，AssistiveTouch局部遮住旧「查看全部」，均不扩大为整卡／全App最大字号通过。本轮不重跑真实邀请到日历、网页、APNs、Apple Calendar、领域或单元测试；此前232完整业务验收另见[原记录](./2026-10-26-plan-direct-invite.md)。

## 来源、手机与收尾

268项App／配置／工程／共享资源冻结输入与活跃来源一致，较上一提交仅5项改变、263项保留；唯一Local配置字节一致。严格签名和可执行文件／debug dylib hash核验。[来源](./evidence/2026-10-26-plan-heading-create233/source-binary-provenance.json)

默认手机已安装233，移除自有Flow233Runner后空参数、仅TERM环境普通启动 **PID10805**，实际进程一致；普通97与既有Runner保留。按系统报告相对路径＋修改时间比较，新增SideSeat报告0。QA使用ephemeral凭据，未读取普通账号身份；无QA账号／计划创建或删除。[手机核验](./evidence/2026-10-26-plan-heading-create233/device-verification.json)

本轮无后端／网页／Schema发布。api／www／根域只读重查均Ready `dpl_8zqCd2KWQVtuaytvqu89hCaYM9d5`；公开client-config可达、maintenance=false，公开gate与逐账户assignment区分。[部署](./evidence/2026-10-26-plan-heading-create233/production-readonly.json)、[公开开关](./evidence/2026-10-26-plan-heading-create233/public-flags.json)

自有来源上下文、Runner工程／构建、私密设备JSON／配置已清理（3个自有上下文、14份顶层私密JSON／配置）；共享构建／SPM、活跃Local与既有Simulator保留。原始结果与截图按0700／0600私密保留；仅假数据图片和精简证据进入Git。
