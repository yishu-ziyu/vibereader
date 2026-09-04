# GLM Handoff: Reader-UniRAG Memory/Citation Contract Stabilization

> Task id: `20260701-vibereader-knowledge-flywheel`
> Phase: `phase-1-contract-stabilization`
> Route: `/yishuship:design` → `/yishuship:dev` → `/yishuship:e2e` → `/yishuship:handoff`
> Canonical root: `/Users/mahaoxuan/Desktop/AI产品经理/自研产品/vibereader`
> Date: 2026-07-02

## Prompt To Give GLM

你现在接手 VibeReader Knowledge Workbench 的下一阶段任务。请严格使用 yishuship 流程推进，不要只给口头总结。

### 0. 必读上下文

先进入项目根目录：

```bash
cd /Users/mahaoxuan/Desktop/AI产品经理/自研产品/vibereader
```

必须先阅读：

```text
README.md
PROJECTS.md
docs/OPERATING_MODEL.md
docs/PROJECT_DEVELOPMENT_PLAN.md
docs/UNI_RAG_INTEGRATION_STRATEGY.md
.ship/pm-state.yaml
.ship/tasks/20260701-vibereader-knowledge-flywheel/control/run_state.yaml
.ship/tasks/20260701-vibereader-knowledge-flywheel/plan/phase-1-contract-stabilization-goal.md
.ship/tasks/20260701-vibereader-knowledge-flywheel/delivery/phase-1-unirag-memory-backend.md
```

重点检查当前代码：

```text
apps/reader
services/uni-rag
services/uni-rag/src/uni_rag/store/memory.py
services/uni-rag/src/uni_rag/api/schemas.py
services/uni-rag/src/uni_rag/api/routes.py
services/uni-rag/src/uni_rag/rag/pipeline.py
services/uni-rag/tests/integration/test_memory_api.py
services/uni-rag/tests/unit/test_memory_store.py
```

不要相信聊天摘要，必须以代码和 yishuship 制品为准。

### 1. 背景

Reader 和 UniRAG 已经本地收束到一个 workbench，但云端还分别是：

```text
apps/reader      -> https://github.com/yishu-ziyu/VibeReader.git
services/uni-rag -> https://github.com/yishu-ziyu/uni-rag.git
legacy/vibero    -> https://github.com/chenyu-xjtu/Vibero.git
```

当前不会立刻做云端 monorepo。下一步先让 Reader ↔ UniRAG 的 memory/citation contract 稳定。稳定之后再考虑统一云端仓库。

UniRAG 已经有 Phase-1 memory backend：

- `POST /api/memory/jobs`
- `GET /api/memory/jobs/{job_id}`
- `POST /api/query` with `include_memory=true`
- SQLite `MemoryStore`
- `saved_memory` citation

Reader 已经有保存回答卡片、memory-aware query、citation jump 的相关能力，但现在需要 contract 固化和真实 E2E。

### 2. 本轮目标

把 Reader ↔ UniRAG 的 memory/citation 边界做成可测试、可版本化、可回放的 contract。

完成后必须能证明：

```text
Reader 打开文档
→ 提问
→ 保存回答卡片 / reading card / note
→ Reader POST 到 UniRAG memory
→ 再提问 include_memory=true
→ UniRAG 返回 saved_memory citation
→ Reader 显示「我的记忆」
→ 点击 citation
→ 跳回对应卡片或最近的源文档位置
```

### 3. 必须使用 yishuship 流程

请按以下阶段交付：

#### 3.1 Design

在 `.ship/tasks/20260701-vibereader-knowledge-flywheel/plan/` 下新增或更新：

```text
phase-1-contract-stabilization-design.md
```

必须包含：

- Goal
- Scope
- Out of Scope
- Interface / Contract
- Shared Fixtures
- Test Plan
- E2E Plan
- Failure Modes
- Acceptance Criteria

如果发现现有 contract 不合理，先在 design 文档说明，不要直接大改。

#### 3.2 Dev

实现最小但完整的 contract 稳定化。

必须完成：

1. 定义 contract version：`reader-unirag-memory-v1`
2. 新增共享 fixtures，建议位置：

```text
contracts/reader-unirag-memory/v1/
  README.md
  saved-answer-card.json
  reading-card.json
  note.json
  highlight.json
  query-response-with-saved-memory.json
  citation-unresolved.json
```

如果你判断放在别的位置更符合现有代码，也可以调整，但必须在文档中说明。

3. UniRAG 侧 contract tests：

验证共享 fixtures 可被 UniRAG 接收、持久化、检索，并返回稳定字段。

最低覆盖：

- saved answer card
- reading card
- note
- highlight
- query response with `saved_memory`
- missing/unknown memory job
- `include_memory=false` 不返回 memory citation
- memory store 空时不破坏 query

4. Reader 侧 contract tests：

验证 Reader 能：

- 构造符合 contract 的 memory payload
- ingest memory 到 UniRAG adapter
- normalize `saved_memory` citation
- 把 citation 渲染为「我的记忆」
- 根据 `artifact_id` / `memory_id` / `source_refs` 找到目标
- 找不到目标时显示明确降级状态

5. 不要破坏现有 mock 测试，但真实联调优先级高于 mock。

#### 3.3 E2E

新增或更新真实浏览器 E2E。必须使用真实 Reader + 真实 UniRAG 服务，不只用 Playwright route mock。

建议服务：

