# Vibero Standalone 开发日志

## 2026-07-02 Phase-1 Contract Stabilization（reader-unirag-memory-v1）

把 Reader ↔ UniRAG 的 memory/citation 边界固化为可版本化、可回放的 contract，版本号 `reader-unirag-memory-v1`。

**改动**：
- `src/services/savedMemoryService.js`：`buildSavedMemoryPayload` 输出加 `contractVersion: 'reader-unirag-memory-v1'`，UniRAG 接受 camelCase alias。
- `src/services/ragEngineAdapter.js`：`memorySourceRefFromUniRagCitation` 透传 `citation.contract_version || citation.contractVersion || 'reader-unirag-memory-v1'`，兼容旧 UniRAG 响应（缺字段默认 v1）。
- `src/services/contract.v1.test.js`：新增 6 项 contract tests，引用共享 fixtures `contracts/reader-unirag-memory/v1/`，通过公开 API `createUniRagHttpAdapter({fetchImpl}).query(...)` 测试 normalize。

**共享 fixtures**：`contracts/reader-unirag-memory/v1/`（7 fixture + README），被 Reader + UniRAG 两侧 contract tests 双向引用。

**测试**：`npm test`（vitest run）323 passed，含新增 6 项 contract.v1.test.js，0 failed，无回归。

**E2E**：浏览器级 Playwright MCP 对真实 Reader 3217 + 真实 UniRAG 8766 验证：UniRAG health visible / 上传 sample.md / 知识入库完成 / 浏览器环境 fetch UniRAG query 返回 saved_memory citations 全带 contract_version + 全字段 / include_memory=false 无 memory citation / unknown job 404。

**未完成**：Chat UI 完整飞轮（提问→保存卡片→点击「我的记忆」跳转）。Slate.js React 富文本编辑器的 `execCommand('insertText')` 不触发 Slate 合成事件，且 Chat 依赖 MiniMax API Key。contract 端到端已用浏览器 fetch + 单测 normalize 组合验证。详见 `.ship/tasks/20260701-vibereader-knowledge-flywheel/delivery/phase-1-contract-stabilization.md`。

## 2026-07-01 Phase 50：对标 Vibero 后的精读主流程收束

背景：

- 对比 Vibero 后确认当前差距不在单点 AI 能力，而在产品心智仍像工具集合。
- 本轮把主入口收束为“开始精读”，让用户围绕阅读路线、原文依据和卡片沉淀完成闭环。

改动：

- 顶部新增“开始精读”主按钮，顺序启动论文总览、阅读路线和阅读卡片 agent。
- 右侧主标签从“摘要 / 卡片 / 导航 / 笔记 / 任务 / 对话”收束为“阅读路线 / 卡片 / 笔记 / 对话”。
- “任务”降级为阅读路线页内的“精读进度”，保留单项补跑、失败重试和结果保存能力。
- 打开 PDF、Markdown、文本、HTML 文档后默认进入“阅读路线”，避免用户从笔记页开始迷失。
- 将“注意力导航 / 分析关键位置”改为“阅读路线 / 生成阅读路线”，并补充更用户化的空状态说明。
- 修复右侧残留英文 UI：Sources、Context、Relevant、Current page、Current section、Selected paragraph 等改为中文。
- 更新 onboarding，让新用户按“上传文档 -> 开始精读 -> 跟随阅读路线 -> 沉淀阅读卡片 -> 继续追问 AI”的主流程理解产品。

命令：

- `pnpm test -- --reporter=dot` -> pass（54 files / 287 tests）。
- `pnpm build` -> pass，保留既有 chunk size warning。
- 系统 Chrome + Playwright 回退验证 `http://127.0.0.1:3217/` -> pass：首屏出现“开始精读”和“阅读路线”，上传 `demo-assets/wonderland_short.pdf` 后“开始精读”可用，旧“任务”主标签不存在。
- `git diff --check` -> pass。

遗留风险：

- 本轮只收束主流程和信息架构，没有重做阅读路线生成质量。
- `开始精读` 当前串行触发已有 agent，后续需要更精细的任务编排、取消、队列状态和失败恢复体验。

## 2026-06-13 Phase 42：VibeCard Persistence Restart

目标：

- 让 `Create VibeCard` 生成的卡片从“当前会话可用”推进到“重启/重新读取后仍完整可用”。

改动：

- 新增 `tasks/bdd-tdd-vibecard-persistence-restart.md`，用 BDD/TDD 明确重启后卡片恢复、来源保留和文档隔离规则。
- 新增 `src/services/artifactService.persistentRestart.test.js`，覆盖持久化 VibeCard record 恢复为可回源 artifact 的合同。
- `artifactService` 从持久化 VibeCard 恢复 artifact 时，保留 `sourceText`、`aiContent`、`source` 和 `userNote`。
- `artifactService` 从 `paragraphId` / `source.paragraphId` 回填 `sourceSpanIds`，让恢复后的卡片仍能被导出、诊断和回源链路识别为 source-grounded。
- 更新 `src/services/artifactService.persistent.test.js`，把既有 persistent adapter 测试升级为检查恢复后的来源字段。

命令：

- RED：`npm run test -- src/services/artifactService.persistentRestart.test.js` -> failed，恢复后 `sourceSpanIds` 为空。
- GREEN：`npm run test -- src/services/artifactService.persistentRestart.test.js` -> pass（1 file / 2 tests）。
- `npm run test -- src/services/artifactService.persistentRestart.test.js src/services/artifactService.persistent.test.js src/services/artifactService.test.js` -> pass（3 files / 9 tests）。
- `npm run test -- src/services/artifactService.persistentRestart.test.js src/services/artifactService.test.js src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx src/App.retrievalContext.test.jsx` -> pass（5 files / 47 tests）。
- `npm run test` -> pass（53 files / 274 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` -> pass（1 test）。
- `git diff --check` -> pass。

遗留风险：

- 本轮验证的是持久化恢复合同和浏览器/组件路径；真实 Tauri 桌面重启后点击回源仍需要 PM 按 Phase 40 文档手动复测。
- 没有改 SQLite schema，也没有新增安装包。

## 2026-06-13 Phase 41.1：VibeCard Source Return Hardening

目标：

- 继续硬化 Phase 41 的 `回到原文` 闭环，让 PM 在卡片端能看清每个按钮指向哪个来源位置。

改动：

- 新增 `tasks/bdd-tdd-vibecard-source-return-hardening.md`，用 Given / When / Then 记录本轮 PM 验收规则。
- `ArtifactPanel` 的 `回到原文` 按钮新增可访问名称和 tooltip，例如 `回到原文 P1 · chunk-3`。
- `ArtifactPanel.test.jsx` 将 agent-generated VibeCard 的来源改为 Markdown `chunk-*` 场景，并覆盖按钮点击会把原卡片交给导航回调。

命令：

- RED：`npm run test -- src/ArtifactPanel.test.jsx` -> failed，缺少 `回到原文 P1 · chunk-3` 按钮名。
- GREEN：`npm run test -- src/ArtifactPanel.test.jsx` -> pass（1 file / 17 tests）。
- `npm run test -- src/ArtifactPanel.test.jsx src/DocumentReader.test.jsx src/WorkspaceLayout.test.jsx src/App.retrievalContext.test.jsx` -> pass（4 files / 47 tests）。
- `npm run test` -> pass（52 files / 272 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` -> pass（1 test）。
- `git diff --check` -> pass。

遗留风险：

- 本轮增强的是卡片端可判断性和自动化覆盖；Tauri 桌面真实点击仍需要 PM 按 Phase 40 手动验收路径复测。
- `chunk-*` 仍是当前 readable document 的来源 ID 合同，后续 Rust chunker 接入时需要保持 source ref 和前端锚点一致。

## 2026-06-12 Phase 41：Readable Document Source Return

用户反馈：

- 在 Phase 40 手测 `Create VibeCard` 后，点击卡片上的 `回到原文` 没有明显反应。

根因：

- `Create VibeCard` 已经为 Markdown 样例生成 `chunk-*` 来源位置，也已经发出 `vibereader:navigate-paragraph` 事件。
- PDF 阅读器会响应该事件，但 Markdown/Text/HTML 的 `DocumentReader` 只渲染正文，没有 `chunk-*` 段落锚点，也没有监听回源事件。

改动：

- `DocumentReader` 将 Markdown/Text/HTML 正文按空行切成 readable chunks，并渲染为 `chunk-1`、`chunk-2`、`chunk-3` 等可定位段落。
- `DocumentReader` 监听 `vibereader:navigate-paragraph`，匹配当前文档后滚动到目标段落。
- 成功回源时给目标段落添加短暂高亮。
- 找不到来源段落时显示 `未找到这张卡片的原文段落`，避免用户看到静默无反应。
- `DocumentReader.test.jsx` 覆盖 Markdown 卡片来源回跳到 `chunk-3` 的行为。

命令：

- RED：`npm run test -- src/DocumentReader.test.jsx` -> failed，找不到 `[data-paragraph-id="chunk-3"]`。
- GREEN：`npm run test -- src/DocumentReader.test.jsx` -> pass（1 file / 5 tests）。
- `npm run test -- src/DocumentReader.test.jsx src/dragInject.test.js src/WorkspaceLayout.test.jsx src/ArtifactPanel.test.jsx` -> pass（4 files / 41 tests）。
- `npm run test` -> pass（52 files / 272 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `git diff --check` -> pass。

遗留风险：

- Markdown/Text/HTML 的 chunk id 当前按空行分段，与当前本地 reading agent 的 `chunk-*` 合同保持一致。
- 如果后续引入 Rust chunker 或更细粒度段落模型，需要继续保持前端锚点和 agent source refs 的 ID 合同一致。

## 2026-06-12 Phase 40：PM Manual QA Test Pack

改动：

- 新增 `docs/PM_MANUAL_QA_PHASE40.md`，明确当前主测试形态是 Tauri 桌面 App 开发版，Web 开发面只作为辅助。
- 新增 `demo-assets/create-vibecard-sample.md`，提供专门用于 `Create VibeCard` 验收的 Markdown 文档。
- 更新 `demo-assets/README.md`，把新增测试文档纳入 demo assets 索引。
- 更新 `tasks/todo.md`，记录 Phase 40 的 PM 手动验收包任务。

PM 验收重点：

- 能启动桌面窗口。
- 能打开 `demo-assets/create-vibecard-sample.md`。
- 能在 Tasks 点击 `Create VibeCard` 并看到写入确认。
- 确认后右侧 Notes / VibeCards 区至少出现 3 张卡。
- 每张卡包含标题、原文摘录、AI 内容和来源位置。

命令：

- `npm run tauri:dev` -> pass，Vite ready at `http://127.0.0.1:3217/`，Rust app `target/debug/vibereader` 已运行。
- `git diff --check` -> pass。

遗留风险：

- 这是一轮 PM 可测试包，不新增最终安装包。
- 真实点击验收仍需要产品经理或本机桌面窗口确认。
- 启动日志包含既有 AntD zIndex warning 和 macOS IMK 提示，目前不阻塞桌面窗口启动。

## 2026-06-12 Phase 39：Create VibeCard E2E Acceptance

改动：

- 新增 `tasks/bdd-tdd-create-vibecard-e2e.md`。
- 新增 `src/agent/cardGenerationFlow.test.js`，用真实本地 reading agent loop 验证 3 次 `create_vibecard` 写入。
- `createLocalCardGenerationModel` 在少于 3 个 source chunks 时返回明确不足说明，并且不创建部分 VibeCard。
- `ArtifactPanel` 支持显示 agent-generated VibeCard 的标题、原文摘录、AI 内容和来源标签。
- `ArtifactPanel` 拖拽文本包含 agent-generated VibeCard 的标题、sourceText 和 aiContent。
- `WorkspaceLayout.test.jsx` 覆盖确认运行后 3 张 VibeCard 写入 Notes / VibeCards 区。
- `App` 在 `Create VibeCard` 成功创建 3 张卡时给出成功提示，来源不足时给出警告提示。

命令：

- RED：`npm run test -- src/agent/readingTaskModels.test.js` -> failed，短文档仍会继续调用 `create_vibecard`。
- GREEN：`npm run test -- src/agent/readingTaskModels.test.js src/agent/cardGenerationFlow.test.js` -> pass（2 files / 5 tests）。
- RED：`npm run test -- src/ArtifactPanel.test.jsx` -> failed，agent-generated VibeCard 只显示类型和按钮，标题/sourceText/aiContent 不可见。
- GREEN：`npm run test -- src/ArtifactPanel.test.jsx` -> pass（1 file / 17 tests）。
- RED：`npm run test -- src/WorkspaceLayout.test.jsx` -> failed，测试 mock 未模拟真实 `createArtifact` 自动补 id，3 次写入被同一个 undefined id 去重为 1 张。
- GREEN：`npm run test -- src/WorkspaceLayout.test.jsx` -> pass（1 file / 16 tests）。
- `npm run test -- src/agent/readingTaskModels.test.js src/agent/cardGenerationFlow.test.js src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx` -> pass（4 files / 38 tests）。
- `npm run test` -> pass（52 files / 271 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（22 storage tests + 1 command test）。

遗留风险：

- 本切片仍使用 deterministic 本地 agent，不接云 planner。
- 本切片不做卡片质量评分、间隔复习、Anki / Obsidian 新导出能力。

## 2026-06-12 Phase 38：Create VibeCard Agent Entry

改动：

- 新增 `tasks/bdd-tdd-card-generation-agent-entry.md`。
- `card_generation_agent` 产品入口命名为 `Create VibeCard`。
- `Create VibeCard` 加入当前文档 Tasks 面板可运行 agent 列表。
- 运行前增加确认弹窗，说明会为当前文档创建至少 3 张带来源的 VibeCard。
- 新增本地 deterministic `createLocalCardGenerationModel`，按顺序读取文档、读取 chunks、连续调用 3 次 `create_vibecard`。
- `Create VibeCard` runtime options 只在本次任务开启 `create_vibecard` 和 `canWriteVibeCards: true`。
- App 新增 VibeCard artifact adapter，把 agent 产出的 card payload 写入现有本地卡片链路。

命令：

- RED：`npm run test -- src/agent/readingTaskModels.test.js` -> failed，缺少 `createLocalCardGenerationModel`。
- GREEN：`npm run test -- src/agent/readingTaskModels.test.js` -> pass（1 file / 3 tests）。
- RED：`npm run test -- src/agent/skills.test.js src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` -> failed，入口未暴露、确认门和写权限未接入。
- GREEN：`npm run test -- src/agent/readingTaskModels.test.js src/agent/skills.test.js src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` -> pass（4 files / 34 tests）。
- `npm run test` -> pass（51 files / 267 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（22 storage tests + 1 command test）。
- `git diff --check` -> pass。

遗留风险：

- 本切片仍是 deterministic 本地 agent，不接云 planner。
- 本切片不做卡片质量评分、间隔复习、Anki / Obsidian 导出。

## 2026-06-12 Phase 37：Reading Agent Model Boundary

改动：

- 新增 `tasks/bdd-tdd-reading-agent-model-boundary.md`。
- 新增 `src/agent/readingTaskModels.js` 和 `src/agent/readingTaskModels.test.js`。
- 将 `paper_overview_agent` deterministic 本地模型从 `App.jsx` 抽到 agent 模块。
- 将 `attention_agent` deterministic 本地模型从 `App.jsx` 抽到 agent 模块。
- `App.jsx` 继续负责 document、tool adapter、task runner wiring。
- `src/agent/index.js` 导出 reading task models。
- `WorkspaceLayout.test.jsx` 的 `./agent` mock 同步新增模型工厂导出。

命令：

- RED：`npm run test -- src/agent/readingTaskModels.test.js` -> failed，缺少 `readingTaskModels` 模块。
- GREEN：`npm run test -- src/agent/readingTaskModels.test.js` -> pass（1 file / 1 test）。
- RED：新增 attention route 行为后，`npm run test -- src/agent/readingTaskModels.test.js` -> failed，attention model 仍返回占位 final。
- GREEN：`npm run test -- src/agent/readingTaskModels.test.js` -> pass（1 file / 2 tests）。
- `npm run test -- src/agent/readingTaskModels.test.js src/WorkspaceLayout.test.jsx src/TaskStatusPanel.test.jsx` -> pass（3 files / 27 tests）。
- `npm run test` -> pass（51 files / 263 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（22 storage tests + 1 command test）。
- `git diff --check` -> pass。

遗留风险：

- 本切片只调整本地 deterministic model 边界，不新增 planner、云模型执行或 Agent 权限 UI。

## 2026-06-12 Phase 36：Attention Agent Entry

改动：

- 新增 `tasks/bdd-tdd-attention-agent-entry.md`。
- `TaskStatusPanel` 支持通过 `agentSkills` 渲染多个可启动 reading agent。
- `App` 将 runnable skills 限定为 `paper_overview_agent` 和 `attention_agent`，并传给 Tasks 面板。
- 新增本地 deterministic `attention_agent` model，按顺序调用 `get_current_document`、`list_attention_insights`、`get_document_chunks`。
- `attention_agent` 生成 `# Attention route` task result，并保留 insight/chunk source refs。
- `createReadingTools` 在 App 内接入 `listPersistentAttentionInsights` adapter。
- 补充 `.task-status-agent-actions` 样式，避免多个 task 按钮挤出面板。

