# VibeReader Knowledge Workbench 项目开发计划

更新时间：2026-07-01

## 1. 一句话定位

一个以阅读为入口的本地知识飞轮：用户在 VibeReader 中阅读、划线、追问、做卡片和笔记；被用户保留的内容、原始证据和阅读行为会沉淀进 UniRAG，形成可追问、可引用、可回到原文的个人知识库。

详细产品叙事见 [PRODUCT_VISION.md](PRODUCT_VISION.md)。

## 2. 产品判断

VibeReader 与 UniRAG 不应被理解为两个竞争产品，而应被理解为同一个产品系统里的两个核心 Module：

- **VibeReader / Reader Module**：负责阅读现场。包括 PDF/Markdown/Text/HTML 阅读、页码与段落锚点、滑词、注意力路线、笔记、卡片、任务、右侧 AI 工作台。
- **UniRAG / Knowledge Module**：负责长期知识记忆。包括解析、chunk、embedding、向量库、BM25、rerank、知识库隔离、引用式问答、多源导入。

产品主线是：**先读进去，再沉淀下来，然后越问越强。**

## 3. 统一项目管理策略

当前采用“统一本地工作区 + yishuship 生命周期 + 保留各仓库 Git 历史”的方式。真实代码已收束到一个本地入口下：

```text
vibereader-knowledge-workbench/
  README.md
  PROJECTS.md
  apps/
    reader/             # VibeReader 前端与桌面壳，主开发仓库
  services/
    uni-rag/            # UniRAG 本地 RAG 后端
  legacy/
    vibero/             # 历史参考仓库
  .ship/
    pm-state.yaml
    tasks/
      20260701-vibereader-knowledge-flywheel/
        input/
        product/
        delivery/
        growth/
        control/
        plan/
  docs/
    PROJECT_DEVELOPMENT_PLAN.md
    PRODUCT_VISION.md
    UNI_RAG_INTEGRATION_STRATEGY.md
    OPERATING_MODEL.md
    COMPETITIVE_ANALYSIS_AND_PRODUCT_PLANNING.md
    ARCHITECTURE.md                   # 待补
    DEVLOG.md                         # 待补
```

旧路径已经保留为 symlink，避免已有脚本和记忆路径立即失效：

- `/Users/mahaoxuan/Desktop/黑客松/阅读器/ai-chat-standalone`
- `/Users/mahaoxuan/Desktop/AI产品经理/uni-rag`
- `/Users/mahaoxuan/Desktop/黑客松/阅读器/Vibero`

中期再迁移为真正 monorepo 式结构：

```text
vibereader-knowledge-workbench/
  apps/
    reader/             # VibeReader 前端与桌面壳
  services/
    uni-rag/            # UniRAG 本地 RAG 后端
  packages/
    shared-contracts/   # DocumentId、SourceRef、Citation、JobStatus 等共享类型
    model-providers/    # MiniMax、OpenAI-compatible、Anthropic-compatible 等模型配置
  docs/
  scripts/
```

当前还不做 Git 历史 flatten。原因是 `services/uni-rag` 与 `legacy/vibero` 仍有未提交改动，贸然合并会增加丢失上下文和历史混乱的风险。下一步应先补 root-level scripts 和统一启动/测试入口，再决定是否把 workbench 自身初始化为顶层 Git 仓库。

具体执行遵守：

- [OPERATING_MODEL.md](OPERATING_MODEL.md)：Plan / Goal / Loop、验证环境、验收目标、用户确认规则。
- [COMPETITIVE_ANALYSIS_AND_PRODUCT_PLANNING.md](COMPETITIVE_ANALYSIS_AND_PRODUCT_PLANNING.md)：竞品分析、产品规划、证据要求和路线图转化规则。

当前 yishuship 任务：

