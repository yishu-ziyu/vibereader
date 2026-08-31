# Phase 41：VibeCard Source Return Hardening

## 背景

PM 手动验收 `Create VibeCard` 时发现，点击卡片上的 `回到原文` 没有明显反应。上一轮已修复 Markdown/Text/HTML 阅读器消费 `vibereader:navigate-paragraph` 事件的问题。本轮继续硬化卡片端体验，让用户能明确判断每张卡片会回到哪个来源位置。

## BDD 行为

### 行为 1：生成卡片后能看到来源位置

Given 我打开 Markdown 测试文档并运行 `Create VibeCard`
When Notes / VibeCards 区展示生成的卡片
Then 每张卡片应显示来源标签，例如 `P1 · chunk-3`

业务规则：卡片必须带来源，产品经理验收时能看见它绑定到哪段原文。

### 行为 2：点击回到原文时应指向具体来源

Given 我看到一张带来源的 VibeCard
When 我聚焦或点击 `回到原文`
Then 该按钮应暴露具体来源名称，例如 `回到原文 P1 · chunk-3`

业务规则：用户不是只点击一个泛化动作，而是能判断要回到哪一个原文位置。

### 行为 3：阅读器收到来源后应滚动并高亮

Given 当前阅读器打开的是 Markdown/Text/HTML 文档
When 系统收到 `vibereader:navigate-paragraph`，且 detail 里包含当前文档的 `paragraphId`
Then 阅读区应滚动到对应段落，并短暂高亮该段落

业务规则：卡片来源必须形成可见的阅读动作。

### 行为 4：来源缺失时不能静默失败

Given 一张卡片没有可定位来源或来源段落不存在
When 我点击 `回到原文`
Then 系统应给出明确提示

业务规则：失败也要让用户知道原因，不能表现为按钮坏了。

## TDD 映射

- `src/ArtifactPanel.test.jsx`：覆盖 agent-generated VibeCard 的来源标签、带来源的 `回到原文` 按钮名，以及点击按钮调用导航回调。
- `src/DocumentReader.test.jsx`：覆盖 readable document 收到 `vibereader:navigate-paragraph` 后滚动到 `chunk-*` 段落并高亮。

## 边界

- 本轮不改变 Create VibeCard 的生成算法。
- 本轮不改变 PDF 回源逻辑。
- 本轮不新增云模型或 Agent planner。
- Markdown/Text/HTML 的 `chunk-*` 合同仍按空行切分，后续 Rust chunker 接入时需要继续保持 ID 对齐。
