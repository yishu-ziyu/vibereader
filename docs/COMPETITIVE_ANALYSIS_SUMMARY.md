# 竞品分析摘要

更新时间：2026-07-01

## 结论

第一轮竞品分析支持当前方向：

> VibeReader 应坚持 Reader-first + Local Knowledge Flywheel，而不是变成 ChatPDF、通用 RAG 控制台、Zotero 替代品或 Obsidian 克隆。

## 官方资料来源

- NotebookLM: https://notebooklm.google/
- NotebookLM Help: https://support.google.com/notebooklm/
- Zotero: https://www.zotero.org/
- Zotero Documentation: https://www.zotero.org/support/
- Readwise Reader: https://readwise.io/read
- Readwise Docs: https://docs.readwise.io/readwise/docs/reader
- ChatPDF: https://www.chatpdf.com/
- Obsidian: https://obsidian.md/
- Obsidian Help: https://help.obsidian.md/
- AnythingLLM: https://anythingllm.com/
- AnythingLLM Docs: https://docs.anythingllm.com/

## 关键判断

### NotebookLM

验证了 source-grounded AI 和学习型 artifact 的价值，但它不是本地 Reader-first 产品。

我们应该学习：

- source set 清晰。
- AI 产物可追溯。
- 学习材料生成。

不应该复制：

- 云端 notebook 心智。
- AI 输出盖过阅读现场。

### Zotero

验证了文献管理、PDF annotation、citation metadata 的长期价值。

我们应该学习：

- source identity 很严肃。
- citation/export 不能随便做。

不应该复制：

- 变成 Zotero 替代品。
- 在第一阶段做完整文献管理。

### Readwise Reader

最接近我们的行为 loop：阅读、highlight、保存、复用。

我们应该学习：

- Reader-first。
- 用户确认内容比 AI 自动生成内容更适合进入长期记忆。
- 高亮和复习机制是飞轮的一部分。

不应该复制：

- 先做 read-it-later inbox。
- 默认依赖 hosted sync。

### ChatPDF / PDF Chat 产品

验证了低门槛 first-run 和 citation 可见性的必要性。

我们应该学习：

- 打开文件后马上能问。
- 引用必须可见。
- 第一次使用必须非常快。

不应该复制：

- 一次性问答心智。
- 聊天压倒阅读。

### Obsidian

验证了 local-first、Markdown、用户拥有知识的长期价值。

我们应该学习：

- 本地文件和可导出格式让用户信任。
- 笔记应该能长期存在。

不应该复制：

- 变成通用笔记软件。
- 让用户自己拼插件工作流。

### AnythingLLM / 本地 RAG 产品

验证了 local/private RAG 和模型灵活性的价值。

我们应该学习：

- 本地 RAG engine 是可行产品能力。
- provider 配置和 health check 是产品体验的一部分。

不应该复制：

- 把 RAG 管理台暴露成主界面。
- 让技术配置成为阅读入口。

## 路线图影响

### P0

1. 建立 `RagEngineAdapter` seam。
2. 保留 `LocalKeywordRagAdapter` fallback。
3. 接 `UniRagHttpAdapter` health + query。
4. 做 citation rendering 和 mapping status。
5. 让第一次文档 Q&A 接近 ChatPDF 的低摩擦。
6. 保存 note/card 时保留 source provenance。

### P1

1. page-level citation jump。
2. document identity 和重复文件处理。
3. 用户确认的 note/card/highlight 进入 UniRAG。
4. Obsidian-compatible Markdown export。
5. 模型配置稳定化。

### P2

1. Knowledge Library。
2. 跨文档检索。
3. NotebookLM/Readwise 风格学习产物。
4. Zotero import/export。
5. 桌面 sidecar。

## 需要确认的产品取舍

1. 是否继续坚持 Reader-first。
2. 是否把 `RagEngineAdapter + citation rendering` 作为立即工程 P0。
3. 是否把 Readwise Reader 和 ChatPDF 作为 UX 参考，而不是产品形态参考。
4. 是否把 Zotero 和 Obsidian 作为 integration/export 参考，而不是替代目标。