- task id: `20260701-vibereader-knowledge-flywheel`
- state: `.ship/pm-state.yaml`
- product artifacts: `.ship/tasks/20260701-vibereader-knowledge-flywheel/product/`
- engineering handoff: `.ship/tasks/20260701-vibereader-knowledge-flywheel/delivery/design-spec.md`

## 4. 核心设计原则

1. **Reader-first**：用户第一感知必须是阅读器，而不是聊天工具或资料仓库。
2. **Evidence-first**：AI 的每个重要结论都要能回到原文证据。
3. **User-confirmed memory**：进入长期知识库的内容优先来自用户保留、标注、收藏、生成卡片等行为。
4. **Local-first**：默认本地运行、本地存储，隐私材料不主动出域。
5. **Model-flexible**：模型供应商是可替换 Adapter，不把产品能力绑定到单一模型。
6. **Progressive integration**：先通过清晰 seam 接入 UniRAG，再考虑仓库和存储合并。

## 5. 关键 Module 与 Interface

UniRAG 的具体接入顺序、Adapter 设计、文档身份映射和测试策略见 [UNI_RAG_INTEGRATION_STRATEGY.md](UNI_RAG_INTEGRATION_STRATEGY.md)。

### 5.1 Reader Module

职责：

- 打开和渲染文档。
- 建立页码、段落、选区和高亮。
- 承载对话、笔记、卡片、任务和导出。
- 将用户有价值的阅读行为提交给 Knowledge Module。

不负责：

- 大规模跨文档检索。
- embedding、向量库、rerank。
- 长期知识库的底层索引实现。

### 5.2 Knowledge Module

职责：

- 接收文档、URL、笔记、卡片等知识对象。
- 解析、切块、索引、检索和引用式回答。
- 管理知识库、来源、chunk、引用和会话上下文。

不负责：

- PDF 的精细交互阅读体验。
- Reader 的滑词、注意力路线、笔记工作台 UI。
- 最终的用户阅读界面。

### 5.3 RAG Engine Seam

VibeReader 通过一个小而深的 Interface 使用 UniRAG。初始 Interface 建议：

```ts
interface RagEngineAdapter {
  ingestDocument(input: IngestDocumentInput): Promise<IngestJob>;
  getIngestStatus(jobId: string): Promise<IngestStatus>;
  retrieve(input: RetrieveInput): Promise<SourceChunk[]>;
  query(input: QueryInput): Promise<QueryResult>;
}
```

至少需要两个 Adapter：

- `LocalKeywordRagAdapter`：包装 VibeReader 当前的本地关键词检索能力，作为 fallback。
- `UniRagHttpAdapter`：通过本地 FastAPI 调用 UniRAG。

两个 Adapter 让这个 seam 变成真实 seam，而不是为了架构好看而造出来的空抽象。

## 6. 统一数据对象

第一批必须统一的对象：

```ts
type DocumentIdentity = {
  vibeDocumentId: string;
  filePath?: string;
  fileHash?: string;
  originalFilename: string;
  uniRagSourceId?: string;
};

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
};
```

最重要的是 `DocumentIdentity`。如果身份映射做不好，RAG 返回的 citation 就无法可靠跳回 Reader 的页面、段落和选区。

## 7. 阶段路线

### Phase 0：项目管理合一

目标：

- 建立统一工作区。
- 明确两个仓库的现状、职责和后续迁移路径。
- 建立开发日志、产品路线和架构计划。

验收：

- 有统一 README。
- 有项目开发计划。
- 有产品愿景。
- 有 UniRAG 集成策略。
- 有 Plan / Goal / Loop 运行规范。
- 有竞品分析与产品规划流程。
- 不破坏两个现有仓库。

### Phase 1：RAG 接入 Spike

目标：

- Reader 能调用 UniRAG 本地服务。
- Reader 打开一个 PDF 后，可以把它送入 UniRAG ingest。
- 右侧对话可以走 UniRAG query。

验收：

