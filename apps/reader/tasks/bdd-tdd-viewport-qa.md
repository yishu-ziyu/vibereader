# BDD/TDD：Web 阅读工作台 viewport QA

## 背景

Phase 11 要求 Web 端先成为真实可用产品。阅读工作台不能只在大屏正常；在 1024px 窄屏、820px 平板宽度、浏览器缩放等常见演示环境下，Reader、Skim Map、Notes/Chat 都必须仍然可见、可滚动，不能互相挤压或裁切。

本切片只做布局契约和必要 CSS 修复，不改产品信息架构。

## 行为 1：1024px 窄屏不挤压右侧 Notes

Given 用户在 1024x768 的浏览器打开 VibeReader
When 工作台完成加载
Then Reader 区和 AI/Notes 区都应有可用宽度
And 页面不应产生横向 body overflow
And pane 之间不能发生矩形重叠

业务规则：1024px 是常见演示/投屏宽度，右侧 Notes 不能被阅读区最小宽度挤没。

## 行为 2：820px 平板宽度改为上下布局

Given 用户在 820x1180 的浏览器打开 VibeReader
When 工作台完成加载
Then 阅读 surface 应在 AI/Notes pane 上方
And Reader、Skim Map、AI/Notes 都保持可见
And 页面主体不横向溢出

业务规则：窄屏时允许上下布局，但不能隐藏阅读或笔记入口。

## 行为 3：浏览器缩放后关键 pane 不裁切

Given 用户在 1024px 宽度并模拟较大缩放查看页面
When 工作台完成加载
Then layout 应落入窄屏保护规则
And Notes/Chat pane 至少保留可交互区域
And tabs/header 文本不能把页面撑出横向滚动

业务规则：演示时用户经常使用浏览器缩放，工作台应该优先可用而不是坚持桌面三栏。
