# Reader ↔ UniRAG Memory / Citation Contract

`contract_version = "reader-unirag-memory-v1"`

本目录是 Reader 与 UniRAG 之间关于「保存的 artifact / 记忆」与「带记忆检索的引用返回」的共享 fixtures 集合，被两侧（`vibereader` 前端 / `services/uni-rag` 后端）的测试引用，用于校验两端契约一致。

## 1. 字段约定

### 1.1 Reader → UniRAG（请求侧，camelCase）

Reader 通过 `POST /api/memory/jobs` 将保存的 artifact 推送给 UniRAG 索引为 memory。请求 body 顶层为 `{"memory": {...}}`，memory 对象核心字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `source` | string | 固定 `"vibereader"`，标识来源端 |
| `kind` | string | 固定 `"saved_artifact"`，标识这是保存的 artifact |
| `artifactId` | string | Reader 内部 artifact 唯一 ID（如 `art-explain-001`） |
| `artifactType` | string | artifact 类型，见 §2 |
| `title` | string | 展示标题 |
| `document` | object | 关联文档 `{id, name, kind, fingerprint}` |
| `verificationStatus` | string | `"grounded"` / `"ungrounded"`，是否已对照原文 |
| `sourceRefs` | array | 命中的源引用列表，见下 |
| `content` | object | 结构化内容，含 `question/answer/summary/explanation/body/userNote/keyPoints/claims` |
| `text` | string | 拼接好的 Markdown 文本（memory 主索引文本） |
| `createdAt` | number | 创建时间（秒级 unix 时间戳） |
| `savedAt` | number | 保存时间（秒级 unix 时间戳） |
| `contractVersion` | string | 固定 `"reader-unirag-memory-v1"` |

`sourceRefs[i]` 字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `documentId` | string | 文档 ID |
| `documentName` | string | 文档名 |
| `page` | number | 页码（从 1 开始） |
| `paragraphId` | string | 段落 ID（可选） |
| `chunkId` | string | chunk ID |
| `label` | string | 展示标签（如 `P1`） |
| `text` | string | 命中原文片段 |
| `grounding` | object | `{precision, matchedBy, score}` 定位精度与匹配信息 |

### 1.2 UniRAG → Reader（响应侧，snake_case）

UniRAG 在 `POST /api/query` 且 `include_memory=true` 时，于 `citations` 数组中返回两类条目：

- **chunk citation**：来自原文 chunk，字段 `chunk_id/source/section/page/text/span/verified/similarity`。
- **saved_memory citation**：来自已索引的 Reader artifact，额外字段 `source_type="saved_memory"`、`artifact_id`、`artifact_type`、`memory_id`、`title`、`source_refs`（snake_case 下仍保留 camelCase 的 source_refs 内部字段，便于 Reader 直接还原）、`contract_version`。

## 2. artifactType 分歧记录（本期不收束）

Reader 当前实际发出的 `artifactType` 取值：

- `explain_card`
- `lens_card`
- `evidence_card`
- `concept_card`
- `concept`
- `reading_note`

Contract 文档（早期草案）建议的取值：

- `answer`
- `card`
- `note`
- `highlight`
- `summary`
- `qa`

**本期决策**：不收束。Reader 继续发送实际取值，UniRAG 以字符串透传，不做枚举强校验。两侧测试均覆盖实际取值。待下一期（v2）统一。

## 3. 兼容性策略

- `contractVersion` / `contract_version` 字段为**可选**。旧端不识别该字段时，默认按 `reader-unirag-memory-v1` 语义处理。
- 两侧均不得因字段缺失而报错。
- 未来若引入 v2，将通过该字段显式区分；缺省视为 v1。

## 4. Fixtures 清单

| 文件 | 用途 | 类型 |
| --- | --- | --- |
| `saved-answer-card.json` | Reader → UniRAG `POST /api/memory/jobs` body，`explain_card` | camelCase 请求 |
| `reading-card.json` | Reader → UniRAG `POST /api/memory/jobs` body，`concept_card` | camelCase 请求 |
| `note.json` | Reader → UniRAG `POST /api/memory/jobs` body，`reading_note`（ungrounded，空 sourceRefs） | camelCase 请求 |
| `highlight.json` | Reader → UniRAG `POST /api/memory/jobs` body，`lens_card` | camelCase 请求 |
| `query-response-with-saved-memory.json` | UniRAG → Reader `POST /api/query` `include_memory=true` 响应，含 chunk + saved_memory 两类 citation | snake_case 响应 |
| `citation-unresolved.json` | 单个 saved_memory citation，`artifact_id` 不存在，用于测试降级 | snake_case 响应片段 |

## 5. 版本

- `contract_version`: `reader-unirag-memory-v1`
- 本期：v1，不收束 artifactType。