```bash
# terminal 1
cd services/uni-rag
uv run uni-rag serve --port 8766

# terminal 2
cd apps/reader
npm run dev -- --port 3217
```

E2E 必须覆盖：

1. UniRAG health visible / reachable
2. Reader 上传或打开固定测试文档
3. 提问并获得回答
4. 保存回答为卡片或笔记
5. UniRAG 收到 memory job 并返回 completed
6. 再次提问 with memory enabled
7. UI 出现「我的记忆」
8. 点击 memory citation
9. 跳回 Notes 卡片或最近源位置
10. 如果目标缺失，UI 明确显示无法定位，而不是假装跳转成功

#### 3.4 Handoff

完成后必须写：

```text
.ship/tasks/20260701-vibereader-knowledge-flywheel/delivery/phase-1-contract-stabilization.md
.ship/tasks/20260701-vibereader-knowledge-flywheel/e2e/phase-1-contract-stabilization-browser.md
```

并更新：

```text
.ship/tasks/20260701-vibereader-knowledge-flywheel/control/run_state.yaml
services/uni-rag/DEVLOG.md          # 如果改了 UniRAG
apps/reader/DEVLOG.md 或现有开发日志 # 如果 Reader 有对应日志
PROJECTS.md                         # 如果 contract 文件路径或仓库策略变化
```

### 4. Contract 字段要求

`saved_memory` citation 必须稳定支持：

```json
{
  "chunk_id": "memory:<memory_id>",
  "source": "saved_memory",
  "section": "<title>",
  "page": 0,
  "text": "<memory text>",
  "span": null,
  "source_type": "saved_memory",
  "artifact_id": "<Reader artifactId>",
  "artifact_type": "<answer|card|note|highlight|summary|qa>",
  "memory_id": "<UniRAG memory id>",
  "title": "<title>",
  "source_refs": [
    {
      "documentId": "<Reader document id>",
      "documentName": "<document name>",
      "page": 1,
      "paragraphId": "<optional paragraph id>",
      "chunkId": "<optional chunk id>",
      "label": "P1",
      "text": "<source excerpt>",
      "grounding": {
        "precision": "paragraph|page|text|unknown",
        "matchedBy": "artifact|text|page|fallback",
        "score": 0.0
      }
    }
  ],
  "contract_version": "reader-unirag-memory-v1"
}
```

如果现有 API 还没有 `contract_version` 字段，请做兼容新增，不要破坏旧字段。旧 Reader / 旧 UniRAG 默认可按 v1 解析。

### 5. 稳定性定义

本任务不是“加几个测试”。

只有满足以下条件才算完成：

- schema/fixtures 固定；
- Reader 和 UniRAG 两侧都使用同一批 fixtures；
- 单测/集成测试通过；
- 浏览器真实 E2E 通过；
- 失败路径有可见降级；
- yishuship delivery/e2e 记录完整；
- 没有提交密钥、数据库、构建产物、测试截图大文件；
- 没有把 `.ship` 中本地过程记录误认为产品代码；
- 没有引入新的分散仓库。

### 6. 验证命令

UniRAG 测试必须使用：

```bash
cd services/uni-rag
uv run python -m pytest tests/unit/test_memory_store.py tests/integration/test_memory_api.py
```

如果新增 contract tests，必须一起跑：

```bash
uv run python -m pytest tests/unit tests/integration
```

Reader 测试请先查看现有 `package.json`，优先使用项目已有命令，例如：

```bash
cd apps/reader
npm test
npm run test
npm run test:e2e
```

不要臆造不存在的命令。先读 `package.json` 再执行。

### 7. 仓库与提交要求

当前 Codex 作为 gatekeeper。你可以完成代码、测试和文档，但不要 push。

交付前必须输出：

```bash
git status --short
git diff --stat
```

并在总结中列出：

- 改了哪些文件；
- 新增了哪些 fixtures；
- 跑了哪些测试；
- 哪些通过；
- 哪些没跑以及原因；
- 是否有需要 Codex 复核的风险点。

如果你确实需要 commit，请只在测试全部通过后提交，并且不要包含：

- `.env`
- API key
- `data/*.db`
- `node_modules`
- `dist/build`
- 大型截图/视频
- 临时日志

### 8. 不要做的事

- 不要直接做云端 monorepo 迁移。
- 不要修改用户隐私/数据出域策略。
- 不要移除现有 fallback。
- 不要把 Vibero legacy 当主开发线。
- 不要只写文档不跑测试。
- 不要只跑 mock E2E 就声称真实联调完成。
- 不要让 citation 点击失败时沉默。

### 9. 最终交付格式

请按这个结构返回：

```markdown
## yishuship 状态
- task_id:
- phase:
- status:

## 完成内容

## 改动文件

## Contract Fixtures

## 测试结果

## 浏览器 E2E 结果

## 风险与未完成项

## 建议 Codex 复核重点
```

如果任一验收项失败，请不要说“全部完成”，而是明确标记：

```text
status: blocked / partial / needs-codex-review
```

## Codex Review Gate

GLM 完成后，Codex 需要复核：

1. contract fixtures 是否真的被 Reader 和 UniRAG 两侧测试引用；
2. `reader-unirag-memory-v1` 是否兼容旧字段；
3. memory citation jump 是否真实浏览器可复现；
4. failure fallback 是否用户可见；
5. 是否有运行产物或密钥进入 Git；
6. 是否可以进入云端仓库统一前的下一阶段。