命令：

- RED：`npm run test -- src/TaskStatusPanel.test.jsx` -> failed，找不到 `Attention route` 启动按钮。
- GREEN：`npm run test -- src/TaskStatusPanel.test.jsx` -> pass（1 file / 13 tests）。
- RED：`npm run test -- src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` -> failed，App 未启动 `attention_agent`。
- GREEN：`npm run test -- src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` -> pass（2 files / 25 tests）。
- `npm run test` -> pass（50 files / 261 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（22 storage tests + 1 command test）。
- `git diff --check` -> pass。

遗留风险：

- `attention_agent` 仍是本地 deterministic task，不是云模型 planner。
- `card_generation_agent` 和 `note_export_agent` 仍未接运行入口，需要等写入/导出权限确认 UI。

## 2026-06-11 Phase 35：Reading Agent Skill Registry

改动：

- 新增 `tasks/bdd-tdd-reading-agent-skill-registry.md`。
- 新增 `src/agent/skills.js`，把首批阅读任务定义为稳定 skill registry。
- 注册 `paper_overview_agent`、`attention_agent`、`card_generation_agent`、`note_export_agent` 四个 task skill。
- 每个 skill 明确 `skillPath`、`requiredTools`、`outputArtifactType`、`goal` 和 `maxIterations`。
- `App` 启动 `paper_overview_agent` 时通过 registry 构造可序列化 task payload，runtime options 仍只在执行时注入 model 和 tools。
- 新增 `docs/reading-agent-skills/` 下 4 份 skill contract 文档。

命令：

- RED：`npm run test -- src/agent/skills.test.js` -> failed，缺少 `src/agent/skills.js`。
- RED：`npm run test -- src/WorkspaceLayout.test.jsx` -> failed，paper overview task payload 缺少 `skillPath` 和 `requiredTools`。
- GREEN：`npm run test -- src/agent/skills.test.js src/WorkspaceLayout.test.jsx` -> pass（2 files / 14 tests）。
- `npm run test` -> pass（50 files / 259 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（22 storage tests + 1 command test）。
- `git diff --check` -> pass。

遗留风险：

- 本切片只注册 skill/task contract；当前 UI 仍只启动已有本地可运行的 `paper_overview_agent`。
- `attention_agent`、`card_generation_agent`、`note_export_agent` 还没有接 planner、权限确认 UI 或真实运行入口。

## 2026-06-11 Phase 34：Reading Note Document Content Export

改动：

- 新增 `tasks/bdd-tdd-reading-note-document-content.md`。
- Reading Note JSON payload 新增向后兼容的可选 `documentContent` 字段。
- `export_reading_note` 导出当前文档 persisted content。
- `import_reading_note_json` 导入 `documentContent` 时恢复 `document_contents`。
- 旧 schema v1 JSON 缺少 `documentContent` 时仍可导入。
- 前端 `exportPersistentReadingNote` 保持 `documentContent` 字段透传。

命令：

- RED：`cargo test --test storage_core reading_note` -> failed，JSON 缺少 `documentContent`，导入后 `load_document_content` 为空。
- GREEN：`cargo test --test storage_core reading_note` -> pass（4 tests）。
- GREEN：`npm run test -- src/services/persistentStorage.test.js` -> pass（1 file / 6 tests）。
- `npm run test` -> pass（49 files / 256 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（22 storage tests + 1 command test）。
- `git diff --check` -> pass。

遗留风险：

- 本切片不把全文正文渲染进 Markdown 导出，不处理 PDF 二进制、OCR 缓存或 source spans 的完整导出。

## 2026-06-11 Phase 33：Document Content Persistence Foundation

改动：

- 新增 `tasks/bdd-tdd-document-content-persistence.md`。
- Rust SQLite 新增 `document_contents` 表。
- Rust storage 支持 `upsert_document_content` / `load_document_content`。
- Tauri command 新增 `storage_upsert_document_content` / `storage_load_document_content`。
- 前端 adapter 新增 `savePersistentDocumentContent` / `loadPersistentDocumentContent`。
- App 打开 Markdown / Text / HTML 后保存正文到 Rust storage。
- Recent 文本文档点击后加载 persisted content 并恢复阅读器。
- 浏览器 runtime 继续保持 metadata-only fallback，不把正文写入 Recent metadata。

命令：

- RED：`cargo test --test storage_core document_content` -> failed，缺少 `DocumentContentInput` 与 storage 方法。
- GREEN：`cargo test --test storage_core document_content` -> pass（1 test）。
- RED：`npm run test -- src/services/persistentStorage.test.js` -> failed，缺少 document content adapter。
- GREEN：`npm run test -- src/services/persistentStorage.test.js` -> pass（1 file / 6 tests）。
- RED：`npm run test -- src/WorkspaceLayout.test.jsx` -> failed，App 未保存正文、Recent 未恢复正文。
- GREEN：`npm run test -- src/WorkspaceLayout.test.jsx` -> pass（1 file / 11 tests）。
- `npm run test` -> pass（49 files / 256 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（22 storage tests + 1 command test）。
- `git diff --check` -> pass。

遗留风险：

- 本切片不做 PDF 二进制缓存、OCR 缓存、删除级联或 schema migration UI。

## 2026-06-11 Phase 32：Reading Note JSON Import UI

改动：

- 新增 `tasks/bdd-tdd-reading-note-json-import-ui.md`。
- Notes / Export 面板新增 `Import JSON` 入口。
- 支持粘贴 Reading Note JSON 后导入。
- 支持选择 `.json` 文件并填入导入输入框。
- 导入调用 `importPersistentReadingNoteJson`。
- App 在导入成功后刷新最近文档列表；导入当前文档时刷新 Notes / VibeCards。

命令：

- RED：`npm run test -- src/ArtifactPanel.test.jsx` -> failed，找不到 `Import JSON` 按钮。
- RED：`npm run test -- src/WorkspaceLayout.test.jsx` -> failed，`ArtifactPanel` 未收到 `onReadingNoteImported`。
- GREEN：`npm run test -- src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx` -> pass（2 files / 25 tests）。
- `npm run test` -> pass（49 files / 253 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（21 storage tests + 1 command test）。
- `git diff --check` -> pass。

遗留风险：

- 本切片不做复杂冲突解决 UI，也不自动切换到被导入的非当前文档。

## 2026-06-11 Phase 31：Reading Note JSON Import

改动：

- 新增 `tasks/bdd-tdd-reading-note-json-import.md`。
- Rust `Storage::import_reading_note_json` 支持导入 `exportType: reading_note` / `schemaVersion: 1` 的 Reading Note JSON。
- 导入会恢复 document metadata、summaries、annotations、vibecards、flashcard decks/cards、attention insights、thinking tree 和 conversations。
- 同一文档重复导入会替换导出覆盖的文档级集合，避免重复追加 rows。
- 新增 Tauri command `storage_import_reading_note_json`。
- 新增前端 adapter `importPersistentReadingNoteJson`。

命令：

- RED：`cargo test --test storage_core import_reading_note` -> failed，`Storage` 缺少 `import_reading_note_json`。
- RED：`npm run test -- src/services/persistentStorage.test.js` -> failed，缺少 `importPersistentReadingNoteJson`。
- GREEN：`cargo test --test storage_core imports_reading_note_export_json_into_storage` -> pass（1 test）。
- GREEN：`cargo test --test storage_core reading_note_json` -> pass（1 test）。
- GREEN：`npm run test -- src/services/persistentStorage.test.js` -> pass（1 file / 5 tests）。
- `npm run test` -> pass（49 files / 250 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（21 storage tests + 1 command test）。
- `git diff --check` -> pass。

遗留风险：

- 这里只完成 Rust/SQLite 导入和前端 adapter，尚未做“选择 JSON 文件并导入”的 UI。

## 2026-06-11 Phase 30：Reading Note Export Schema

改动：

- 新增 `tasks/bdd-tdd-reading-note-export-schema.md`。
- Rust `export_reading_note` 返回 `exportType: "reading_note"`。
- Rust `export_reading_note` 返回 `schemaVersion: 1`。
- JSON payload 顶层包含同一组 schema metadata。

命令：

- RED：`cargo test --test storage_core builds_markdown_reading_note_export_without_secrets` -> failed，`ReadingNoteExport` 缺少 `export_type/schema_version` 字段。
- GREEN：`cargo test --test storage_core builds_markdown_reading_note_export_without_secrets` -> pass（1 test）。
- `npm run test` -> pass（49 files / 250 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（19 storage tests + 1 command test）。
- `git diff --check` -> pass。

遗留风险：

- 这里只声明导出 schema，尚未实现 JSON 重新导入。

## 2026-06-11 Phase 29：Exported At Timestamp

改动：

- 新增 `tasks/bdd-tdd-exported-at.md`。
- Rust `export_reading_note` 生成毫秒级 `exportedAt`。
- command 返回体、JSON payload 和 Markdown metadata 使用同一个导出时间戳。
- 完整 Reading Note Markdown / JSON 下载文件名日期使用 `exportPreview.exportedAt`。
- Selected VibeCards 导出继续保持前端即时日期。

命令：

- RED：`npm run test -- src/ArtifactPanel.test.jsx` -> failed，完整 Reading Note 文件名仍使用浏览器当前日期。
- RED：`cargo test --test storage_core builds_markdown_reading_note_export_without_secrets` -> failed，`ReadingNoteExport` 缺少 `exported_at` 字段。
- GREEN：`npm run test -- src/ArtifactPanel.test.jsx` -> pass（1 file / 14 tests）。
- GREEN：`cargo test --test storage_core builds_markdown_reading_note_export_without_secrets` -> pass（1 test）。
- `npm run test` -> pass（49 files / 250 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（19 storage tests + 1 command test）。
- `git diff --check` -> pass。

遗留风险：

- JSON schema 还没有显式版本号；后续导入/导出兼容性应和 `exportedAt` 一起进入 export metadata。

## 2026-06-11 Phase 28：Export Filenames

改动：

- 新增 `tasks/bdd-tdd-export-filenames.md`。
- Reading Note Markdown / JSON 下载文件名优先使用清理后的文档名。
- Selected VibeCards / Obsidian Markdown 下载文件名包含文档名、导出类型和日期。
- App 将 `currentDocument.name` 传入 Notes export 面板。
- 缺少文档名时继续 fallback 到 `documentId`。

命令：

- RED：`npm run test -- src/ArtifactPanel.test.jsx` -> failed，下载文件名仍为 `vibereader-doc-1-...`。
- GREEN：`npm run test -- src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx` -> pass（2 files / 22 tests）。
- `npm run test` -> pass（49 files / 250 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（19 storage tests + 1 command test）。

遗留风险：

- 文件名日期来自本地前端时区，尚未接 Rust export payload 的 exported timestamp。

## 2026-06-11 Phase 27：Reading Note Source Links

改动：

- 新增 `tasks/bdd-tdd-reading-note-source-links.md`。
- Reading Note Markdown 中的 source refs 从纯文本改为 Markdown 链接。
- 导出文末新增 `## Sources` 区块。
- Sources 区块包含稳定 HTML anchor 和原文摘录，并按 anchor 去重。

命令：

- RED：`cargo test --test storage_core reading_note_export_renders_artifact_body_and_source_refs` -> failed，缺少 Markdown source 链接。
- GREEN：`cargo test --test storage_core reading_note_export_renders_artifact_body_and_source_refs` -> pass（1 test）。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（19 storage tests + 1 command test）。
- `npm run test` -> pass（49 files / 248 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。

遗留风险：

- 当前链接是导出 Markdown 内部跳转，还不是 Obsidian 反向打开 VibeReader 的应用深链。

## 2026-06-11 Phase 26：Reading Note Export Source Refs

改动：

- 新增 `tasks/bdd-tdd-reading-note-export-source-refs.md`。
- Rust `export_reading_note` 的 Markdown renderer 解析 `reading_note` artifact 的 `ai_content.body`。
- Markdown 导出显示 `sourceRefs` 的页码和 `paragraphId`。
- 普通 VibeCard 没有 `sourceRefs` 时继续使用已有 page / paragraph fallback。

命令：

- RED：`cargo test --test storage_core reading_note_export_renders_artifact_body_and_source_refs` -> failed，Markdown 未包含 `reading_note` 正文。
- GREEN：`cargo test --test storage_core reading_note_export_renders_artifact_body_and_source_refs` -> pass（1 test）。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（19 storage tests + 1 command test）。
- `npm run test` -> pass（49 files / 248 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。

遗留风险：

- Markdown source refs 目前是文本锚点，尚未做 Obsidian/wiki-link 或应用内深链格式。

## 2026-06-11 Phase 25：Task Result Source Refs

改动：

- 新增 `tasks/bdd-tdd-task-result-source-refs.md`。
- `runReadingAgent` 保留 final model response 中的 `sourceRefs`。
- `runReadingAgentTask` 将 agent `sourceRefs` 写入 succeeded task `result`。
- 本地 `paper_overview_agent` 输出基于 bounded chunks 的 source refs。
- App 保存 task result 到 Notes 时，把 source refs 写入 `reading_note` artifact，并在有来源时标记为 `grounded`。
- `ArtifactPanel` 对 grounded Reading Note 显示来源标签。

命令：

- RED：`npm run test -- src/agent/runtime.test.js` -> failed，runtime 未保留 final response source refs。
- RED：`npm run test -- src/agent/taskRunner.test.js src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx` -> failed，task result 和 reading note artifact 未保留 source refs。
- GREEN：`npm run test -- src/agent/runtime.test.js src/agent/taskRunner.test.js src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx` -> pass（4 files / 32 tests）。
- `npm run test` -> pass（49 files / 248 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（18 storage tests + 1 command test）。
- `git diff --check` -> pass。

遗留风险：

- Reading Note 仍是 task result 级 artifact，还没有合并成完整导出模板或做 markdown source-ref 链接化。

## 2026-06-11 Phase 24：Task Result To Note

改动：

- 新增 `tasks/bdd-tdd-task-result-to-note.md`。
- `TaskStatusPanel` 对有结果内容的 succeeded task 显示 `Save to Notes` 操作。
- `ArtifactPanel` 支持 `reading_note` artifact 类型，显示标题和正文。
- App 将当前文档的 Agent task result 保存为 `reading_note` artifact，并切到 Notes/Artifacts 面板。
- 空结果 task 不显示保存入口，避免生成无内容 Notes。

命令：

- RED：`npm run test -- src/TaskStatusPanel.test.jsx src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx` -> failed，缺少保存入口、Reading Note 展示和 App artifact 创建。
- GREEN：`npm run test -- src/TaskStatusPanel.test.jsx src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx` -> pass（3 files / 31 tests）。
- `npm run test -- src/agent/taskRunner.test.js src/TaskStatusPanel.test.jsx src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx` -> pass（4 files / 37 tests）。
- `npm run test` -> pass（49 files / 246 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（18 storage tests + 1 command test）。
- `git diff --check` -> pass。

遗留风险：

- 保存的是 task result 的纯文本正文，还没有做 Markdown 展开、source refs 注入或完整阅读笔记模板合并。

## 2026-06-11 Phase 23：Task Result Preview

改动：

- 新增 `tasks/bdd-tdd-task-result-preview.md`。
- `TaskStatusPanel` 对 succeeded task 显示 `result.content` / `summary` / `text` 短预览。
- 长结果预览有长度上限并显示省略号。
- 没有结果内容时不显示空预览容器。

命令：

- RED：`npm run test -- src/TaskStatusPanel.test.jsx` -> failed，缺少 `.task-status-result`。
- GREEN：`npm run test -- src/TaskStatusPanel.test.jsx` -> pass（1 file / 10 tests）。
- `npm run test -- src/agent/taskRunner.test.js src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` -> pass（3 files / 22 tests）。
- `npm run test` -> pass（49 files / 242 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（18 storage tests + 1 command test）。
- `git diff --check` -> pass。
- Playwright localhost smoke -> pass，`http://127.0.0.1:3217/` 可见 `VibeReader Dev` 和 `Tasks`。

遗留风险：

- 预览是纯文本短摘要，还没有 Markdown 展开、保存到 Notes、转 VibeCard 或 source refs 点击。

## 2026-06-11 Phase 22：Paper Overview Agent Entry

改动：

- 新增 `tasks/bdd-tdd-paper-overview-agent-entry.md`。
- `TaskStatusPanel` 在当前文档存在时显示 `Paper overview` 启动按钮。
- App 从 Tasks 面板启动当前文档的 `paper_overview_agent`。
- `paper_overview_agent` 使用现有 `runReadingAgentTask` 写入 task lifecycle。
- 本地 deterministic paper overview model 调用 `get_current_document` / `get_document_chunks` 两个只读工具。
- `paper_overview_agent` retry 会重建当前文档 runtime options。
- `runReadingAgentTask` 保留调用方提供的可序列化 `payload.agentOptions`，避免把函数和 tool closure 写入持久 payload。

命令：

