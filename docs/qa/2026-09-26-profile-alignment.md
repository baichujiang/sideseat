# 个人资料编辑对齐

2026-09-26，开发版；未发布 TestFlight。

文本输入、下拉选项及学期数字统一在内容列左对齐，下拉箭头和学期加减按钮留在右侧。正常字号保留固定宽度标题列；辅助大字体保留上下排列、统一左对齐。

只修改 ProfileEditSheet.swift。已有两项 UI 回归通过：中文输入行、键盘前后切换与保存；德语深色最大字号、输入纠错及保存。结果包 `/tmp/sideseat-profile-alignment.xcresult`，2 项通过，0 失败；已查看截图确认内容列一致。

[中文编辑页](evidence/2026-09-26-profile-alignment/editor-zh.png) · [德语大字体](evidence/2026-09-26-profile-alignment/editor-de-dark-large.png)
