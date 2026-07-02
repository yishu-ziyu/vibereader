# UniRAG 集成策略

更新时间：2026-07-01

## 1. 结论

UniRAG 应作为 VibeReader 背后的 Knowledge Module 接入，而不是把两个前端合并。

第一阶段目标是通过一个小而深的 `RagEngineAdapter` Interface 完成能力接入：

```text
VibeReader UI -> RagEngineAdapter -> LocalKeywordRagAdapter
                                -> UniRagHttpAdapter -> UniRAG FastAPI
```

这样做的好处：

- VibeReader 保持 Reader-first 产品体验。
- UniRAG 专注解析、索引、检索、引用式回答。
- 失败时可回退到本地关键词检索。
- 后续可以替换 UniRAG 实现，而不重写 Reader 调用方。

## 2. 不做什么

第一阶段明确不做：

- 不把 Reader 和 UniRAG 的 Git 历史强行 flatten。
- 不合并两个前端。
- 不统一数据库。
- 不把 Python/RAG/Chroma 直接打包进 Tauri。
- 不删除 VibeReader 现有 retrieval 逻辑。
- 不把 AI 生成内容无标记地写成原文证据。

## 3. 集成顺序

### Step 1：健康检查

VibeReader 先能判断 UniRAG 是否可用。

建议 Interface：

```ts
type RagEngineHealth = {
  available: boolean;
  engine: "local-keyword" | "uni-rag";
  baseUrl?: string;
  error?: string;
};
```

验收：

- UniRAG 未启动时，Reader 显示 fallback。
- UniRAG 启动时，Reader 显示可用。

### Step 2：文档身份映射

建立 `DocumentIdentity`，避免 citation 无法跳回 Reader。

```ts
type DocumentIdentity = {
  vibeDocumentId: string;
  filePath?: string;
  fileHash?: string;
  originalFilename: string;
  uniRagSourceId?: string;
  createdAt: string;
  updatedAt: string;
};
```

最低要求：

- 同一路径同一文件能复用身份。
- 不同内容但同名文件不能误认为同一文档。
- UniRAG 返回的 source 能映射回 VibeReader 当前文档。

### Step 3：文档 ingest

Reader 打开文档后，允许触发 UniRAG ingest。

建议 Interface：

```ts
type IngestDocumentInput = {
  documentIdentity: DocumentIdentity;
  file?: File;
  filePath?: string;
  textPreview?: string;
  mimeType?: string;
};

type IngestJob = {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed";
  sourceId?: string;
  error?: string;
};
```

验收：

- 能把一个测试 PDF 送入 UniRAG。
- 能展示 indexing 状态。
- ingest 失败不影响继续阅读。

### Step 4：query

VibeReader 对话通过 `RagEngineAdapter.query` 请求 UniRAG。

```ts
type QueryInput = {
  question: string;
  documentIdentity?: DocumentIdentity;
  scope: "current-document" | "current-section" | "knowledge-library";
  sessionId?: string;
  topK?: number;
  providerConfig?: ModelProviderRuntimeConfig;
};

type QueryResult = {
  answer: string;
  citations: Citation[];
  engine: "local-keyword" | "uni-rag";
  degraded?: boolean;
};
```

验收：

- 同一个 PDF 能完成问答。
- answer 有 citations。
- citations 能在右侧正确渲染。
- UniRAG 不可用时自动 fallback。

### Step 5：citation 映射与跳转

统一 VibeReader 与 UniRAG 的引用对象。

```ts
type SourceRef = {
  documentId: string;
  sourceId?: string;
  chunkId?: string;
  page?: number;
  paragraphId?: string;
  span?: [number, number];
  text: string;
};

type Citation = {
  sourceRef: SourceRef;
  quote: string;
  confidence?: number;
  mappingStatus: "exact" | "page" | "source-only" | "unmapped";
};
```

映射规则：

- UniRAG `source` -> `DocumentIdentity.uniRagSourceId` 或 filename map。
- UniRAG `chunk_id` -> `SourceRef.chunkId`。
- UniRAG `page` -> `SourceRef.page`。
- UniRAG `text` -> `SourceRef.text`。
- span 可用时再映射到 paragraph/span。

验收：

- 第一版至少 page-level jump。
- 无法精确映射时显示 `source-only`，不假装精确。

### Step 6：用户确认内容进入知识库

进入长期记忆的对象优先是用户确认内容：

- 保存的 note。
- 创建的 card。
- 确认保留的 AI answer。
- highlight。

建议新增 ingest artifact Interface：

```ts
type IngestArtifactInput = {
  artifactType: "note" | "card" | "highlight" | "saved-answer";
  title?: string;
  content: string;
  sourceRefs: SourceRef[];
  createdAt: string;
};
```