- RED：`npm run test -- src/agent/taskRunner.test.js src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` -> failed，缺少 `Paper overview` 按钮、App 未调用 `runReadingAgentTask`、runtime options 覆盖 serialized payload。
- GREEN：`npm run test -- src/agent/taskRunner.test.js src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` -> pass（3 files / 20 tests）。
- `npm run test` -> pass（49 files / 240 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（18 storage tests + 1 command test）。
- `git diff --check` -> pass。

遗留风险：

- 这是本地 deterministic agent entry，还不是云模型 planner。
- Agent 结果只进入 task record，尚未生成 VibeCard / Note / source refs artifact。

## 2026-06-11 Phase 21：Agent Task UI Retry

改动：

- 新增 `tasks/bdd-tdd-agent-task-ui-retry.md`。
- `TaskStatusPanel` 对 failed / cancelled 的 `_agent` task 显示 Retry。
- App 对当前文档的 `_agent` task 调用 `retryReadingAgentTask(task)`。
- `source_index` retry 继续走 `indexDocumentSourceSpans(currentDocument)`。

命令：

- RED：`npm run test -- src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` -> failed，Agent task 不显示 Retry，App 未调用 `retryReadingAgentTask`。
- GREEN：`npm run test -- src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` -> pass（2 files / 11 tests）。
- `npm run test` -> pass（49 files / 236 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（18 storage tests + 1 command test）。
- `git diff --check` -> pass。

遗留风险：

- 这里接的是 retry 执行入口，还没有做用户创建 Agent task 的入口或 planner。

## 2026-06-11 Phase 20：Retryable Agent Task Payload

改动：

- 新增 `tasks/bdd-tdd-agent-task-retry-payload.md`。
- `runReadingAgentTask` 保存 `payload.agentOptions`，同时保留已有 payload 字段。
- 新增 `retryReadingAgentTask`。
- `retryReadingAgentTask` 可从 `payload` 或 `payloadJson` 解析 agent options，复用原 task identity 重跑。
- 缺少 agent options 时抛出明确错误。

命令：

- RED：`npm run test -- src/agent/taskRunner.test.js src/agent/index.test.js` -> failed，未保存 `payload.agentOptions`，缺少 `retryReadingAgentTask` 和公共导出。
- GREEN：`npm run test -- src/agent/taskRunner.test.js src/agent/index.test.js` -> pass（2 files / 6 tests）。
- `npm run test -- src/agent/tools.test.js src/agent/permissions.test.js src/agent/runtime.test.js src/agent/taskRunner.test.js src/agent/index.test.js` -> pass（5 files / 27 tests）。
- `npm run test` -> pass（49 files / 234 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（18 storage tests + 1 command test）。
- `git diff --check` -> pass。

遗留风险：

- UI 还没有把 `_agent` task retry 接到这个 helper。

## 2026-06-11 Phase 19：Agent Task Runner

改动：

- 新增 `tasks/bdd-tdd-agent-task-runner.md`。
- 新增 `src/agent/taskRunner.js`。
- `runReadingAgentTask` 会记录 `pending`、`running`、`succeeded` / `failed`。
- Agent 返回非 completed 状态或 runner 抛错时，任务会保存为 `failed` 并保留错误信息。
- `src/agent/index.js` 导出 task runner。

命令：

- RED：`npm run test -- src/agent/taskRunner.test.js src/agent/index.test.js` -> failed，缺少 `taskRunner` 模块和公共导出。
- GREEN：`npm run test -- src/agent/taskRunner.test.js src/agent/index.test.js` -> pass（2 files / 4 tests）。
- `npm run test -- src/agent/tools.test.js src/agent/permissions.test.js src/agent/runtime.test.js src/agent/taskRunner.test.js src/agent/index.test.js` -> pass（5 files / 25 tests）。
- `npm run test` -> pass（49 files / 232 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（18 storage tests + 1 command test）。
- `git diff --check` -> pass。

遗留风险：

- task runner 还没有接 UI planner、retry/cancel UX 或 streaming progress event。

## 2026-06-11 Phase 18：Permission-gated PRD Write Tools

改动：

- 新增 `tasks/bdd-tdd-reading-tool-registry-gated-writes.md`。
- `createReadingTools` 暴露 `list_attention_insights`、`create_vibecard`、`create_annotation`、`export_note`。
- `list_attention_insights` 是只读工具并默认允许。
- `create_vibecard`、`create_annotation`、`export_note` 默认拒绝，必须同时进入 `allowedTools` 且打开对应能力 flag。
- 写入/导出工具只委托 adapter；缺少 adapter 时抛出明确错误。

命令：

- RED：`npm run test -- src/agent/tools.test.js src/agent/permissions.test.js` -> failed，缺少 PRD 写入/导出工具函数、registry entries 和权限 flags。
- GREEN：`npm run test -- src/agent/tools.test.js src/agent/permissions.test.js` -> pass（2 files / 16 tests）。
- `npm run test -- src/agent/tools.test.js src/agent/permissions.test.js src/agent/runtime.test.js src/agent/index.test.js` -> pass（4 files / 22 tests）。
- `npm run test` -> pass（48 files / 229 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（18 storage tests + 1 command test）。
- `git diff --check` -> pass。

遗留风险：

- 这些工具还没有接真实 Agent planner。
- 写入权限 UX、任务审计日志和可恢复 execution record 仍未完成。

## 2026-06-11 Phase 17：PRD Reading Tool Registry

改动：

- 新增 `tasks/bdd-tdd-reading-tool-registry-prd-names.md`。
- `createReadingTools` 暴露 PRD 可读工具名：`get_current_document`、`get_page_text`、`search_document`、`get_document_chunks`。
- 保留既有 legacy 工具：`extractText`、`navigatePage`、`listAnnotations`。
- `get_current_document` 只返回文档 metadata，不返回全文或 pages。
- 默认权限允许 PRD 读工具，继续拒绝 `create_vibecard`、`create_annotation`、`export_note`。

命令：

- RED：`npm run test -- src/agent/tools.test.js src/agent/permissions.test.js` -> failed，缺少 PRD 工具函数、registry entries 和默认权限项。
- GREEN：`npm run test -- src/agent/tools.test.js src/agent/permissions.test.js` -> pass（2 files / 12 tests）。
- `npm run test -- src/agent/tools.test.js src/agent/permissions.test.js src/agent/runtime.test.js src/agent/index.test.js` -> pass（4 files / 18 tests）。
- `npm run test` -> pass（48 files / 225 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass（18 storage tests + 1 command test）。
- `git diff --check` -> pass。

遗留风险：

- 写入型工具、note export、Agent planner、Rust task executor 仍未接入。

## 2026-05-23 规划接力

背景：

- 前一轮 Antigravity CLI 在写 Codex 计划时多次中断。
- 本轮已重新确认本地代码状态，并将计划拆成多个稳定文件落盘。

已确认：

- 主开发目录是 `/Users/mahaoxuan/Desktop/ai-chat-standalone`。
- 旧 Zotero fork `/Users/mahaoxuan/Desktop/黑客松/Vibero` 不再作为主线。
- 当前目录不是 git 仓库。
- `npm run build` 已通过。
- 构建警告：主 bundle 约 2.43 MiB，webpack 提示体积过大。

新增文档：

- `docs/CODEX_IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_AND_QA.md`
- `docs/CODEX_HANDOFF_PROMPT.md`
- `tasks/todo.md`

下一步：

1. 从 Tauri v2 + Vite 迁移开始。
2. 每完成一个阶段更新本日志和 `tasks/todo.md`。

## 2026-05-23 Phase 0 验收

改动：

- 新增 `.gitignore`，排除 `node_modules/`、`dist/`、`src-tauri/target/`、本地环境文件和编辑器状态。
- 在 `/Users/mahaoxuan/Desktop/ai-chat-standalone` 初始化 git。
- 创建本地基线提交 `e6ea59f`。

命令：

- `npm run build` -> pass，webpack 编译成功，有 bundle size warning。
- `git status` -> 可用。

遗留风险：

- Tauri runtime 尚未初始化。
- 当前仍是 webpack 构建，Phase 1 需要迁移到 Vite。

## 2026-05-23 Phase 1/2 执行

改动：

- 将前端构建从 webpack 迁移到 Vite。
- 初始化 Tauri v2：应用名 `Vibero`，bundle id `cn.yishuziyu.vibero`，窗口尺寸 `1280x820`，最小尺寸 `960x640`。
- 添加 Tauri dialog/fs 插件，并生成 Tauri 图标资源。
- 新增 `src/services/documentService.js`，统一识别 PDF/Markdown/HTML/Text 文档，并在 Tauri 环境打开系统文件选择器。
- 新增 `src/store/documentStore.js`，记录当前文档、文档列表和 active document id。
- 更新 `src/App.jsx`：侧边栏文件入口优先使用 Tauri 文件选择器，浏览器环境回退到隐藏文件 input；PDF 解析成功后结束 parsing 状态并切到 PDF 面板。
- 更新 Tauri capability：保留 `fs:default`，追加 `fs:allow-read-file` 和 `fs:allow-read-text-file`。

命令：

- `npm run build` -> pass，Vite 构建成功，仍有单 chunk 大于 500 kB 的体积警告。
- `cd src-tauri && cargo check` -> pass。
- `npm run tauri:dev` -> pass，桌面应用进程 `target/debug/vibero` 成功启动。
- `npm run tauri -- info` -> pass，Tauri 2.11.2 / Vite / React 识别正常；提示未安装完整 Xcode 和 rustup。
- `npm run dev` + `curl -fsS http://127.0.0.1:3000/` -> pass，Vite dev entry 可访问。

手工验收：

- A1 Web 构建：pass。
- A2 Tauri 启动：pass。
- A3 本地 PDF 打开：代码链路已接入，真实文件选择与解析还需要在桌面窗口中手工跑一遍。
- A4 PDF 翻页缩放：未在本轮手工验证。
- A5 选区注入 AI：未在本轮手工验证。

遗留风险：

- PDF.js worker 仍来自 CDN，离线打开 PDF 不是稳定保证。
- 主前端 bundle 约 2.27 MB，后续需要 code splitting。
- Tauri 环境可用 Homebrew Rust 构建，但 `tauri info` 提示更推荐 rustup；打包发布前应补齐正式 macOS 工具链检查。

## 2026-05-23 Phase 2 PDF 可视渲染修复

问题：

- 真实手工打开文件时，曾选择到一个名字以 `.pdf` 结尾的目录：`/Users/mahaoxuan/Downloads/故事》罗伯特麦基-著 21.55.20.pdf`。
- 旧逻辑只看扩展名，可能把目录当成 PDF 或文本文件继续读取。
- PDF 文本解析成功后，视觉阅读器出现空白页风险；原因是 `pdfService` 把同一份二进制传给文本解析和 `PdfViewer` 复用，pdf.js 可能消费/转移该 buffer。

改动：

- `documentService` 规范化 Tauri dialog 返回值，并用 `stat(path)` 判断是否为目录。
- Tauri capability 新增 `fs:allow-stat`。
- `pdfService` 为文本解析和视觉阅读器分别创建独立 `Uint8Array` 副本。
- `PdfViewer` 在加载 PDF 时再次复制传入数据，避免后续渲染拿到被消费的 buffer。

命令：

- `npm run build` -> pass。
- `cd src-tauri && cargo check` -> pass。
- `npm run tauri:dev` -> pass，桌面应用重新启动成功。

手工验收建议：

- 不要选择名字以 `.pdf` 结尾的目录。
- 使用真实文件，例如 `/Users/mahaoxuan/Desktop/黑客松/Vibero/test/tests/data/wonderland_short.pdf`。

## 2026-05-23 运行面去混淆

背景：

- 用户指出旧 Hackathon 目录、旧 `_apps/Vibero.app` 和当前独立开发目录容易混淆。
- 当前后续开发主线应明确锁定 `/Users/mahaoxuan/Desktop/ai-chat-standalone`。

改动：

- 当前 Tauri 开发版窗口标题改为 `VibeReader Standalone Dev`。
- Tauri product name 改为 `VibeReader`，bundle identifier 改为 `cn.yishuziyu.vibereader`。
- Rust package / debug binary 改为 `vibereader`，避免进程名继续显示为旧 `vibero`。
- NPM package name 改为 `vibereader-desktop`。
- Vite/Tauri dev server 固定到 `http://127.0.0.1:3217`，避免误连其他项目占用的 3000 端口。
- 侧边栏标题改为 `VibeReader Dev`。
- 新增 `PROJECT_MAP.md`，记录当前主线、历史表面和 PDF 验收目标。

下一步：

1. 运行 `npm run build`、`cd src-tauri && cargo check`、`npm run tauri -- info`。
2. 启动 `npm run tauri:dev`，确认窗口和进程均为 VibeReader。
3. 使用真实 PDF 文件完成视觉渲染验收后，再进入 Phase 3 双栏工作台。

## 2026-05-23 真实 PDF 可视验收

验收文件：

- `/Users/mahaoxuan/Desktop/黑客松/Vibero/test/tests/data/wonderland_short.pdf`

结果：

- 页面标题为 `VibeReader Standalone Dev`。
- PDF 状态显示 `PDF 已加载，共 29 页`。
- 文本层包含 `Alice in Wonderland` / `Project Gutenberg` 内容。
- 页面存在 1 个 PDF canvas，尺寸为 612x792。
- canvas 像素采样到 613 个非白样本，确认不是空白页。
- 控制台未采集到相关 error/warn。
- 截图保存在 `/tmp/vibereader-pdf-qa.png`。

结论：

- Phase 2 PDF 解析与可视渲染验收通过。
- 可以进入 Phase 3 双栏工作台改造。

## 2026-05-23 Phase 3 双栏工作台

改动：

- 主内容区改为左侧 PDF 阅读器、右侧 AI 工具区的双栏工作台。
- 右侧 AI 工具区保留 Chat / Summary / Flashcard / MindMap Tabs。
- 新增可拖拽分隔线，宽度比例持久化到 `uiStore`。
- 小窗口下切换为上下堆叠，避免横向挤压。
- PDF 上传后保持右侧 Chat，不再把主内容区互斥切到 PDF Tab。

验收：

- `npm run build` -> pass，仍有既有 bundle size warning。
- 真实 PDF 加载后，左侧阅读器与右侧 AI 面板同时可见。
- 拖拽分隔线后，阅读器宽度从 666.8px 调整到 551px，右侧 AI 面板扩展到 589px。
- PDF canvas 仍为 612x792，采样到 613 个非白像素样本。
- 820px 窄屏下自动上下堆叠，无横向溢出。
- 截图：`/tmp/vibereader-dual-pane-qa.png`、`/tmp/vibereader-dual-pane-narrow-qa.png`。

遗留风险：

- PDF 选区注入仍需在真实鼠标选中文本场景中手工验收。

## 2026-05-23 Phase 4 Stop generating + PDF 选区注入验收

BDD/TDD：

- 新增 `tasks/bdd-tdd-phase4.md`，固定 Stop generating 与 PDF 选区注入的 Given / When / Then 行为。
- 新增 Vitest + Testing Library 测试底座。
- 红灯结果：`aiService.chatStream` 未向 `fetch` 传入 `AbortSignal`；AbortError 会抛出并丢失 partial 内容；loading 状态下 `ChatInput` 没有 Stop 控件。
- 绿灯结果：`npm run test` 通过，2 个测试文件共 3 个测试通过。

改动：

- `aiService.chatStream` 支持 `options.signal`，AbortError 返回 `{ interrupted: true, aborted: true, fullMessage }`，不再抛成硬失败。
- `App` 为每次发送创建独立 `AbortController`，Stop 只取消当前请求。
- `ChatInput` 的发送按钮拆成 `ChatSubmitControl`，loading 时显示 Stop。

验收：

- `npm run test` -> pass。
- `npm run build` -> pass，仍有既有 bundle size warning。
- `cd src-tauri && cargo check` -> pass。
- 真实 PDF 选区注入：通过 CDP 在 `wonderland_short.pdf` 中选中 `Project` 并点击注入，右侧 Chat 出现 `基于以下论文内容： Project`，左侧阅读器仍可见，截图 `/tmp/vibereader-phase4-qa.png`。

遗留风险：

- 当前模型请求在本机返回 `Failed to fetch`，真实长回复 Stop 需要使用有效 API 配置做一次手工验收。

## 2026-05-23 模型配置迁移

结果：

- 当前 Tauri 主线 `VibeReader Standalone Dev` 的 WebKit localStorage 已写入可用 MiniMax Token Plan 配置。
- 写入目标：`~/Library/WebKit/vibereader/.../LocalStorage/localstorage.sqlite3`。
- 写入前备份：`localstorage.sqlite3.bak-20260523160540`。
- 选中配置：`vibereader-minimax-token-plan`。
- 模型：`MiniMax-M2.7`。
- Base URL：`https://api.minimaxi.com/anthropic`。
- 协议：Anthropic 兼容。

验证：

