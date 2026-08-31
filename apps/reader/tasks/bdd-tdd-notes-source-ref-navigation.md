# BDD/TDD：Notes 卡片 sourceRefs 回跳原文

## 背景

PRD 要求 VibeCard、AI 回答、Summary、Attention insight 都能回跳原文。当前 PDF selection Lens Card 已经携带 `source.rect/rects`，但 Explain Card / Concept Card 等常见卡片经常只有 `currentContent.sourceRefs`。如果 Notes 的“回到原文”只读取 `artifact.source` 或 `content.source`，这些卡片虽然显示了来源页码，却无法真正跳回段落。

本切片只补 App 层回源分发，不新增第二套卡片系统。

## 行为 1：sourceRefs-only 卡片可以回跳段落

Given 用户基于带来源引用的 AI 回答保存一张 Explain Card
And 该卡片只有 `currentContent.sourceRefs`，没有顶层 `source`
When 用户在 Notes 中点击“回到原文”
Then App 应发出 `vibereader:navigate-paragraph` 事件
And 事件 detail 包含 `documentId`、`page`、`paragraphId` 和来源文本
And 不应退化成“这张卡片没有可回跳的来源”

业务规则：只要卡片有可点击 source ref，就必须能回到对应段落；不能要求所有卡片都保存 PDF rect。

## 行为 2：PDF selection source 继续走 source-span 回跳

Given Lens Card 带有 `sourceType: pdf-selection` 和 PDF 选区坐标
When 用户点击“回到原文”
Then App 继续发出 `vibereader:navigate-source-span`
And 不改变现有 PDF 高亮回跳路径

业务规则：段落 sourceRefs 是补充 fallback，不替换已有 selection rect 回跳。

## 边界

- 多个 sourceRefs 时先跳第一个来源，后续可以再做每个来源单独按钮。
- 缺少 `paragraphId` 但有 `page/rect` 的来源仍走 source-span。
- 完全没有来源的卡片保留现有警告。