- 使用同一个测试 PDF。
- 能完成 ingest。
- 能返回 answer + citations。
- citations 能在 Reader 右侧正确渲染。
- 失败时能 fallback 到当前本地关键词检索。

### Phase 2：引用跳转闭环

目标：

- UniRAG citation 可以映射回 VibeReader 的页码、段落、选区。
- 用户点击引用可以回到原文。
- 用户可以把 answer 中的片段保存为笔记或卡片。

验收：

- citation 至少支持 page-level 跳转。
- paragraph/span-level 作为增强目标。
- 错误引用不静默展示，必须降级为“来源可见但无法精确定位”。

### Phase 3：知识飞轮

目标：

- 用户保留的笔记、卡片、划线、问题进入 Knowledge Module。
- 后续问答可以同时引用原文和用户自己的沉淀内容。

验收：

- 一条用户笔记能被重新检索到。
- 一张卡片能作为后续问答证据。
- AI 生成内容必须标记来源类型，不能伪装成原文。

### Phase 4：工作区迁移

目标：

- 将两个项目移动到统一 monorepo 或 workspace。
- 保持 git 历史和依赖脚本可用。
- 建立统一开发命令。

验收：

- `reader` 可独立启动。
- `uni-rag` 可独立启动。
- 一条命令可启动组合开发环境。
- README、脚本、测试路径全部更新。

### Phase 5：桌面化与本地 sidecar

目标：

- 研究 UniRAG 作为本地 sidecar 的运行方式。
- 明确 Python 后端、Chroma、embedding 模型在桌面端的打包策略。

验收：

- 有可重复启动/停止本地 RAG 后端的脚本。
- 有端口冲突处理。
- 有健康检查。
- 有失败降级逻辑。

## 8. 当前最优先事项

P0：

1. 在 VibeReader 中新增 RagEngineAdapter 的最小 Interface。
2. 把现有本地 retrieval 包装成 `LocalKeywordRagAdapter`。
3. 做 `UniRagHttpAdapter` health + query spike。
4. 做一条端到端验收路径：打开 PDF -> ingest -> query -> citation -> 保存笔记。
5. 将验证结果写回 yishuship `delivery/` 或 `e2e/`。

P1：

1. 引用跳转增强到段落/选区级。
2. 用户笔记与卡片进入 UniRAG。
3. 统一模型配置，避免 Reader 和 UniRAG 各自维护一套密钥和 provider 配置。
4. 增加端到端浏览器测试。

P2：

1. 迁移为统一 workspace。
2. 研究 Tauri sidecar。
3. 做 Knowledge Library 视图。
4. 做跨文档主题线索和知识图谱。

## 9. 风险清单

1. **仓库直接合并风险**：会破坏路径、脚本、git 状态和当前开发节奏。先不做。
2. **文档身份风险**：Reader 文档和 UniRAG source 对不上，会导致引用跳转失败。优先设计 `DocumentIdentity`。
3. **存储重复风险**：Reader SQLite 与 UniRAG Chroma/BM25 不应过早统一。
4. **模型配置分裂风险**：两个项目各自维护 provider 会造成测试和用户体验混乱。
5. **桌面端体积风险**：UniRAG 的 Python/embedding/Chroma 栈较重，早期不要强行打包进 Tauri。
6. **产品心智风险**：不能让用户感觉自己在用两个拼起来的产品。界面上必须是一个 Reader，RAG 是背后的知识能力。

## 10. 下一步执行建议

下一步进入 Phase 0 的剩余工作。所有新增产品判断先进入 yishuship 生命周期目录，再同步到长期 docs：

1. 在 VibeReader 仓库内新增一份轻量 ADR，记录“UniRAG 先作为 Adapter 接入，不直接仓库合并”。
2. 开始 Phase 1 spike：先做 `RagEngineAdapter` 和 `LocalKeywordRagAdapter`。
3. 接入 `UniRagHttpAdapter` 的 health 与 query。
4. 用真实浏览器行为验证黄金路径。