- 回读 localStorage 确认 `ai-chat.modelConfigs` 包含 MiniMax 配置，`ai-chat.selectedConfigId` 指向该配置。
- 使用同一 key 直接请求 `https://api.minimaxi.com/anthropic/v1/messages`，`MiniMax-M2.7` 返回 HTTP 200。
- 旧 Codex 备份中的另一枚 MiniMax key 返回 HTTP 401，未迁入。
- `npx vitest run --environment jsdom --pool=threads --testTimeout=30000` -> pass，2 个测试文件 / 3 个测试通过。
- `npm run build` -> pass，仍有既有 chunk size warning。
- `cd src-tauri && cargo check` -> pass。

遗留风险：

- 未找到可复用的 Kimi/Moonshot API key；旧网页运行面只有 `trial-kimi-priority` 标记，不是当前 VibeReader 可直接调用的 API 配置。
- 如果迁移时 VibeReader 窗口已经打开，WebKit 可能仍持有旧 localStorage 缓存；重启 VibeReader 后会读取已写入的配置。

## 2026-05-23 Phase 5 Markdown/Text/HTML 通用阅读

BDD/TDD：

- 新增 `tasks/bdd-tdd-phase5.md`，固定 Markdown、Text、HTML 安全读取和选区注入四个行为。
- 红灯结果：缺少 `DocumentReader`、`fileToDocumentWithContent`、`sanitizeHtmlToText`。
- 绿灯结果：`npm run test -- src/services/documentService.test.js src/DocumentReader.test.jsx` 通过，2 个测试文件共 6 个测试通过。

改动：

- 新增 `src/DocumentReader.jsx`，用于 Markdown/Text/HTML 文档阅读。
- `src/services/documentService.js` 增加非 PDF 文档读取和 HTML 安全正文提取。
- `src/App.jsx` 的打开文件入口从 PDF-only 升级为 PDF + Markdown + Text + HTML，并保留 PDF 原链路。
- `src/styles.css` 增加通用文档阅读器样式。

验收：

- `npm run test` -> pass，4 个测试文件共 9 个测试通过。
- `npm run build` -> pass，仍有既有 chunk size warning。
- 通过 CDP 在 `http://127.0.0.1:3217/` 灌入 `/tmp/vibereader-phase5/sample.md`、`sample.txt`、`sample.html`。
- Markdown/Text/HTML 均在左侧阅读器显示。
- HTML 验收结果：标题和正文可见，script/style 文本不可见，`window.__vibereader_hacked` 未被设置。
- Markdown 选区注入后右侧 Chat 出现 document context 用户消息。
- 截图：`/tmp/vibereader-phase5-qa.png`。

遗留风险：

- Summary/Flashcard/MindMap 仍复用 `pdfStore.pdfText` 命名，行为可用但命名已经不准确；Phase 6/7 前建议重命名为通用 `documentText`。

## 2026-05-23 Phase 6 PDF 大纲与最小批注

BDD/TDD：

- 新增 `tasks/bdd-tdd-phase6.md`，固定 PDF 大纲、无大纲降级、高亮、笔记、批注持久化五个行为。
- 第一轮红灯：缺少 `annotationService`。
- 第二轮红灯：缺少 `PdfAnnotationToolbar`。
- 第三轮红灯：缺少 `pdfOutline`。
- 绿灯结果：`npm run test` 通过，7 个测试文件共 15 个测试通过。

改动：

- 新增 `src/services/annotationService.js`，提供本地批注创建、读取、清理接口。
- 新增 `src/PdfAnnotationToolbar.jsx`，把 PDF 选区操作扩展为“注入 AI / 高亮 / 保存笔记”。
- 新增 `src/pdfOutline.js`，处理 PDF outline 扁平化和 destination 到页码的解析。
- `src/PdfViewer.jsx` 接入大纲条、点击跳页、批注保存和批注列表。
- `src/App.jsx` 将当前 PDF 文档 ID 传给 `PdfViewer`，用于批注归属。

验收：

- `npm run test` -> pass，7 个测试文件 / 15 个测试。
- `npm run build` -> pass，仍有既有 chunk size warning。
- `cd src-tauri && cargo check` -> pass。
- 使用 ReportLab 在 `/tmp/vibereader-phase6-outline.pdf` 生成 3 页带书签 PDF，并用 pdf.js 确认 outline 标题为 Introduction / Methods / Findings。
- CDP 浏览器验收：上传该 PDF 后大纲显示，点击 Methods 后页码输入框变为 2。
- 在第 2 页文本层选中 `This is page 2...` 后，保存高亮和 `QA note` 笔记。
- 回读 `localStorage.vibereader.annotations`：2 条批注，包含 page=2 的 yellow highlight 和 note=`QA note`。
- 截图：`/tmp/vibereader-phase6-qa.png`。

遗留风险：

- 批注第一版只持久化到本地存储并在列表中展示，不写回 PDF，也不在 canvas/text layer 上复原高亮 overlay。
- 批注服务当前用 localStorage，适合 hackathon MVP；如果批注规模变大，应迁移到 IndexedDB object store。

## 2026-05-23 Phase 7 演示闭环与最终 QA

BDD/TDD：

- 新增 `tasks/bdd-tdd-phase7.md`，固定演示资产自包含、本地 PDF worker、3 分钟/8 分钟演示脚本和失败备用路径。
- 红灯结果：演示资产测试缺少稳定仓库内文件；PDF worker 测试暴露旧配置依赖 CDN；真实 Playwright 验收暴露 PDF 笔记输入会触发 `selectionchange` 清掉工具栏。
- 绿灯结果：`npm run test` 通过，11 个测试文件共 23 个测试通过。

改动：

- 新增 `demo-assets/`，包含 `outline-demo.pdf`、`wonderland_short.pdf`、`sample.md`、`sample.txt`、`sample.html`、`demo-fallback-answer.md` 和说明文件。
- 新增 `docs/DEMO_SCRIPT.md`，覆盖 3 分钟脚本、8 分钟脚本、AI API 失败备用路径和验收清单。
- 新增 `src/pdfWorker.js`，让 `pdfService` 与 `PdfViewer` 使用 Vite/Tauri 本地打包的 `pdf.worker.min.mjs`，构建产物已包含 `dist/assets/pdf.worker.min-*.mjs`。
- 新增 `src/aiEndpoint.js` 与 Vite `/api/minimax` dev proxy，本地开发环境把 MiniMax Anthropic 兼容请求改走同源代理，避免浏览器 CORS 预检失败。
- 新增 `src/pdfSelection.js`，修复焦点进入 PDF 批注工具栏时选区被清空、导致笔记按钮消失的问题。

验收：

- `npm run test` -> pass，11 个测试文件 / 23 个测试。
- `npm run build` -> pass，仍有既有 chunk size warning；本地 PDF worker 已进入 `dist/assets/`。
- `cd src-tauri && cargo check` -> pass。
- `npx tauri dev --no-watch --config '{"build":{"beforeDevCommand":""}}'` -> pass，`target/debug/vibereader` 成功启动；验证后已手动停止。
- Playwright 真实闭环：在 `http://127.0.0.1:3217/` 打开应用，上传 `demo-assets/outline-demo.pdf`，大纲显示 Introduction / Methods / Findings，点击 Methods 后页码为 2。
- PDF 批注验收：第 2 页保存高亮和 `Phase 7 QA note` 笔记，`localStorage.vibereader.annotations` 为 2 条，批注列表显示 P2 和笔记。
- Markdown 验收：上传 `demo-assets/sample.md`，选中 `The important design decision...` 段落并注入 AI，右侧 Chat 收到文档上下文。
- AI/Stop 验收：Playwright 从本机 `~/.mmx/config.json` 临时注入 MiniMax Token Plan 配置，发送长回复请求后点击 Stop，loading 恢复为 Send，页面无 `Failed to fetch` / `login fail`，控制台错误列表为空。API key 未写入 git 或文档。
- 最终截图：`/tmp/vibereader-phase7-qa.png`。

遗留风险：

- 当前 Vite dev proxy 解决的是本地开发和 Tauri dev 演示面；正式打包发布前仍应实现 Tauri 侧 HTTP/proxy 能力或部署 `proxy/api/minimax.js`，否则生产包直连部分模型可能再次遇到 CORS。
- 仍有既有主 bundle 大于 500 kB warning；不阻塞 hackathon demo，但发布前应做 code splitting。
- 批注仍不写回 PDF 文件，也不复原页面 overlay；当前只保证本地列表持久化。

## 2026-05-23 gstack 规范对齐规划

来源：

- `/Users/mahaoxuan/gstack/AGENTS.md`
- `/Users/mahaoxuan/gstack/ETHOS.md`
- `/Users/mahaoxuan/gstack/SKILL.md`
- `/Users/mahaoxuan/gstack/plan-eng-review/SKILL.md`
- `/Users/mahaoxuan/gstack/qa/SKILL.md`
- `/Users/mahaoxuan/gstack/review/checklist.md`
- `/Users/mahaoxuan/gstack/review/TODOS-format.md`
- `/Users/mahaoxuan/gstack/qa/references/issue-taxonomy.md`

落地：

- 新增 `docs/GSTACK_ALIGNMENT.md`，把 gstack 的 Boil the Lake、Search Before Building、User Sovereignty、两轮 pre-landing review、QA taxonomy 和 release gate 转成 VibeReader 本地规则。
- 新增 `tasks/gstack-backlog.md`，按 gstack TODO 格式整理发布硬化 backlog。
- 新增 `tasks/bdd-tdd-phase8.md`，把发布硬化拆成可转测试的 Given/When/Then 行为。
- 新增 `docs/superpowers/plans/2026-05-23-vibereader-gstack-roadmap.md`，作为 Superpowers 可执行计划。
- 更新 `tasks/todo.md` 标题为 VibeReader，并新增 Phase 8：gstack 对齐后的发布硬化。

下一阶段：

- 按 `tasks/bdd-tdd-phase8.md` 先写红灯测试，再实现最小代码改动。
- 不扩大到 EPUB、PDF 写回或移动端。

验证：

- 本次只改文档和任务跟踪，不改运行时代码。

## 2026-05-23 Phase 8 发布硬化启动

BDD/TDD：

- `tasks/bdd-tdd-phase8.md` 已固定缺少配置、坏 key/ provider 拒绝、生产包 endpoint、Stop regression、多文档隔离和无密钥 smoke 六个行为。
- 新增 `src/modelConfigGuard.test.js`，覆盖缺少配置、缺少 API key、缺少 base URL、缺少模型名和 Anthropic-compatible 配置归一化。

改动：

- 新增 `src/modelConfigGuard.js`，提供 `validateRunnableModelConfig(config)`。
- `src/App.jsx` 在发送前调用配置 guard；校验失败时显示可读错误并且不进入 loading/request 流程。
- 新增 `scripts/qa-smoke.mjs`，作为 Phase 8 smoke 自动化入口；无 live key 时输出 `SKIPPED_LIVE_AI`。
- `package.json` 新增 `npm run qa:smoke`。

当前限制：

- `qa:smoke` 需要 Playwright 依赖；当前项目尚未安装 Playwright，因此脚本会明确报依赖缺失并退出非零。
- MiniMax 生产包通信路径仍是 P0 未完成项；当前只确认 dev proxy 和 Tauri/release 风险边界。

## 2026-05-28 Phase 8 Tauri 原生 HTTP 迁移

背景：

- Phase 7 遗留风险：生产包依赖 Vite dev proxy 解决 CORS，正式桌面包外发后 AI 请求会失效。
- 目标：Tauri 运行时使用 `@tauri-apps/plugin-http` 原生 HTTP 客户端，100% 绕过浏览器 CORS，不再依赖云端 edge function 或 Vite dev proxy。

改动：

- 新增 `src/tauriHttp.js`，封装 `@tauri-apps/plugin-http` 的流式 POST 请求，返回 `ReadableStream<Uint8Array>` 保持与浏览器 fetch SSE 解析兼容。
- 修改 `src/aiService.js`：`chatStream` 在 `isTauriRuntime()` 为 true 时走 `tauriChatStream`（直接请求完整 endpoint），否则走浏览器 `fetch`（仍经过 `resolveAiEndpointForRuntime` 和 Vite dev proxy）。
- 修改 `src/aiEndpoint.js`：新增 `shouldUseDevProxy()` 显式判断浏览器本地开发何时需要 Vite proxy。
- `src-tauri/Cargo.toml`：新增依赖 `tauri-plugin-http = “2”`。
- `src-tauri/src/lib.rs`：Builder 链追加 `.plugin(tauri_plugin_http::init())`。
- `src-tauri/capabilities/default.json`：权限数组追加 `”http:default”`。
- `package.json`：新增 `@tauri-apps/plugin-http@^2`（通过 `npm install` 自动写入）。

验证：

- `cd src-tauri && cargo check` -> pass，tauri-plugin-http v2.5.9 成功编译。
- `npm run test` -> pass，14 个测试文件共 48 个测试通过（含原有 33 个 + 新增配置 guard / endpoint / abort 测试）。
- `npm run build` -> pass，既有 bundle size warning 未恶化。
- 无 API key 硬编码；Tauri 运行时直接请求原始 endpoint，不经过本地 dev proxy。

遗留风险：

- Tauri 原生 HTTP 的 SSE 流式响应尚未在真实 MiniMax 长回复场景中手工验收；`tauriChatStream` 返回的 `ReadableStream` 与现有 SSE 解析器接口一致，但真实网络路径需 `npm run tauri:dev` + 有效 key 验证。
- 浏览器 `npm run dev` 路径仍依赖 Vite dev proxy；本地开发不受影响。
- 生产包若用户选择非 MiniMax provider（如直接 OpenAI endpoint），Tauri 原生 HTTP 同样适用，但各 provider 的 CORS 策略不同，需逐个验证。

## 2026-05-27 Agent runtime 映射

背景：

- 针对 Pi / Codex / Claude Code 这类 coding agent 的核心机制，明确 VibeReader 不能只理解为”接入一个大模型就智能”。
- 真正的 agent 能力来自：模型、上下文、工具、循环、权限、记忆和验证的组合。

落地：

- 新增 `docs/AGENT_RUNTIME_MAPPING.md`，把 coding agent harness 映射为 VibeReader 的 reading agent runtime。
- 更新 `tasks/gstack-backlog.md`，加入 `Reading agent runtime skeleton` 架构任务。

关键结论：

- VibeReader 不应照搬 Pi 的代码编辑 agent；应该借鉴其 agent loop 模式。
- VibeReader 的工具边界应是 reading-only：读当前文档、取选区、查大纲、搜索文档、生成摘要/卡片/思维导图、保存批注和 artifact。
- 后续重点是 source span grounding、context packer、bounded reading agent loop 和 artifact-centric UI。

## 2026-05-31 Phase 8 Tauri Stop cancellation regression

背景：

- Rust 架构方向选择 C：保留 Tauri + React，但把桌面端重活和原生能力逐步下沉到 Tauri/native path。
- 现有 Tauri AI 请求已走 `@tauri-apps/plugin-http`，但 Stop generating 的 `AbortSignal` 只覆盖浏览器 `fetch` 路径；桌面请求没有把 signal 传到原生 HTTP 插件。

BDD/TDD：

- 在 `tasks/bdd-tdd-phase8.md` 的“Stop generating 在 provider 路径变化后仍可用”下补充 Tauri 桌面路径约束。
- 扩展 `src/aiService.test.js`，先观察到两个红灯：
  - Tauri native HTTP 调用没有收到 `AbortSignal`。
  - `@tauri-apps/plugin-http` 返回的 `Request cancelled` 被当成普通未知错误，而不是用户主动 Stop 的中断态。

改动：

- `src/aiService.js`：Tauri 分支调用 `tauriChatStream` 时传入 `signal`。
- `src/tauriHttp.js`：把 `signal` 继续传给 `@tauri-apps/plugin-http`。
- `src/aiService.js`：新增 abort-like 错误归一，兼容浏览器 `AbortError` 和 Tauri 插件的 `Request cancelled`。

验证：

