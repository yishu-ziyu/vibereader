# Phase 5 BDD/TDD：Markdown/Text/HTML 通用阅读

最后更新：2026-05-23

## 行为规格

### 行为 1：Markdown 文件进入阅读器

Given 用户打开一个 `.md` 或 `.markdown` 文件
When 文档服务读取该文件
Then 左侧阅读器应显示 Markdown 渲染结果，并把该文档设为当前活动文档

业务规则：VibeReader 不能只读 PDF，Markdown 是“通用阅读器”愿景的最低成本证明。

### 行为 2：Text 文件进入阅读器

Given 用户打开一个 `.txt` 文件
When 文档服务读取该文件
Then 左侧阅读器应以保留换行的纯文本模式显示内容

业务规则：纯文本是网页摘录、笔记、转写稿和临时资料的基础格式。

### 行为 3：HTML 文件安全读取

Given 用户打开一个 `.html` 或 `.htm` 文件
When 文档服务读取该文件
Then 阅读器只显示提取后的正文文本，不执行 `<script>`、内联事件或样式脚本

业务规则：Tauri 本地文件能力扩大后，HTML 必须默认按不可信内容处理。

### 行为 4：非 PDF 文档选区注入 AI

Given 阅读器中已有 Markdown/Text/HTML 文档
When 用户选中一段正文并点击注入按钮
Then 右侧 Chat 应收到带文档上下文前缀的用户消息

业务规则：所有阅读格式都必须接入“左读右问”的核心闭环。

## 边界条件

- 第一版不做 EPUB、Word、PPT。
- HTML 第一版不保留原始复杂布局，只保留安全正文。
- Summary/Flashcard/MindMap 仍主要复用现有文本上下文能力，不在本阶段重构为通用 document context store。

## 自动化测试映射

- `src/services/documentService.test.js`
  - HTML 安全正文提取。
  - File 文档读取到 `contentText`。
- `src/DocumentReader.test.jsx`
  - Markdown/Text 文档可渲染。
  - 选区注入回调可用。
