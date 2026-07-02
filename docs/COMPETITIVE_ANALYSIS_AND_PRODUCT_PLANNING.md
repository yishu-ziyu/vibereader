# 竞品分析与产品规划流程

更新时间：2026-07-01

## 1. 原则

竞品分析不是为了列竞品，也不是为了复制功能。

它服务于三个决策：

1. 用户为什么需要我们。
2. 我们和已有产品差在哪里。
3. 下一阶段应该做什么、不做什么。

所有竞品分析必须回到产品规划和工程优先级。

## 2. yishuship 流程位置

竞品分析属于 yishuship PM 生命周期：

```text
Product Type
-> Strategy and Market
-> Research and Current State
-> Problem and Solution
-> Product Blueprint
-> PRD
-> Technical and Project Plan
-> Engineering Handoff
```

对应产物：

- `product/01-strategy.md`
- `product/02-research.md`
- `product/03-problem-solution.md`
- `product/04-product-blueprint.md`
- `product/08-prd.md`
- `product/09-tech-project-plan.md`

如果竞品分析导致方向变化，必须补 DEC。

## 3. 竞品分层

本项目竞品不只是一类。

### 3.1 Reader 类

用户心智：

- 我想读得更好。
- 我想划线、笔记、回看。
- 我想保持注意力。

候选：

- PDF 阅读器。
- Zotero 类文献工具。
- Readwise Reader 类稍后读工具。
- 浏览器阅读增强工具。

### 3.2 Chat With Document 类

用户心智：

- 我想快速问文档。
- 我想总结、解释、抽取。

候选：

- ChatPDF。
- Acrobat AI Assistant。
- NotebookLM。
- 各类 AI PDF assistant。

### 3.3 Knowledge Base / RAG 类

用户心智：

- 我想把资料放进知识库。
- 我想跨文档检索和追问。

候选：

- NotebookLM。
- AnythingLLM。
- Dify knowledge base。
- Obsidian + RAG 插件。
- 本地 RAG 项目。

### 3.4 Learning / Memory 类

用户心智：

- 我想记住。
- 我想复习。
- 我想把阅读变成卡片。

候选：

- Readwise。
- Anki。
- RemNote。
- Heptabase。
- Logseq/Obsidian workflows。

## 4. 分析维度

每个竞品必须按同一张表分析：

```markdown
## Product

## Target User

## Core Job

## First-Run Experience

## Reading Experience

## AI / RAG Capability

## Citation And Evidence

## Knowledge Retention

## Privacy And Local-First

## Model Flexibility

## Pricing / Packaging

## Strengths

## Weaknesses

## What We Should Learn

## What We Should Avoid

## Implication For VibeReader
```

## 5. 证据要求

竞品分析必须尽量使用当前证据。

可接受证据：

- 官方网站。
- 官方文档。
- 产品截图。
- 实际试用。
- 价格页。
- changelog。
- 用户评价作为辅助。

不接受：

- 凭印象判断。
- 只看二手总结。
- 不标明日期的旧信息。

因为竞品信息会变，正式分析时必须使用浏览器或网页检索确认。

## 6. 输出格式

竞品分析输出三层：

### 6.1 Matrix

横向对比核心维度：

- 阅读体验。
- AI 问答。
- 引用可靠性。
- 长期知识沉淀。
- 本地/隐私。
- 模型灵活性。
- 学习闭环。

### 6.2 Product Lessons

每个竞品提炼：

- 值得学习的体验。
- 不适合我们的方向。
- 对当前 roadmap 的影响。

### 6.3 Planning Decision

必须落到路线图：

- P0 必做。
- P1 可做。
- P2 暂缓。
- 明确不做。

## 7. 第一轮竞品分析目标

第一轮不追求覆盖所有产品，而是验证定位。

目标：

> 判断 VibeReader Knowledge Workbench 是否应该坚持 Reader-first + Local Knowledge Flywheel，而不是转成 ChatPDF、普通 RAG 知识库或笔记软件。

第一轮建议分析：

- NotebookLM。
- Zotero。
- Readwise Reader。
- ChatPDF 或同类 PDF chat 产品。
- Obsidian + AI/RAG 工作流。
- AnythingLLM 或本地 RAG 产品。

## 8. 第一轮产物

应该写入：

```text
.ship/tasks/20260701-vibereader-knowledge-flywheel/product/02a-competitive-analysis.md
```

同时同步摘要到：

```text
docs/COMPETITIVE_ANALYSIS_SUMMARY.md
```

## 9. 产品规划转化规则

竞品分析完成后，必须更新：

- `product/01-strategy.md`
- `product/02-research.md`
- `product/04-product-blueprint.md`
- `product/08-prd.md`
- `docs/PROJECT_DEVELOPMENT_PLAN.md`

如果出现重大取舍，新增：

```text
docs/decisions/DEC-NNNN-*.md
```

## 10. 阶段确认点

需要和用户确认：

- 第一轮竞品名单。
- 我们是否坚持 Reader-first。
- 哪些体验必须学习。
- 哪些方向明确不做。
- P0/P1/P2 取舍。

不需要等用户确认：

- 建分析模板。
- 收集官方来源。
- 整理事实表。
- 把已确认结论回写到 yishuship。