- `npm test -- src/aiService.test.js` -> pass，4 tests。
- `npm run test` -> pass，24 files / 102 tests。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo check` -> pass。

## 2026-06-01 gstack product direction for VibeReader

背景：

- 明确 `/Users/mahaoxuan/gstack` 在 VibeReader 中的角色：它是开发治理层，不是运行时依赖。
- 后续开发应使用 gstack 的 office-hours、plan review、QA、review、learn/session intelligence 思路来约束产品方向、工程边界和验收，而不是把 gstack 的技能系统直接搬进 VibeReader。

落地：

- 新增 `docs/GSTACK_PRODUCT_DIRECTION.md`。
- 核心北极星：VibeReader 不是 “PDF + Chat”，而是本地优先的 source-grounded AI reading workbench。
- 固定架构方向：保留 React + Tauri 混合架构；Rust 只下沉 native HTTP、本地索引、SQLite、向量检索等重活，不做纯 Rust GUI 重写。
- 固定 Reading Agent 边界：只开放 reading tools，禁止第一版出现任意文件、shell、后台网页浏览或自动修改源文档能力。
- 新增 Phase 10：Reading Agent Runtime Skeleton，下一步先做 context packer、artifact schema 和一个最小 source-grounded Lens Card。

验证：

- 本次只改文档和任务跟踪。
- `git diff --check` -> pass。

## 2026-06-02 Phase 10.1 Reading Agent artifact schema

背景：

- 按 gstack 产品方向继续推进 Phase 10：Reading Agent Runtime Skeleton。
- 现有 `src/agent/` 已经有 context packer、reading-only tools、permissions 和 bounded runtime；本轮不重写已有骨架，只补 source-grounded artifact 契约。

BDD/TDD：

- 新增 `tasks/bdd-tdd-reading-agent.md`，固定选区解释、claim grounding、上下文优先级、工具边界和 runtime 边界行为。
- 新增 `src/agent/artifact.test.js`，先跑出红灯：`./artifact` 模块不存在。

改动：

- 新增 `src/agent/artifact.js`：提供 `createReadingArtifact` 和 `createLensCardArtifact`。
- artifact 保留 `documentId`、`type`、`goal`、`sourceSpanIds`、`modelId`、`createdAt`、`originalContent`、`currentContent`、`verificationStatus`。
- claim 必须包含 `sourceSpanIds` 或显式 `inference=true`，否则拒绝生成 artifact。
- 更新 `src/agent/index.js`，把 artifact schema 纳入 agent 公共出口。
- 同步更新 `tasks/todo.md` 的 Phase 10 状态。

验证：

- `npm test -- src/agent/artifact.test.js src/agent/index.test.js` -> pass，2 files / 4 tests。

旁路调研：

- 用户提出 LiteParse v2 可作为 PDF 解析方向参考。本轮已派 sub agent 独立评估，不阻塞 Phase 10.1；写入范围限制在 `docs/PDF_PARSE_LITEPARSE_EVALUATION.md`。
- 当前 PDF 解析链路确认：文本提取和视觉渲染都走 `pdfjs-dist`；Tauri/Rust 目前只负责本地文件读取、HTTP 和日志插件，没有 Rust PDF 解析命令。
- LiteParse 建议：先做 benchmark/POC，把它作为 Rust/Tauri 后端 source span 解析候选；不直接替换现有 PDF.js viewer。

## 2026-06-02 Phase 10 PDF Lens Card 闭环

BDD/TDD：

- 确认第一条产品闭环为：PDF 选区 -> Lens Card -> 保存 artifact -> 右侧 Artifacts 列表 -> 回到原文。
- 红灯覆盖缺少 artifact 持久化、缺少 Lens Card agent flow、PDF 选区工具条缺少“生成卡片”、右侧 Artifacts 面板缺失。
- 绿灯结果：定向测试 5 个文件 / 10 个用例通过。

改动：

- 新增 `artifactService`，用 `localStorage.vibereader.artifacts` 按 document 隔离保存 artifacts。
- 新增 `generateLensCardArtifact`，复用 context packer，要求 claim 带 `sourceSpanIds` 或 `inference=true`。
- `PdfViewer` 为 PDF 选区生成 `documentId/page/spanId/rect/sourceType`，并支持 `vibereader:navigate-source-span` 回跳高亮。
- `PdfAnnotationToolbar` 新增“生成卡片”入口。
- `App` 复用当前模型配置生成 Lens Card，但用 `includeHistory:false` 避免污染聊天历史；生成后自动切到 Artifacts tab。
- 新增 `ArtifactPanel` 展示 Lens Card、来源标签和“回到原文”按钮。

验收：

- `npm test -- src/services/artifactService.test.js src/agent/lensCard.test.js src/PdfAnnotationToolbar.test.jsx src/ArtifactPanel.test.jsx src/agent/artifact.test.js` -> pass，5 files / 10 tests。
- `npm run test` -> pass，28 files / 111 tests。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo check` -> pass。
- `git diff --check` -> pass。
- Playwright UI smoke -> pass，`http://127.0.0.1:3217/` 页面标题为 `VibeReader Standalone Dev`，Artifacts 空状态可见，console/pageerror 为空，截图 `/tmp/vibereader-artifacts-smoke.png`。

遗留风险：

- 真实模型生成仍依赖用户已配置可用 API key。
- 当前来源回跳以 PDF 页内选区 rect 高亮为主，后续可扩展为更稳定的 PDF text span 精确定位。

## 2026-06-02 PDF 阅读区自适应修复

问题：

- PDF Viewer 加载 PDF 和切换文档时默认 `zoom=1.0`，只在用户手动点击 Fit Width 后才适配阅读栏宽度。
- 分栏或窗口尺寸变化时，没有重新计算 fit-width 画布尺寸，容易出现横向滚动和右侧被裁切。
- Notion 导出的 PDF 透明 text layer 可能出现远大于 canvas 的 `scrollWidth`，触发 Fit Width / ResizeObserver 的宽度反馈，表现为页面反复缩放或抽搐。

改动：

- `PdfViewer` 默认使用 Fit Width。
- 打开 PDF 和切换文档时重置为 Fit Width。
- 增加 `ResizeObserver` 监听阅读栏宽度变化，在 Fit Width 模式下重渲染 PDF。
- 透明 text layer 增加 `overflow: hidden`，防止不可见文本层撑大外层滚动宽度。
- 保留手动放大、缩小、100% reset 和 Fit Width 控件。
- 新增回归测试确认 PDF Viewer 默认显示 `Fit`，并确认 text layer clipping 存在。

验收：

- `npm test -- src/services/documentIsolation.test.jsx` -> pass，1 file / 4 tests。
- `npm run test` -> pass，28 files / 113 tests。
- `npm run build` -> pass，保留既有 chunk size warning。
- `cd src-tauri && cargo check` -> pass。
- `git diff --check` -> pass。
- Playwright PDF smoke -> pass，上传 `demo-assets/outline-demo.pdf` 后默认 `Fit` 可见，canvas 930px <= 滚动容器 962px，外层 `scrollWidth=962`，`hasHorizontalOverflow=false`，console/pageerror 为空，截图 `/tmp/vibereader-fit-width-smoke.png`。
- Playwright 复现 smoke -> pass，上传 `/Users/mahaoxuan/Downloads/欧游notion pdf.pdf` 后 20 次采样 canvas 宽度稳定为 810，外层 `scrollWidth=842/clientWidth=842`，console/pageerror 为空，截图 `/tmp/vibereader-ouyou-notion-repro-final.png`。

## 2026-06-02 项目图标替换

来源：

- 用户下载目录中的 `ChatGPT Image Jun 2, 2026, 03_47_04 PM.png`，与截图中的书本图标一致。

改动：

- 替换 `icons/vibero.png`，用于应用内侧边栏和空状态品牌图。
- 新增 `public/favicon.png`，并在 `index.html` 接入 `rel=icon` 和 `apple-touch-icon`。
- 运行 Tauri icon 生成，覆盖 `src-tauri/icons/` 下 macOS、Windows、iOS、Android 图标资源。

验收：

- `curl -I http://127.0.0.1:3217/favicon.png` -> 200，`Content-Type: image/png`。
- `file public/favicon.png icons/vibero.png src-tauri/icons/icon.icns src-tauri/icons/icon.png` -> favicon/侧边栏图标为 1254x1254 PNG，Tauri icon 为有效 icns / 512x512 PNG。
- `npm run build` -> pass，`dist/index.html` 保留 favicon / apple-touch-icon 链接。

## 2026-06-02 Phase 11 Web 工作区三栏布局

产品决策：

- Web 端先做成真实可用产品，再推进 Tauri App / Rust 强化。
- Skim Map 和 Lens Card 是不同区域：Skim Map 作为阅读纸面的左边注，Lens Cards 放在右侧 Notes。
- 用户纠偏：Skim Map 不能和 Reader 做成两张独立卡片，要像读报纸/文章时在正文旁边做笔记。
- 右侧不再把工程词 `Artifacts` 暴露为用户入口，改为 `Notes`。
- Skim Map 第一版不默认调用 LLM，只保留显式生成入口。

改动：

- 新增 `tasks/bdd-tdd-phase11-web-closure.md`，记录 Web 端三栏布局 BDD。
- 新增 `src/WorkspaceLayout.test.jsx`，覆盖 Skim Map、Reader、Notes 的布局顺序和右侧文案。
- `App.jsx` 新增 `workspace-reading-surface`，把左侧 `Skim Map` 边注和 PDF Reader 合并为同一张阅读纸面，右侧 Notes 承载 Lens Cards。
- 移除右侧“思维树”tab，旧持久化 `mindmap` tab 自动迁移到 Notes，避免更新后空白。
- `ThinkingTreePanel` 支持传入标题、生成按钮和进度文案，并在空文档状态也显示面板标题。
- `styles.css` 增加 reading surface、Skim Map 边注宽度和窄屏堆叠规则；Skim Map / Reader 不再各自拥有独立卡片阴影和外边距。
- `tasks/lessons.md` 记录 Skim Map / Lens Card 分区修正。

验收：

- RED：`npm run test -- src/WorkspaceLayout.test.jsx` 先失败，缺少 `Skim Map` complementary 区域且右侧仍为 `Artifacts`。
- GREEN：`npm run test -- src/WorkspaceLayout.test.jsx src/ThinkingTreePanel.test.jsx` -> pass，2 files / 5 tests。
- 相邻回归：`npm run test -- src/WorkspaceLayout.test.jsx src/ArtifactPanel.test.jsx src/ThinkingTreePanel.test.jsx src/dragInject.test.js` -> pass，4 files / 10 tests。
- 全量：`npm run test` -> pass，29 files / 114 tests。
- 构建：`npm run build` -> pass，保留既有 chunk size warning。
- 格式：`git diff --check` -> pass。
- Playwright Web smoke：`http://127.0.0.1:3217/` 中 Skim Map 和 Reader 共享同一 `workspace-reading-surface`；右侧 tab 包含 `Notes`，不包含 `Artifacts`；Skim Map 标题可见；console/pageerror 为空；截图 `/tmp/vibereader-web-embedded-skim-map.png`。

遗留风险：

- 本切片只覆盖空文档和结构布局；真实 PDF 选区 -> Lens Card -> Notes -> 回到原文的 Web smoke 仍需下一切片继续跑通。
- 窄屏布局有 CSS 降级规则，但尚未做 Playwright 多 viewport 截图验收。

## 2026-06-02 PDF Fit Width 抽搐回归修复

问题：

- 用户上传 `工业机器人应用、制造业就业转移与劳动者健康-蔚金霞.pdf` 后，PDF 页面会持续向放大方向抽搐。
- 诊断采样发现该 PDF 的透明 text layer `scrollWidth=18553`，而 canvas 实际宽度只有 `474`。
- 如果 text layer 或 page shell 参与外层布局，Fit Width 的 ResizeObserver 会收到被渲染结果反向影响的宽度，形成重新测宽 -> 重新渲染 -> 再测宽的反馈风险。

改动：

- `PdfViewer` 新增 `pageScrollRef`，Fit Width 只测量稳定的 PDF 滚动区 `clientWidth`，不再依赖可能被 canvas/text layer 影响的根容器宽度。
- 新增 `pageBoxSize`，由 pdf.js viewport 直接驱动 page shell 的固定宽高。
- page shell 设置 `overflow: hidden` 和 `contain: layout paint size`，透明 text layer 设置同样 containment，并限制 max width/height。
- 扩展 `documentIsolation.test.jsx`，断言 text layer 和 page shell 都被 layout/paint/size containment 隔离。

验收：

- `npm run test -- src/services/documentIsolation.test.jsx` -> pass，1 file / 4 tests。
- Playwright PDF smoke：上传 `/Users/mahaoxuan/Desktop/学术road/工业机器人应用、制造业就业转移与劳动者健康-蔚金霞.pdf` 后 40 次采样，canvas 宽度恒定 `474`，page shell 宽度恒定 `474`，scroll area `scrollWidth` 恒定 `506`，console/pageerror 为空；截图 `/tmp/vibereader-industrial-robot-fit-debug.png`。
- `npm run test` -> pass，29 files / 114 tests。
- `npm run build` -> pass，保留既有 chunk size warning。
- `git diff --check` -> pass。

遗留风险：

- 当前 smoke 覆盖桌面 viewport；窄屏、多浏览器缩放比例下的 Fit Width 稳定性仍需纳入后续 viewport QA。

## 2026-06-02 PDF 划词体验修复

问题：

- 用户反馈 PDF 划词体验很糟糕。
- 真实鼠标拖拽复现发现，选区会混入侧栏、Workspace 标题和 Skim Map 文本。
- 坐标诊断发现部分透明 text span 的命中宽度被拉到几千到上万像素，超出 PDF 页面边界，导致浏览器原生 selection 扫到阅读器外的 UI 文本。

参考方向：

- 对照成熟开源 PDF 阅读器模式：PDF text layer 只负责原生文字选择；选中后的高亮、按钮、提示使用 overlay；选区判定围绕 text layer / selection region，而不是外层工作台。
- 当前切片只嫁接交互结构，不引入新 PDF viewer 依赖，不改变现有 Lens Card / 注入 AI / 高亮 / 保存笔记入口。

改动：

- 新增 `tasks/bdd-tdd-pdf-selection-ux.md`，明确划词优先于段落点击、跨 span 选区有效、工具条不打断选区。
- `pdfSelection` 新增 `isSelectionInsidePdfTextLayer` 和 `didPointerDrag`，避免只检查 `selection.anchorNode`。
- `PdfViewer` 将 selection 判断改为 Range 与 PDF text layer 相交；跨行、跨 span、反向选择都能保留。
- 段落点击增加拖拽/已有选区保护，避免划词动作误触发 `vibereader:select-paragraph`。
- 移除 text layer 的 `draggable`，保留批注列表拖拽，避免原生划词被 drag-start 抢断。
- 约束 PDF text span 的命中盒：按 `item.width * viewport.scale` 计算目标宽度，并用 inline-block/overflow hidden 限制异常超宽 span。
- 工具条坐标改为相对 PDF 滚动区，并按实际工具条宽度 clamp 到可见范围内。

验收：

- RED：`npm run test -- src/pdfSelection.test.js` 先失败，缺少 text layer 交集判断和拖拽判断 helper。
- GREEN：`npm run test -- src/pdfSelection.test.js` -> pass，1 file / 5 tests。
- 定向回归：`npm run test -- src/pdfSelection.test.js src/services/documentIsolation.test.jsx src/PdfAnnotationToolbar.test.jsx src/dragInject.test.js` -> pass，4 files / 13 tests。
- Playwright 真实 PDF 鼠标拖拽：上传 `/Users/mahaoxuan/Desktop/学术road/工业机器人应用、制造业就业转移与劳动者健康-蔚金霞.pdf` 后，选中 160 字纯 PDF 正文，不混入 `VibeReader Dev`、`Sessions`、`Workspace`、`Skim Map`；工具条在 PDF 滚动区内；异常超宽 text span 数量为 0；console/pageerror 为空；截图 `/tmp/vibereader-pdf-selection-drag.png`。
- `npm run test` -> pass，29 files / 117 tests。
- `npm run build` -> pass，保留既有 chunk size warning。
- `git diff --check` -> pass。

遗留风险：

- 本切片验证了真实桌面 viewport 的 PDF 划词；窄屏和浏览器缩放比例下的划词工具条位置仍应纳入后续 viewport QA。

## 2026-06-02 PDF 当前页 OCR 入口

产品规则：

- 非纯文字 PDF 不再直接进入“无法提取 PDF text”的空状态；只要 PDF.js 能渲染 canvas，用户就能先读页面。
- OCR 是显式动作：当前页没有可选文字层时显示“识别当前页”，不自动开始识别，也不自动调用 LLM。
- OCR 输出必须进入同一套 source span 体系，包含 `documentId`、`page`、`bbox`、`source=ocr`、`engine`、`confidence`，后续 Lens Card 和回到原文可以复用。

改动：

- 新增 `tasks/bdd-tdd-pdf-ocr-current-page.md`，记录扫描 PDF / 显式 OCR / source span 三条 BDD 行为。
- 新增 `src/ocrSourceSpans.js`，把 OCR words 标准化为 page-bound source spans，并过滤空文本和零面积 bbox。
- 新增 `src/services/ocrService.js`，Web 端使用 `tesseract.js` 的 `createWorker(language)` + `worker.recognize(canvas)`，完成后释放 worker。
- `PdfViewer` 在空文字层 PDF 下仍显示阅读器；当前页无文字层时显示“识别当前页”；OCR 成功后把透明文本 span 叠加进 PDF text layer。
- 新增 `src/services/ocrService.test.js`、`src/ocrSourceSpans.test.js`、`src/PdfOcrCurrentPage.test.jsx`。

验收：

- 定向 OCR 测试：`npm run test -- src/services/ocrService.test.js src/ocrSourceSpans.test.js src/PdfOcrCurrentPage.test.jsx` -> pass，3 files / 5 tests。
- 全量测试：`npm run test` -> pass，32 files / 122 tests。
- 运行时 API 检查：`tesseract.js` 的 `createWorker` 存在。
- 构建：`npm run build` -> pass，保留既有 chunk size warning。
- 格式：`git diff --check` -> pass。

遗留风险：

- 当前只做“当前页 OCR”，不做全文批量 OCR。
- Web 端首次 OCR 需要加载语言数据，速度和离线能力后续再优化；桌面端 LiteParse/Rust 仍是后续增强路线。

