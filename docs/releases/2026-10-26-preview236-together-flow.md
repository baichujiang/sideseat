# Preview236：同行闭环与弹窗字号修复

五个导航按同行、计划、日历、消息、我逐页验收。本阶段仅同行已完整通过；其余四页继续顺序执行。[验收记录](../qa/2026-10-26-five-root-flows.md)

源码与相关测试、证据已提交并推送 `c7572a581f8bbdb33310c2aadceeb4b120d24574`。修复中文通用错误、学校认证旧说明及共用弹窗图标固定22pt导致最大字号侵入文字。图标改用实际尺寸，无新增状态、组件或API；重试、幂等、回调及业务规则不变。独立最简只读复核通过。

最终同一App236的7次分开运行全部通过：10项UI测试、49个独立数据库检查点；并非一次连续套件。认证后真实业务在专属本地API／DB及Simulator执行，所有业务写入由原生UI完成；仅本地认证与英语为前提。默认实体iPhone14Plus生产未认证入口68.533秒通过，独立Mac前后资料不变、业务计数0。普通中文／德语系统最大字号fixture62.976／104.291秒通过；67次capture／59种唯一图全部实际复核，采用15张安全原图。最大删除图已确认trash保留且文字间距正常，其他部分视口不扩大为完整卡片或全App最大字号声明。

默认手机安装236，严格签名、268项来源、唯一Local及构建二进制hash核验；Simulator实际安装双二进制与产品匹配。正常启动PID10918，空参数／仅TERM环境及实际进程核对。普通97／既有Runner保留，自有Runner移除，按报告路径＋lastModDate比较新增SideSeat报告0，未检查普通账号身份。

本阶段13组自有账号共26个删除、26个旧bearer401，手机QA凭据封装已移除。原始结果按0700／0600私密保存，构建与服务上下文暂留支持后四页，整体收尾后清理；活跃Local、共享依赖／构建与原有Simulator保持。原有tsconfig工作及开发服务生成的next-env不纳入提交，服务停止后恢复任务前字节。

无后端、网页、Schema、AppStore或TestFlight发布。api／www／根域只读核对均为READY production `dpl_8zqCd2KWQVtuaytvqu89hCaYM9d5`。[部署核对](../qa/evidence/2026-10-26-five-root-together236/production-readonly.json)

[测试结果](../qa/evidence/2026-10-26-five-root-together236/test-summary.json)、[逐图范围](../qa/evidence/2026-10-26-five-root-together236/images.json)、[来源匹配](../qa/evidence/2026-10-26-five-root-together236/source-binary-provenance.json)、[手机核验](../qa/evidence/2026-10-26-five-root-together236/device-verification.json)、[隐私扫描](../qa/evidence/2026-10-26-five-root-together236/privacy-scan.json)。