验收：

- 保存一条笔记后，后续 query 能检索到它。
- 笔记和原文证据类型区分明确。

## 4. Adapter 设计

### 4.1 RagEngineAdapter

```ts
interface RagEngineAdapter {
  health(): Promise<RagEngineHealth>;
  ingestDocument(input: IngestDocumentInput): Promise<IngestJob>;
  getIngestStatus(jobId: string): Promise<IngestJob>;
  retrieve(input: RetrieveInput): Promise<SourceChunk[]>;
  query(input: QueryInput): Promise<QueryResult>;
}
```

Interface 需要保持小，但行为要深。

调用方不应该知道：

- UniRAG 端口。
- Chroma 存储路径。
- BM25/rerank 细节。
- 具体 provider 请求格式。
- citation regex 或 chunk 拼接逻辑。

这些都属于 Adapter implementation。

### 4.2 LocalKeywordRagAdapter

职责：

- 包装 VibeReader 当前本地 retrieval。
- 在 UniRAG 不可用时提供降级。
- 作为 Interface 的测试基线。

它不需要变聪明，只需要稳定。

### 4.3 UniRagHttpAdapter

职责：

- 调用 UniRAG FastAPI。
- 处理 health、ingest、query。
- 转换 UniRAG citation 到 VibeReader `Citation`。
- 把错误转成 Reader 能理解的 degraded state。

它不应该直接改 UI，也不应该自己保存笔记。

## 5. 模型配置策略

短期：

- VibeReader 继续作为模型配置入口。
- UniRAG 请求由 VibeReader 传入运行时 provider config。
- 不在 UniRAG 里另起一套用户看不见的配置。

原因：

- 第一批用户是我们自己，只能用自己真实拥有的模型服务。
- 模型配置已经是当前产品体验痛点。
- 双配置会制造测试不一致。

中期：

- 抽出 `model-providers` package。
- Reader 和 Knowledge Module 共用 provider schema。

## 6. 存储策略

短期不统一存储。

VibeReader：

- 阅读状态。
- UI 状态。
- 笔记、卡片、artifact。
- 文档身份映射。

UniRAG：

- chunk。
- embedding。
- 向量索引。
- BM25。
- RAG session。

共享点：

- `DocumentIdentity`。
- `SourceRef`。
- `Citation`。

中期再评估是否将 metadata 放到统一 SQLite。

## 7. 测试策略

### 7.1 单元测试

覆盖：

- UniRAG citation -> VibeReader Citation mapping。
- health fallback。
- duplicate filename identity。
- query degraded state。

### 7.2 集成测试

覆盖：

- UniRAG running: health success。
- UniRAG stopped: fallback success。
- ingest job success/failure。
- query returns citations。

### 7.3 浏览器 E2E

黄金路径：

```text
启动 UniRAG -> 启动 VibeReader -> 打开 PDF -> 索引 -> 提问 -> 显示引用 -> 点击引用 -> 保存笔记
```

失败路径：

```text
不启动 UniRAG -> 启动 VibeReader -> 打开 PDF -> 提问 -> fallback 可用且提示明确
```

## 8. 里程碑

### M1：Adapter Skeleton

产出：

- `RagEngineAdapter` Interface。
- `LocalKeywordRagAdapter`。
- `UniRagHttpAdapter` 空实现或 health-only 实现。

验收：

- Reader 可以切换 adapter。
- fallback 逻辑可测试。

### M2：Health + Query

产出：

- UniRAG health。
- query 调用。
- citation 渲染。

验收：

- 手动跑通当前 PDF 问答。

### M3：Ingest

产出：

- Reader -> UniRAG ingest。
- ingest status。
- source id 映射。

验收：

- 打开 PDF 后能进入可 RAG 状态。

### M4：Citation Jump

产出：

- page-level jump。
- mappingStatus。
- citation failure UI。

验收：

- 至少 3 条 citation 可以回到正确页。

### M5：Knowledge Flywheel

产出：

- note/card ingest。
- 后续 query 可检索用户确认内容。

验收：

- 保存的笔记能成为后续答案证据。

## 9. 第一条开发任务

从工程角度，第一条任务不是“接完整 UniRAG”，而是：

> 在 VibeReader 中建立 `RagEngineAdapter` seam，并把现有本地 retrieval 包装成第一个 Adapter。

原因：

- 这样不会依赖 UniRAG 是否启动。
- 可以先稳定 Interface。
- 第二个 Adapter 接 UniRAG 时才是真正验证 seam。
- 对当前 VibeReader 改动最小。