## 2026-06-02 PDF 文字层状态反馈

问题：

- 用户上传一份有文字层的 PDF 后，Skim Map 和 Paper Summary 都没有自动生成，阅读器也没有解释当前页状态，视觉上像“啥也没有”。
- OCR 入口此前只在无文字层时出现；已有文字层时虽然可以划词，但缺少明确反馈。

改动：

- `PdfViewer` 在 PDF 加载后立即显示“正在检测文字层”。
- 当前页有 PDF 原生文字层时显示“当前页可划词”，并隐藏 OCR 按钮。
- 当前页无文字层时显示“当前页没有可选文字”和“识别当前页”按钮。
- 扩展 `PdfOcrCurrentPage.test.jsx`，覆盖有文字层时不出现 OCR 入口。

验收：

- `npm run test -- src/PdfOcrCurrentPage.test.jsx` -> pass，1 file / 3 tests。
- `npm run test -- --no-file-parallelism src/PdfOcrCurrentPage.test.jsx src/WorkspaceLayout.test.jsx src/dragInject.test.js` -> pass，3 files / 7 tests。
- `npm run test` -> pass，32 files / 123 tests。
- `npm run build` -> pass，保留既有 chunk size warning。
- `git diff --check` -> pass。
- Playwright Web smoke：上传 `/Users/mahaoxuan/Downloads/「词元工坊」赛道命题解读.pdf` 后显示“当前页没有可选文字”和“识别当前页”；截图 `output/playwright/pdf-upload-state.png`。
- Playwright Web smoke：上传 `/Users/mahaoxuan/Downloads/iFinD HTTP API 用户手册.pdf` 后显示“当前页可划词”，不显示 OCR 按钮；截图 `output/playwright/pdf-native-text-state.png`。

## 2026-06-11 Phase 12 Rust Source Index Foundation

产品规则：

- Rust 先接管 source span / local search substrate，不替换 React/PDF.js 渲染。
- Web-first 路径继续可用；浏览器 runtime 下 source index bridge 安全空返回。
- 当前切片只建立 Rust-backed source span 表和搜索命令，不把 Chat 默认切到 Rust 检索。

改动：

- 新增 `tasks/bdd-tdd-rust-source-index.md`，记录 source span replace/search/list 的 BDD/TDD 行为。
- Rust SQLite 新增 `source_spans` 表，保存 `document_id`、`page`、`paragraph_id`、`chunk_id`、`text`、`normalized_text`、`order_index`、`source_type`、`metadata_json`。
- Rust storage core 新增 `replace_source_spans`、`list_source_spans`、`search_source_spans`。
- Tauri commands 新增 `storage_replace_source_spans`、`storage_list_source_spans`、`storage_search_source_spans`。
- 前端 persistent storage bridge 新增 `replacePersistentSourceSpans`、`listPersistentSourceSpans`、`searchPersistentSourceSpans`。

验收：

- RED：`cargo test --test storage_core source_spans` 先失败于缺少 `SourceSpanInput` 和 source span storage 方法。
- RED：`npm run test -- src/services/persistentStorage.test.js` 先失败于缺少 source span bridge functions。
- GREEN：`cargo test --test storage_core source_spans` -> pass，2 tests。
- GREEN：`npm run test -- src/services/persistentStorage.test.js` -> pass，4 tests。
- 相关 JS 验证：`npm run test -- src/services/persistentStorage.test.js src/retrievalContext.test.js` -> pass，2 files / 12 tests。
- 全量测试：`npm run test` -> pass，46 files / 199 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示。
- 构建：`npm run build` -> pass，保留既有 chunk size warning。
- Rust 标准验证：`cd src-tauri && cargo clean && cargo check && cargo test` -> pass；清掉旧 target 中 stale absolute path 缓存后，15 storage tests + 1 command test 通过。

遗留风险：

- 解析后的 chunks 尚未自动写入 `source_spans` 表。
- Chat 仍默认使用现有 JS retrieval；后续需要在 Tauri runtime 下接入 Rust search 作为可选或默认 retrieval backend。

## 2026-06-11 Phase 12 Rust Source Index Bridge

产品规则：

- Tauri runtime 下 Chat retrieval 优先使用 Rust source index。
- 浏览器 runtime 不调用 Rust storage，继续使用现有 JS retrieval。
- Rust index 为空或不可用时必须回退 JS retrieval，不能让 Chat 丢失文档上下文。

改动：

- 新增 `tasks/bdd-tdd-rust-source-index-bridge.md`，记录 source index bridge 的 BDD/TDD 行为。
- 新增 `src/services/sourceIndexService.js`，负责 retrieval chunks 到 source spans 的映射、Tauri source index 写入、Rust search，以及 JS fallback。
- `src/retrievalContext.js` 抽出 `buildRetrievalContextFromChunks` 和 `sourceIdForChunk`，让 Rust search 结果复用现有 prompt/sourceRefs 格式。
- `src/App.jsx` 将 Chat retrieval 从同步 `buildRetrievalContext` 切换到异步 `buildIndexedRetrievalContext`。
- `src/App.retrievalContext.test.jsx` 的 persistentStorage mock 补齐 source span bridge，确保浏览器测试路径仍按 JS fallback 验证。

验收：

- RED：`npm run test -- src/services/sourceIndexService.test.js` 先失败于缺少 `sourceIndexService`。
- GREEN：`npm run test -- src/services/sourceIndexService.test.js src/App.retrievalContext.test.jsx` -> pass，2 files / 14 tests。
- 回归：`npm run test -- src/retrievalContext.test.js src/services/persistentStorage.test.js src/services/sourceIndexService.test.js src/App.retrievalContext.test.jsx` -> pass，4 files / 26 tests。

遗留风险：

- 当前 Tauri Chat 提问时会即时重建当前文档 source index；后续应在文档打开或解析完成后建立索引状态，避免长文档重复写库。

## 2026-06-11 Phase 12 Source Index Cache

产品规则：

- 同一文档版本在当前 renderer session 内连续提问，不应重复 replace `source_spans`。
- 同一 `documentId` 的正文或版本签名变化后，必须重建 source index，避免 stale source refs。
- 显式 `indexDocumentSourceSpans()` 保留 force-write 语义，供后续文档打开/解析完成时主动索引。

改动：

- `tasks/bdd-tdd-rust-source-index-bridge.md` 补充 source index cache / cache invalidation 行为。
- `src/services/sourceIndexService.js` 新增文档 source index signature，包含 `id`、`fingerprint`、`updatedAt`、`size`、`kind`、`maxCharsPerChunk` 和正文 hash。
- `buildIndexedRetrievalContext()` 改为通过 `ensureDocumentSourceIndex()` 写入索引，同一签名只写一次。
- 新增 `clearSourceIndexCache()`，用于测试、文档删除或后续索引失效入口。

验收：

- RED：`npm run test -- src/services/sourceIndexService.test.js` 先失败于缺少 `clearSourceIndexCache`。
- GREEN：`npm run test -- src/services/sourceIndexService.test.js` -> pass，1 file / 7 tests。
- 回归：`npm run test -- src/services/sourceIndexService.test.js src/App.retrievalContext.test.jsx src/retrievalContext.test.js src/services/persistentStorage.test.js` -> pass，4 files / 28 tests。
- 全量测试：`npm run test` -> pass，47 files / 206 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示。
- 构建：`npm run build` -> pass，保留既有 chunk size warning。
- Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass，15 storage tests + 1 command test。
- 格式：`git diff --check` -> pass。

遗留风险：

- 缓存目前只在 renderer session 内有效；应用重启后首次提问仍会重建当前文档索引。后续应把 `indexSignature/indexedAt` 落到 SQLite 或 document metadata，并在文档打开/解析完成时主动调度索引。

## 2026-06-11 Phase 12 Persistent Source Index Status

产品规则：

- Source index freshness 必须能跨 renderer session 判断，不应只依赖内存缓存。
- 文档打开/解析完成后应主动调度 source span indexing；Chat retrieval 只保留兜底 ensure。
- 打开文档时索引失败不得阻断阅读器打开。

改动：

- Rust SQLite 新增 `source_index_status` 表，字段为 `document_id`、`index_signature`、`span_count`、`indexed_at`、`updated_at`。
- Rust storage core 新增 `SourceIndexStatusInput` / `SourceIndexStatusRecord`、`upsert_source_index_status`、`load_source_index_status`。
- Tauri commands 新增 `storage_upsert_source_index_status` / `storage_load_source_index_status` 并注册到 handler。
- 前端 `persistentStorage` 新增 `savePersistentSourceIndexStatus` / `loadPersistentSourceIndexStatus`。
- `sourceIndexService` force-write source spans 后保存 index status；renderer cache miss 时先读取 SQLite status，签名一致则跳过 replace。
- `App` 在文档进入 workspace 后非阻塞调用 `indexDocumentSourceSpans(document)`，让索引成为文档 ingestion 的一部分。

验收：

- RED：`cargo test --test storage_core source_index_status` 先失败于缺少 `SourceIndexStatusInput` 和 source index status storage 方法。
- RED：`npm run test -- src/services/persistentStorage.test.js` 先失败于缺少 `loadPersistentSourceIndexStatus` / `savePersistentSourceIndexStatus`。
- RED：`npm run test -- src/services/sourceIndexService.test.js` 先失败于 renderer cache 清空后仍重复 replace source spans。
- RED：`npm run test -- src/WorkspaceLayout.test.jsx` 先失败于打开文档后未调用 `indexDocumentSourceSpans`。
- GREEN：`cargo test --test storage_core source_index_status` -> pass，1 filtered test。
- 组合回归：`npm run test -- src/services/sourceIndexService.test.js src/services/persistentStorage.test.js src/WorkspaceLayout.test.jsx src/App.retrievalContext.test.jsx src/retrievalContext.test.js` -> pass，5 files / 32 tests。

遗留风险：

- 当前索引调度仍是 fire-and-forget，没有后台任务进度、取消或失败状态 UI；后续应接入 Rust task queue / progress event。

## 2026-06-11 Phase 13 Rust Task State Foundation

产品规则：

- 长任务状态必须可持久恢复，不能只存在于前端临时 spinner。
- Task status 必须是封闭集合：`pending`、`running`、`succeeded`、`failed`、`cancelled`。
- 浏览器 runtime 继续 no-op，不阻塞 Web-first 开发路径。
- source indexing 失败必须写入 failed 状态，同时不能阻断文档打开。

改动：

- 新增 `tasks/bdd-tdd-task-state.md`，记录 Rust task state 的 BDD/TDD 行为。
- Rust SQLite 新增 `task_records` 表，保存任务类型、状态、进度、payload/result/error 和生命周期时间戳。
- Rust storage core 新增 `TaskInput` / `TaskRecord`、`upsert_task`、`load_task`、`list_tasks`，并校验 task status。
- Tauri commands 新增 `storage_upsert_task` / `storage_load_task` / `storage_list_tasks` 并注册到 handler。
- 前端 persistent storage bridge 新增 `savePersistentTask` / `loadPersistentTask` / `listPersistentTasks`。
- `indexDocumentSourceSpans` 开始记录 `source_index` 任务生命周期：运行中、成功、失败。

验收：

- RED：`cargo test --test storage_core task` 先失败于缺少 `TaskInput` 和 task storage 方法。
- RED：`npm run test -- src/services/persistentStorage.test.js` 先失败于缺少 task bridge functions。
- RED：`npm run test -- src/services/sourceIndexService.test.js` 先失败于没有记录 source indexing task state。
- GREEN：`cargo test --test storage_core task` -> pass，2 filtered tests。
- GREEN：`npm run test -- src/services/persistentStorage.test.js` -> pass，1 file / 4 tests。
- GREEN：`npm run test -- src/services/sourceIndexService.test.js` -> pass，1 file / 10 tests。
- 全量测试：`npm run test` -> pass，47 files / 210 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示。
- 构建：`npm run build` -> pass，保留既有 chunk size warning。
- Rust 标准验证：`cd src-tauri && cargo fmt && cargo fmt --check && cargo check && cargo test` -> pass，18 storage tests + 1 command test。

遗留风险：

- 这仍是 task state foundation，不是完整后台队列；还没有 UI 进度、取消按钮、任务事件流、重试入口。
- Summary、Attention、Agent 阅读任务尚未迁入统一 task state。

## 2026-06-11 Phase 14 Task State UI and Reading Task Adoption

产品规则：

- Summary 和 Attention 都是阅读任务，不能只靠组件内 loading 状态。
- 用户需要在右侧工具区看到当前文档发生过哪些阅读任务、任务状态和失败原因。
- 本切片只做 task snapshot UI，不做 retry/cancel/executor。

改动：

- 新增 `tasks/bdd-tdd-task-state-ui.md`，记录 Summary、Attention 和 Tasks 面板的 BDD/TDD 行为。
- `SummaryCard` 生成摘要时写入 `section_summary` task：`running`、`succeeded`、`failed`。
- `AttentionNavigatorPanel` 分析关键位置时写入 `attention_analysis` task：`running`、`succeeded`、`failed`。
- 新增 `TaskStatusPanel`，按当前 `documentId` 读取 `listPersistentTasks`，展示 title、type、status、progress 和 errorMessage。
- `App` 右侧工具区新增 `Tasks` tab。

验收：

- RED：`npm run test -- src/SummaryCard.test.jsx` 先失败于没有记录 `section_summary` task state。
- RED：`npm run test -- src/AttentionNavigatorPanel.test.jsx` 先失败于没有记录 `attention_analysis` task state。
- RED：`npm run test -- src/TaskStatusPanel.test.jsx` 先失败于缺少 `TaskStatusPanel`。
- GREEN：`npm run test -- src/SummaryCard.test.jsx src/AttentionNavigatorPanel.test.jsx src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` -> pass，4 files / 19 tests。
- 全量测试：`npm run test` -> pass，48 files / 216 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示。
- 构建：`npm run build` -> pass，保留既有 chunk size warning。
- Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass，18 storage tests + 1 command test。

遗留风险：

- Tasks 面板目前不会实时订阅任务事件，切到面板时读取当前快照。
- 还没有 retry、cancel、后台 executor 或 progress event；后续 Phase 应继续推进 task runtime。

## 2026-06-11 Phase 15 Task Live Refresh

产品规则：

- Task 状态写入成功后，当前渲染进程里的 Tasks 面板应该自动看到更新。
- Task update 事件必须按 `documentId` 隔离，不能刷新其它文档的任务列表。
- 本切片只做 renderer-local refresh event，不做 Rust progress event stream、retry/cancel 或 executor。

改动：

- 新增 `tasks/bdd-tdd-task-live-refresh.md`，记录 task live refresh 的 BDD/TDD 行为。
- `persistentStorage` 导出 `TASK_UPDATED_EVENT`，`savePersistentTask` 在 Tauri command 成功返回后派发本地事件。
- `TaskStatusPanel` 监听 `TASK_UPDATED_EVENT`，仅在事件 `documentId` 等于当前文档时重新调用 `listPersistentTasks(documentId)`。
- `TaskStatusPanel` 忽略其它文档的 task update 事件，保持多文档隔离。

验收：

- RED：`npm run test -- src/services/persistentStorage.test.js src/TaskStatusPanel.test.jsx` 先失败于没有 task update 事件和面板订阅。
- GREEN：`npm run test -- src/services/persistentStorage.test.js src/TaskStatusPanel.test.jsx` -> pass，2 files / 9 tests。
- 全量测试：`npm run test` -> pass，48 files / 219 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示。
- 构建：`npm run build` -> pass，保留既有 chunk size warning。
- Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass，18 storage tests + 1 command test。

遗留风险：

- 当前事件只覆盖同一 renderer 内的即时刷新；未来 Rust 后台任务、跨窗口进度、取消和重试仍需要正式 task runtime。

## 2026-06-11 Phase 16 Source Index Task Retry

产品规则：

- 失败的 source indexing 任务应该有明确恢复入口。
- Retry 必须触发真实已有能力，不能只改 UI 或伪造 task 状态。
- 只为已有 executor 的 `source_index` 接入重试；Summary / Attention 暂不显示假的 retry/cancel。
- Retry 必须保持文档隔离，只重试当前文档的 task。

改动：

- 新增 `tasks/bdd-tdd-task-source-index-retry.md`，记录 source index retry 的 BDD/TDD 行为。
- `TaskStatusPanel` 对 failed / cancelled 的 `source_index` task 显示 Retry 操作。
- 点击 Retry 后，`TaskStatusPanel` 调用 `onRetryTask(task)`，保留完整 task record。
- `App` 新增 `handleRetryTask`，只在 task 属于当前文档且类型为 `source_index` 时调用 `indexDocumentSourceSpans(currentDocument)`。

验收：

- RED：`npm run test -- src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` 先失败于缺少 Retry 按钮和 App retry callback。
- GREEN：`npm run test -- src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` -> pass，2 files / 9 tests。
- 全量测试：`npm run test` -> pass，48 files / 221 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示。
- 构建：`npm run build` -> pass，保留既有 chunk size warning。
- Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass，18 storage tests + 1 command test。

