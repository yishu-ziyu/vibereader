# Selected VibeCard Export BDD

## Goal

推进 Notes / Export P1：支持只导出用户选中的 VibeCards，避免整篇文档全部产物混在一个导出文件里。

## Behaviors

### Behavior 1: 只导出选中的 VibeCards

Given Notes 面板里有多张 VibeCard
When 用户只选中其中一张并生成 selected-card Markdown 预览
Then 导出内容只包含被选中的卡片
And 未选中的卡片内容不应出现在预览里

业务规则：用户读完一篇文档后，经常只需要导出少量高价值卡片，而不是整篇阅读包。

### Behavior 2: 选中卡片导出保留来源

Given 被选中的 VibeCard 带有 source refs 或 page / paragraphId
When 用户导出选中卡片
Then Markdown 应包含来源页码和 paragraph id

业务规则：VibeReader 的导出必须继续保持 source-grounded，不能导出脱离原文位置的卡片。

### Behavior 3: 没有选中卡片时不生成空导出

Given Notes 面板里有卡片但用户没有勾选任何卡片
When 用户点击 selected-card export
Then 应显示明确提示
And 不应生成误导性的空 Markdown。

业务规则：空导出通常是误操作，应要求用户先明确选择要导出的阅读资产。

## Boundary Conditions

- 本切片只做 Markdown selected-card export，不做模板系统。
- 全文 Reading Note 导出仍保留现有 Rust-backed `exportPersistentReadingNote(documentId)`。
- 选中卡片导出先在前端生成，后续可迁移到 Rust export service。