遗留风险：

- 这仍不是通用 task executor；Summary / Attention retry、真实 cancellation token、跨窗口 progress event 仍需后续 task runtime。

## 2026-06-28 Phase 43：Onboarding + Help Guide + Model Config Modal 重构 + E2E 修复

### 目标

1. 首次启动体验：从空白页升级为 5 步引导
2. 模型配置从 ChatInput 内部抽出独立组件，对齐 AI 组件工作流库 17 个 provider
3. 真实浏览器跑全流程，记录 bug 并批量修复

### 改动

#### 1. Onboarding（首次启动引导）

- 新增 `src/onboarding/OnboardingOverlay.jsx`：5 步快速上手 + localStorage dismiss 记录
- 不再打扰已 dismiss 用户
- 步骤：上传文档 → AI 摘要 → 记忆卡片 → 注意力导航 → AI 对话

#### 2. Help Guide（完整使用指南）

- 新增 `src/help/HelpGuide.jsx` + `helpGuideContent.js`：Markdown 内嵌 720px Modal
- 包含快速上手（5 步）+ 功能详解 + 快捷键 + FAQ
- 侧边栏底部「指南」按钮常驻入口

#### 3. Model Config Modal（核心差异功能重构）

- 新增 `src/model-config/ModelConfigModal.jsx`：从 ChatInput 抽出独立组件
- 侧边栏底部「配置」按钮直达
- 功能增强：
  - 5 个快速模板（StepFun / DeepSeek / MiniMax / Kimi / MiMo）
  - 模型能力标签（Vision / Coding / 128K / No Key）
  - 一键测试连接（发送 lightweight API call）
  - JSON 导入/导出
- `src/modelPresets.js` 从 14 个扩展到 18 个 provider，对齐 AI 组件工作流库 MODEL_CAPABILITY_INDEX.md

#### 4. Bug 批量修复（基于真实浏览器 E2E）

**P0：**

- **#1 Help Guide Markdown 排版**：模板未渲染根因是缓存问题，刷新后 h1/h2/ol/ul/table/blockquote 全部正常
- **#2 导入 JSON 模板污染**：filter 拦截 `id` 以 `import-` 前缀的模板记录
- **#3 Preset 下拉不同步**：把 Select 移出 Form.Item，改用 `form.getFieldValue('presetKey')` 直接驱动
- **#5 模型选择器刷新**：通过 `CustomEvent('vibereader:model-configs-changed')` 协调 Modal → ChatInput

**P1：**

- **#4 Placeholder 残留**：placeholder 根据 selectedPreset 动态生成
- **#6 视觉区分**：模板按钮改用蓝色 ghost + 浅蓝背景
- **#7 Default config 丢失**：DEFAULT_MINIMAX/KIMI_TRIAL 添加 providerKey 字段
- **#9/#11 默认选中态**：`findPresetForConfig` fallback（按 baseUrl + modelName 匹配）
- **#10 模板点击同步**：form fields 同步驱动 Select 显示

**P2（未修）：**

- #8 模板按钮换行（Flex wrap 已自动处理）
- #12 PDF reader tab 关闭（Tauri 桌面专属，dev 复现不出）

### 关键决策

1. **侧边栏底部「配置」 vs 「模型」语义区分**：底部 ChatInput 选择器叫「模型：xxx」（切换），侧边栏叫「配置」（配置管理）。删除顶部 header 冗余按钮。

2. **Select 受控策略**：AntD Form.Item 包裹的 Select 在 Modal 内部 `setFieldsValue` 同步失效。把 Select 移到 Form.Item 外，用 `form.getFieldValue()` 直接读，避免 controlled 冲突。

3. **跨组件通信选型**：用 `window.dispatchEvent(CustomEvent)` 而非 Context/State lift，简单且解耦。ChatInput 在 mount 时订阅事件。

4. **yishuship + 动态工作流启停**：先停下来写 DEVLOG + 规划，不进入 Cycle 2。

### 验收

- ✅ 首次打开 → 5 步引导
- ✅ 跳过/完成后不再显示
- ✅ 侧边栏底部两个入口：指南 / 配置
- ✅ 指南 Modal Markdown 排版正确
- ✅ 配置 Modal 17+1 个 provider 模板
- ✅ 模板点击同步 preset 下拉 + 填表单
- ✅ 导入 18 条模板 → filter 全部拦截
- ✅ 测试连接按钮可用
- ✅ 提交 `fix(model-config): resolve 8 E2E bugs`

### 遗留风险

- `useForm` warning（AntD 已知行为，关闭时 form 短暂未挂载，不影响功能）
- Modal 关闭后 `Modal.confirm` zIndex 10002 临时处理，长远应在 Modal 库层面做
- yishuship 状态机在多 session 间未持久化任务历史

## 2026-07-01 Phase 44：Project Intake + Test Harness Stabilization

### 目标

1. 接手 `/Users/mahaoxuan/Desktop/黑客松/阅读器` 项目，确认当前开发主线。
2. 清理继续开发前的测试地基问题，避免后续改动被 jsdom/AntD 环境噪声挡住。
3. 修复 Notes 等非 Chat 面板下模型服务配置不可达的问题。

### 项目判断

- 当前主线是 `ai-chat-standalone`：React 18 + Vite + Tauri v2 的 VibeReader 独立桌面阅读器。
- 同级 `Vibero` 是历史 Zotero fork / 参考仓库，且当前工作树有未提交改动；除非要做 Zotero 集成，否则不要把它当主开发面。
- `ai-chat-standalone/CODEX.md`、`PROJECT_MAP.md`、`docs/current-state.md` 是后续 agent 接手时应优先读取的项目地图。

### 改动

- 新增 `src/test/setup.js`，为 Vitest/jsdom 统一补齐 `matchMedia`、`ResizeObserver`、`IntersectionObserver`、`scrollIntoView`，并包裹 `getComputedStyle` 以避开 AntD pseudo-element 环境缺口。
- `vitest.config.js` 接入全局 setup，避免每个测试文件重复补浏览器 API。
- `persistentStorage` 在非 Tauri 且 IndexedDB 不可用时，对 conversation save/delete 做安全兜底，保持“浏览器受限环境不崩溃”的产品契约。
- `App` 顶部工作区增加全局模型服务入口；在 Notes / Tasks / Summary 等面板也能直接进入 Chat 并打开模型配置。
- 顶部模型服务入口增加最大宽度和文本省略，避免长模型名挤压工具栏。

### 验收

- RED：初始 `pnpm test -- --reporter=dot` 失败，主要原因是 `window.matchMedia is not a function` 连锁打断 AntD `Steps`/Onboarding 渲染；另有非 Tauri 环境下 IndexedDB 缺失导致 persistentStorage 测试失败。
- GREEN：`pnpm exec vitest run src/WorkspaceLayout.test.jsx src/App.lensCardClosure.test.jsx src/dragInject.test.js src/services/persistentStorage.test.js --reporter=dot` -> pass，4 files / 28 tests。
- 最终目标测试：`pnpm exec vitest run src/App.lensCardClosure.test.jsx src/WorkspaceLayout.test.jsx --reporter=dot` -> pass，2 files / 19 tests。
- 全量测试：`pnpm test -- --reporter=dot` -> pass，53 files / 274 tests。
- 构建：`pnpm build` -> pass，保留既有 chunk size warning。
- 浏览器验证：`pnpm dev` + Playwright 打开 `http://127.0.0.1:3217/`，确认首屏非空、顶部模型服务入口可见；点击后右侧切换到「对话」并打开「自定义模型设置」Modal。
- Rust/Tauri：初始被 Homebrew `libgit2` -> `llhttp` dylib 断链阻塞；升级 `libgit2 1.9.2_1 -> 1.9.4` 与 `rust 1.94.1 -> 1.96.0` 后，`cd src-tauri && cargo fmt --check && cargo check && cargo test` -> pass，1 command test + 22 storage core tests。

### 遗留风险

- 浏览器控制面未暴露 Browser 插件要求的 `node_repl js` 入口，因此本轮按前端验证规则 fallback 到 Playwright，并已记录。
- 仍有既有 AntD `useForm` warning 与 zIndex warning；当前不影响目标流程，但后续整理 Modal 生命周期时应一并清理。

## 2026-07-01 Phase 45：Model Config Truthfulness + Kimi WebBridge Validation

> Superseded note: Phase 46 corrected the model-service truth. This phase fixed the "keyless Kimi" guard, but its browser validation still showed Kimi and MiniMax-M2.7 in the UI because it had not yet applied the owned-service rule from the desktop `AI组件工作流库`.

### 目标

1. 修复模型配置误导：外部 Kimi/Moonshot API 不能被当成“无需 Key 可用”的体验链路。
2. 让旧 localStorage / Zustand 持久态自动迁移，避免历史 `preset-kimi-free-trial` 继续污染运行态。
3. 用 Kimi WebBridge 接管真实 Chrome 页面验证配置弹窗，而不是只依赖 jsdom/单元测试。

### 改动

- 新增 `src/modelConfigMigration.js`，统一推断 `providerKey`、规范 `requiresApiKey`、修复旧 Kimi/MiniMax 配置。
- 旧 Kimi free-trial 配置迁移为 `providerKey: kimi` 且 `requiresApiKey: true`；只有本地端点或 `authType: none` 可保留无 Key 模式。
- `modelConfigGuard` 收紧运行前校验，外部端点即使传入 `requiresApiKey:false` 也不能绕过 API Key。
- 默认模型 seed 从 `preset-kimi-free-trial / moonshot-v1-8k / no key` 改为真实的 `preset-kimi-default / kimi-k2.6 / requires key`。
- `modelPresets` 隐藏历史 `kimi-free-trial` picker 项，并让旧兼容格式带上 `id/apiType/codingPlan/tokenPlan`。
- 修复 ChatInput 旧模型配置弹窗与独立 `ModelConfigModal` 的 provider/model 受控状态同步。
- 修复 Anthropic-compatible provider URL 规范化：MiniMax/MiMo 这类 `/anthropic` 端点不再被错误追加 `/v1`，已污染的 `/anthropic/v1` 会迁回 `/anthropic`。
- `aiService` 在 API Key 为空时不再发送空认证头，配合 guard 支持本地无认证代理。

### 验收

- Kimi WebBridge：`~/.kimi-webbridge/bin/kimi-webbridge status` -> daemon running，Chrome extension connected。
- Kimi WebBridge 浏览器验证 `http://127.0.0.1:3217/`：
  - 旧 Kimi 配置自动迁移为 `providerKey: kimi`、`requiresApiKey: true`。
  - 顶部入口显示「配置模型服务」，不会把空 Key Kimi 当成可运行模型。
  - 配置弹窗中 Kimi 行显示 `Kimi (Moonshot)` + `Moonshot v1 8K` + `OpenAI格式`，API Key placeholder 不再出现“无需 Key”。
  - 切换 MiniMax 行显示 `MiniMax` + `MiniMax-M2.7` + `Anthropic格式`，Base URL 为 `https://api.minimaxi.com/anthropic`。
- 定向测试：`pnpm exec vitest run src/modelConfigMigration.test.js src/modelPresets.test.js src/modelConfigGuard.test.js src/testModelConfigSeed.test.js src/App.lensCardClosure.test.jsx --reporter=dot` -> pass，5 files / 25 tests。
- 全量测试：`pnpm test -- --reporter=dot` -> pass，54 files / 280 tests。
- 构建：`pnpm build` -> pass，保留既有 chunk size warning。

### 遗留风险

- 顶部按钮当前仍打开 ChatInput 内置旧配置弹窗；它已修到同一契约，但后续应考虑移除旧弹窗，只保留独立 `ModelConfigModal`。
- Kimi/Moonshot 模型列表仍应在接入真实 Key 前再按当前官方控制台复核一次；本轮重点是修正“无 Key 可用”的错误产品契约。

## 2026-07-01 Phase 46：Owned Model Service Correction

> Superseded note: Phase 47 corrected the MiniMax host and credential-mode split. Phase 46 used `api.minimax.io` from the earlier local workflow note, but the current MiniMax Chinese platform docs and product feedback require `api.minimaxi.com` plus separate Token Plan/API choices.

### 触发

用户明确纠正：产品开发的第一批用户是我们自己，因此默认配置和测试链路只能使用我们真实拥有的大模型服务。当前本机事实源是桌面 `AI组件工作流库`，不是 provider preset 列表。

### 本机事实

- MiniMax Token Plan 是当前 VibeReader QA 默认链路。
- 模型：`MiniMax-M3`。
- 协议：Anthropic-compatible。
- Base URL：`https://api.minimax.io/anthropic`。
- 环境变量：`MINIMAX_API_KEY`。
- Kimi/Moonshot 当前没有确认可复用本机 Key，因此不能作为默认、免 Key 或演示兜底链路。

### 改动

- 默认 first-use / QA seed 改为 `preset-minimax-default / MiniMax-M3 / https://api.minimax.io/anthropic`。
- 旧 `preset-kimi-free-trial` 空 Key 记录从运行配置中丢弃，不再迁移成可见可运行配置。
- Kimi provider 保留为可选，但默认模型改为 `kimi-k2.6`，并要求真实 Key。
- 移除导入模板中的 keyless Kimi free-trial 记录。
- MiniMax M2.7 与 `api.minimaxi.com` 历史配置会迁移到 M3 与 `api.minimax.io`。
- 新增 `docs/LOCAL_MODEL_SERVICES.md`，并从 `PROJECT_MAP.md`、`CODEX.md`、个人 Codex work method、Codex memory registry 指向它。
- 更新比赛 checklist / pitch / code wiki / review 文档，移除“Kimi 免 Key”作为当前可执行口径。

### 验收

- 定向单测：`pnpm exec vitest run src/modelConfigMigration.test.js src/modelPresets.test.js src/modelConfigGuard.test.js src/testModelConfigSeed.test.js src/aiEndpoint.test.js src/App.lensCardClosure.test.jsx src/agent/lensCard.test.js src/agent/artifact.test.js --reporter=dot` -> pass，8 files / 39 tests。
- 全量测试：`pnpm test -- --reporter=dot` -> pass，54 files / 284 tests。
- 构建：`pnpm build` -> pass，保留既有 chunk size warning。
- `git diff --check` -> pass。
- 真实 Chromium 浏览器验证：
  - 写入旧 localStorage：keyless `preset-kimi-free-trial` + `MiniMax-M2.7` + `api.minimaxi.com`。
  - 刷新后仅保留 MiniMax 配置，`name/modelName` 都迁移为 `MiniMax-M3`，Base URL 迁移为 `https://api.minimax.io/anthropic`。
  - 顶部模型入口打开统一 `ModelConfigModal`，不再打开 ChatInput 旧弹窗。
  - Modal 不显示 `MiniMax-M2.7`、`moonshot-v1` 或“无需 API Key”。

## 2026-07-01 Phase 47：MiniMax API / Token Plan Split

### 触发

用户在真实浏览器中用 MiniMax Key 测试连接，UI 显示 `连接失败: Failed to fetch`。用户指出 MiniMax 官方有两种接入方式：API 与 Token Plan；产品必须让用户明确选择。

### 官方事实

- MiniMax 按量付费 API Key 与 Token Plan 订阅 Key 相互独立，不能互换。
- Token Plan 快速接入文档使用 `ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic`。
- MiniMax M3 文本能力可通过 Anthropic-compatible 接口接入。

### 改动

- `modelPresets` 拆成两个可见 provider：
  - `MiniMax Token Plan`：`providerKey: minimax`，订阅 Key，默认 env `MINIMAX_TOKEN_PLAN_KEY`。
  - `MiniMax API`：`providerKey: minimax-api`，按量付费 API Key，默认 env `MINIMAX_API_KEY`。
- 默认 first-use / QA seed 仍选择 Token Plan，但 Base URL 改为 `https://api.minimaxi.com/anthropic`。
- `ModelConfigModal` 快速模板新增 `MiniMax API`，并保留 `MiniMax Token Plan`。
- `测试连接` 改为使用 `resolveAiEndpointForRuntime()`，本地浏览器会走 Vite dev proxy，不再直接跨域 fetch 外部接口。
- Vite `/api/minimax` 代理目标改为 `https://api.minimaxi.com`。
- 迁移器把旧 `api.minimax.io` 与 MiniMax M2.7 配置迁移到 `api.minimaxi.com` + `MiniMax-M3`。
- 更新 `docs/LOCAL_MODEL_SERVICES.md`、`PROJECT_MAP.md`、Code Wiki、比赛文档和全局 Codex 记忆。

### 验收

- 定向单测：`pnpm exec vitest run src/modelConfigMigration.test.js src/modelPresets.test.js src/testModelConfigSeed.test.js src/aiEndpoint.test.js src/App.lensCardClosure.test.jsx --reporter=dot` -> pass，5 files / 28 tests。
- 全量测试：`pnpm test -- --reporter=dot` -> pass，54 files / 287 tests。
- 构建：`pnpm build` -> pass，保留既有 chunk size warning。
- `git diff --check` -> pass。
- 重启 dev server：`http://127.0.0.1:3217/`，使新的 Vite proxy target 生效。
- 真实 Chromium 浏览器验证：
  - Modal 点击「添加新配置」后同时显示 `MiniMax Token Plan` 与 `MiniMax API`。
  - 使用假 Token Plan Key 并拦截网络，请求命中 `http://127.0.0.1:3217/api/minimax/v1/messages`。
  - 页面出现「连接成功」，说明测试连接走本地代理，不再直接跨域 fetch 外部接口。

## 2026-07-01 Phase 48：PDF Selection Toolbar UX Repair

### 触发

用户在真实阅读流中划选 PDF 文本后，选区动作条遮挡正文且按钮过大；PDF text layer 被全局 selection 样式染黑后出现拉伸乱码观感。

### 改动

- `PdfAnnotationToolbar` 从文字按钮长条改成紧凑图标气泡，默认只显示生成卡片、询问 AI、高亮、笔记 4 个图标按钮。
- 笔记输入不再默认展开；点击笔记图标后才展开输入框。
- `PdfViewer` 将动作条定位从选区上方改为选区下方，并限制在当前滚动视口内。
- PDF text layer 增加 `textLayer pdf-text-layer` class，并为 `.textLayer ::selection` 设置透明文字色，只保留选区背景，避免把隐藏文本渲染成黑色拉伸字形。

### 验收

- 定向测试：`pnpm exec vitest run src/PdfAnnotationToolbar.test.jsx src/pdfSelection.test.js src/services/documentIsolation.test.jsx --reporter=dot` -> pass，3 files / 12 tests。
- 构建：`pnpm build` -> pass，保留既有 chunk size warning。
- Playwright Chromium 真实渲染验证：
  - 上传 `demo-assets/outline-demo.pdf`。
  - 在 PDF text layer 真实拖拽划词。
  - 动作条可见，宽度约 `145px`，默认没有笔记输入框。
  - 动作条位于选区下方，未与选区矩形重叠。
  - PDF text layer 选区文字颜色为 transparent，只显示选区背景。
  - 截图：`/tmp/vibereader-pdf-selection-toolbar-after.png`。

## 2026-07-01 Phase 49：Notes Markdown Rendering and Chinese UI Pass

### 触发

用户指出右侧「笔记」面板把 Lens Card / Reading Note 的 Markdown 原样显示，`#`、`##`、列表和引用没有被渲染；同时右侧工作区存在中英文混杂，如 `Tasks`、`Reading Tasks`、`grounded`、`Workspace`、`Skim Map`。

### 改动

- `ArtifactPanel` 复用现有 `MarkdownRenderer` 渲染卡片正文、解释、回答、阅读笔记正文和用户备注。
- 为卡片内 Markdown 添加紧凑样式，避免直接套聊天 Markdown 样式导致卡片过松。
- 将右侧笔记面板可见文案中文化：
  - 卡片类型：阅读卡片、解释卡片、概念卡片、阅读笔记。
  - 导入导出按钮：预览导出、导入 JSON、导出所选、下载 Markdown / JSON。
  - 卡片状态：`grounded` 显示为「有原文依据」。
- 将任务面板可见文案中文化：
  - `Tasks` -> 「任务」，`Reading Tasks` -> 「阅读任务」。
  - `Paper overview / Attention route / Create VibeCard` -> 「论文总览 / 阅读路线 / 生成卡片」。
  - 状态与动作：等待中、运行中、已完成、失败、重试、保存到笔记。
- 将主工作区硬编码 `Workspace` / `Skim Map` 改为「工作台」/「阅读地图」。
- 新增 `vibereader:artifacts-updated` 浏览器事件监听，用于外部导入或存储更新后显式刷新当前文档卡片，避免靠切 tab 刷新与正在生成卡片的乐观更新互相覆盖。

### 验收

- 定向测试：`pnpm exec vitest run src/ArtifactPanel.test.jsx src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx src/dragInject.test.js --reporter=dot` -> pass，4 files / 49 tests。
- Playwright Chromium 真实渲染验证：
  - 使用 `zh-CN` locale 上传 Markdown 文档。
  - 注入同 documentId 的阅读笔记卡片并派发 `vibereader:artifacts-updated`。
  - 右侧「笔记」卡片中 `# / ## / - / >` 被渲染为真实 `h1 / h2 / li / blockquote`。
  - 卡片文本不再包含裸 `# 测试标题`。
  - 「工作台」「阅读地图」「最近文档」「阅读任务」「暂无阅读任务」「有原文依据」均为中文。
  - Console 无 error / warning。
  - 截图：`/tmp/vibereader-markdown-notes-after.png`。

## 2026-07-01 Phase 50：Controlled UniRAG Query From Reader Chat

### 触发

按照 yishuship 继续推进知识飞轮。上一阶段已经把真实 Reader 文档接入 UniRAG ingest，并在界面显示「知识入库」状态；本阶段目标是让入库完成后的普通文本追问真正走 UniRAG 查询，而不是只停留在本地检索上下文。

### 改动

- `documentKnowledgeService` 新增 `isDocumentKnowledgeQueryReady(documentId)`，通过 `DocumentKnowledgeLink` 判断当前文档是否已完成入库且具备 UniRAG source/filename。
- `App.handleSubmit` 增加受控 UniRAG 查询路径：
  - 当前文档存在；
  - 无图片；
  - 不是手动注入选中文本/文档上下文；
  - UniRAG health 可用；
  - 当前文档入库完成。
- 满足条件时调用 `UniRagHttpAdapter.query()`，携带当前问题、会话、`topK=5`、provider 和 API Key。
- UniRAG 返回的 citations 继续走现有 `sourceRefs` 渲染，右侧聊天气泡显示「原文依据」。
- 如果 UniRAG 查询失败，保留旧路径：本地 source index 检索 + 当前模型 chatStream fallback。
- `App.retrievalContext.test.jsx` 增加 UniRAG eligible path 测试，确认入库完成时调用 `/api/query` 且不调用旧 chatStream。

### 验收

- 定向测试：`npm test -- src/App.retrievalContext.test.jsx -t "routes text-only chat through UniRAG|sends retrieved source excerpts"` -> pass，1 file / 2 tests。
- 阶段回归：`npm test -- src/services/documentKnowledgeService.test.js src/services/ragEngineAdapter.test.js src/services/sourceIndexService.test.js src/App.retrievalContext.test.jsx src/WorkspaceLayout.test.jsx` -> pass，5 files / 51 tests。
- 构建：`npm run build` -> pass，保留既有 chunk size warning。
- Playwright Chromium 真实浏览器验证：
  - dev server：`http://127.0.0.1:3322/`。
  - 上传 `demo-assets/sample.md`。
  - mock UniRAG health / ingest / status / query。
  - 页面显示 `知识入库：已完成`。
  - 在真实 Slate 输入框发送 `What is the core loop of this document?`。
  - `/api/query` 收到一次请求，payload 包含 `provider: minimax`、`mode: chat`、`top_k: 5`。
  - 页面显示 `UniRAG smoke answer: the reader and assistant stay visible together.`、`原文依据`、`P1`。
  - 结束后停止 `3322` dev server，端口无监听。

## 2026-07-01 Phase 51：UniRAG Citation Grounding and Jump

### 触发

继续 yishuship 当前阶段：UniRAG answer 已经能显示 citations，但远端 `chunk_id` 并不是 Reader 本地段落 id，点击 citation 仍可能无法回到原文。产品上这会削弱用户信任，因为“有引用”必须进一步变成“能回原文验证”。

### 改动

- `sourceIndexService` 新增 `groundSourceRefsForDocument(sourceRefs, document)`：
  - citation text 能匹配本地 source chunk 时，转成段落级 evidence；
  - text 匹配失败但 citation 有 page 时，转成页级 evidence；
  - page/text 都不可用时，转成文档级 evidence；
  - 保留 `originalDocumentId` / `originalParagraphId`，并新增 `grounding.precision / matchedBy / score`。
- `App` 在 UniRAG query 成功后，对 `result.sourceRefs` 立刻做本地 grounding，再写入 assistant message。
- 引用按钮对低精度 evidence 显式降级显示：
  - 段落级：`P2`
  - 页级：`P2 · 页级`
  - 文档级：`来源 1 · 文档级`
- `DocumentReader` 在 paragraphId 找不到时，使用 citation text fallback 高亮最接近段落，解决 Markdown/Text DOM id 与 source index id 命名不一致的问题。
- `PdfViewer` 对没有 rect 的页级 source span 也执行跳页，不再静默忽略。
- `App.retrievalContext.test.jsx` 增加 grounded UniRAG citation 点击测试，确认会派发当前文档的 `paragraphId`。

### 验收

- 定向测试：`npm test -- src/services/sourceIndexService.test.js src/DocumentReader.test.jsx src/App.retrievalContext.test.jsx -t "grounds UniRAG|page-level grounding|document-level evidence|falls back to citation text|grounded UniRAG|routes text-only chat"` -> pass，3 files / 6 tests。
- Adapter / ingest 测试：`npm test -- src/services/ragEngineAdapter.test.js src/services/documentKnowledgeService.test.js` -> pass，2 files / 14 tests。
- 阶段回归：`npm test -- src/services/documentKnowledgeService.test.js src/services/ragEngineAdapter.test.js src/services/sourceIndexService.test.js src/App.retrievalContext.test.jsx src/WorkspaceLayout.test.jsx src/DocumentReader.test.jsx` -> pass，6 files / 61 tests。
- 构建：`npm run build` -> pass，保留既有 chunk size warning。
- Playwright Chromium 真实浏览器验证：
  - dev server：`http://127.0.0.1:3322/`。
  - 上传 `demo-assets/sample.md`，等待 `知识入库：已完成`。
  - mock UniRAG query 返回一个 remote `chunk_id`，该 id 不等于 Reader 段落 id。
  - 页面显示段落级 `P1` citation，而不是 `页级/文档级` 降级标签。
  - 点击 `P1` 后，左侧 Reader 中包含 `reader and assistant are visible at the same time` 的段落出现 `.paragraph-pulse-highlight`。
  - 结束后停止 `3322` dev server，端口无监听。

## 2026-07-01 Phase 52：Saved Answer/Card/Note Memory Ingest

### 触发

按照 yishuship 下一阶段推进：引用已经能回原文验证，因此用户保存下来的回答卡片、阅读卡片和笔记应该进入长期知识飞轮。目标不是只保存到本地 Notes，而是让产品记住“用户确认值得保留的理解”。

### 改动

- `ragEngineAdapter` 新增 saved memory API contract：
  - `POST /api/memory/jobs`
  - `GET /api/memory/jobs/{job_id}`
- 新增 `savedMemoryService`：
  - `SAVED_MEMORY_INGEST_TASK_TYPE = 'saved_memory_ingest'`
  - `canIngestSavedMemoryArtifact`
  - `buildSavedMemoryPayload`
  - `startSavedMemoryIngest`
- memory payload 包含：
  - artifact id/type/title；
  - document id/name/kind/fingerprint；
  - verificationStatus；
  - sourceRefs 与 `grounding.precision`；
  - question/answer/summary/body/userNote/keyPoints/claims；
  - 一份可直接入库的 markdown `text`。
- App 在以下保存路径触发非阻塞 memory ingest：
  - 保存 assistant answer card；
  - 生成 Lens Card；
  - 子组件回传的 concept/evidence/route cards；
  - agent task result 保存为 reading_note。
- 本地 artifact 保存不等待 memory ingest；memory ingest 失败只更新状态和任务，不回滚本地卡片。
- 顶部新增 `记忆沉淀` 状态 badge，区分原始文档 `知识入库`。
- `TaskStatusPanel` 将 `saved_memory_ingest` 显示为「记忆沉淀」。

### 验收

- Focused tests：`npm test -- src/services/savedMemoryService.test.js src/services/ragEngineAdapter.test.js src/App.retrievalContext.test.jsx src/TaskStatusPanel.test.jsx` -> pass，4 files / 41 tests。
- Supporting tests：`npm test -- src/services/documentKnowledgeService.test.js src/services/sourceIndexService.test.js src/DocumentReader.test.jsx` -> pass，3 files / 22 tests。
- Phase regression：`npm test -- src/services/documentKnowledgeService.test.js src/services/ragEngineAdapter.test.js src/services/savedMemoryService.test.js src/services/sourceIndexService.test.js src/App.retrievalContext.test.jsx src/WorkspaceLayout.test.jsx src/DocumentReader.test.jsx src/TaskStatusPanel.test.jsx` -> pass，8 files / 80 tests。
- 构建：`npm run build` -> pass，保留既有 chunk size warning。
- Playwright Chromium 真实浏览器验证：
  - dev server：`http://127.0.0.1:3322/`。
  - 上传 `demo-assets/sample.md`，等待 `知识入库：已完成`。
  - 提问 `What should I remember from this document?`，mock UniRAG answer 和 grounded citation。
  - 点击 `保存回答卡片`。
  - `/api/memory/jobs` 收到一次请求，payload 是 `explain_card`，包含 answer、document、paragraph-level grounded sourceRefs。
  - 页面显示 `记忆沉淀：已完成`。
  - 结束后停止 `3322` dev server，端口无监听。

## 2026-07-01 Phase 53：Memory-Aware Reader Query Contract

### 触发

继续 yishuship 的知识飞轮：上一阶段已经能把用户保存的回答卡片、阅读卡片和笔记送入 memory ingest。下一步是让后续问答主动请求这些“用户确认过的记忆”，并在 UI 上明确区分“原文依据”和“我的记忆”。

### 改动

- `ragEngineAdapter.query()` 新增 Reader -> UniRAG query contract：
  - `include_memory: true`
  - `memory_top_k: 3`
- `ragEngineAdapter` 归一化 UniRAG citations 时区分：
  - raw source：`evidenceType: "source"` / `sourceType: "document"`
  - saved memory：`evidenceType: "memory"` / `sourceType: "saved_memory"`
- memory citation 支持识别 `source_type/sourceType/evidence_type/kind`，也支持通过 `artifact_id/memory_id` 判断。
- memory citation 保留：
  - `artifactId`
  - `artifactType`
  - `memoryId`
  - `memoryTitle`
  - nested `sourceRefs`
- `App` 对 UniRAG 返回的 sourceRefs 做分流：
  - 文档来源继续进入 `groundSourceRefsForDocument()`；
  - memory 来源不伪装成原文段落，不做本地 grounding。
- Assistant 引用 UI 分组显示：
  - `原文依据`
  - `我的记忆`
- 点击 `我的记忆` citation：
  - 切换右侧到 Notes；
  - 派发 `vibereader:navigate-artifact`；
  - `ArtifactPanel` 滚动到对应 saved card 并加 `.artifact-pulse-highlight`。
- `styles.css` 为 memory source button 与 artifact highlight 增加低调绿色状态。

### 明确边界

本阶段完成的是 Reader 侧契约和真实浏览器行为验证。当前 UniRAG 仓库未确认已有 `include_memory` / `/api/memory/jobs` 的真实后端实现；因此 Playwright smoke 使用 route mock 验证 Reader 对预期 API contract 的行为。下一阶段应进入 UniRAG 后端，实现真实 memory persistence/retrieval。

### 验收

- 聚焦测试：`npm test -- --run src/services/ragEngineAdapter.test.js src/App.retrievalContext.test.jsx src/ArtifactPanel.test.jsx` -> pass，3 files / 44 tests。
- 阶段回归：`npm test -- --run src/services/sourceIndexService.test.js src/services/documentKnowledgeService.test.js src/services/savedMemoryService.test.js src/services/ragEngineAdapter.test.js src/TaskStatusPanel.test.jsx src/ArtifactPanel.test.jsx src/DocumentReader.test.jsx src/App.retrievalContext.test.jsx` -> pass，8 files / 83 tests。
- 全量测试：`npm test` -> pass，57 files / 317 tests。
- 构建：`npm run build` -> pass，保留既有 chunk size warning。
- `git diff --check` -> pass。
- Playwright Chromium 真实浏览器验证：
  - dev server：`http://127.0.0.1:3322/`。
  - 上传 `demo-assets/sample.md`，等待 `知识入库：已完成`。
  - 第一次提问 `What should I remember?`，`/api/query` payload 包含 `include_memory: true` / `memory_top_k: 3`。
  - 保存回答卡片后，`/api/memory/jobs` 收到 `explain_card` memory payload，页面显示 `记忆沉淀：已完成`。
  - 第二次提问 `What did my saved memory say?`，`/api/query` 仍包含 `include_memory: true` / `memory_top_k: 3`。
  - mock 返回 `saved_memory` citation 后，assistant message 显示 `我的记忆`。
  - 点击 memory citation 后，右侧 Notes active，目标卡片出现 `.artifact-pulse-highlight`。

### yishuship 记录

- 新增 `.ship/tasks/20260701-vibereader-knowledge-flywheel/delivery/phase-1-memory-aware-query.md`。
- 新增 `.ship/tasks/20260701-vibereader-knowledge-flywheel/e2e/phase-1-memory-aware-query-browser.md`。
- 新增下一阶段计划 `.ship/tasks/20260701-vibereader-knowledge-flywheel/plan/phase-1-unirag-memory-backend-goal.md`。
