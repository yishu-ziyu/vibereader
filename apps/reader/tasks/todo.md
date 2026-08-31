# VibeReader Standalone 任务跟踪

最后更新：2026-06-13

## 当前决策

- [x] 主战场选择 `/Users/mahaoxuan/Desktop/ai-chat-standalone`
- [x] 放弃把 Zotero fork 作为 Hackathon 主线
- [x] 桌面壳选择 Tauri v2
- [x] Hackathon 格式优先级：PDF + Markdown/Text，EPUB 后置
- [x] 当前基线验证：`npm run build` 通过，有 bundle size warning
- [x] 当前主线运行面命名为 `VibeReader Standalone Dev`，旧 `Vibero.app` 只作为历史表面对照

## Phase 42：VibeCard Persistence Restart

- [x] 写入 BDD/TDD 规格：`tasks/bdd-tdd-vibecard-persistence-restart.md`
- [x] 用 TDD 覆盖 Tauri 持久化恢复后的 VibeCard 来源合同
- [x] 恢复 VibeCard 时保留 `sourceText`、`aiContent`、`source`、`userNote`
- [x] 恢复 VibeCard 时从 `paragraphId` 回填 `sourceSpanIds`
- [x] 覆盖 plain `aiContent` 记录，避免旧数据或导入数据恢复后只剩 `content`
- [x] 更新 persistent adapter 既有测试，让它检查恢复后的来源字段
- [x] 跑相关与全量验证
- [x] commit + push

验收：

- [x] 应用重启/重新读取后，VibeCard 仍有标题、原文摘录、AI 内容和用户备注
- [x] 恢复后的 VibeCard 仍有 `source`、`paragraphId` 和 `sourceSpanIds`
- [x] 恢复后的 VibeCard 具备继续 `回到原文` 的数据基础
- [x] `listArtifactsForDocument(documentId)` 只读取当前文档的持久化卡片
- [x] RED：`npm run test -- src/services/artifactService.persistentRestart.test.js` 失败，恢复后 `sourceSpanIds` 为空
- [x] GREEN：`npm run test -- src/services/artifactService.persistentRestart.test.js` 通过（1 file / 2 tests）
- [x] `npm run test -- src/services/artifactService.persistentRestart.test.js src/services/artifactService.persistent.test.js src/services/artifactService.test.js` 通过（3 files / 9 tests）
- [x] `npm run test -- src/services/artifactService.persistentRestart.test.js src/services/artifactService.test.js src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx src/App.retrievalContext.test.jsx` 通过（5 files / 47 tests）
- [x] `npm run test` 通过（53 files / 274 tests）
- [x] `npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` 通过（1 test）
- [x] `npm run build` 通过，保留既有 chunk size warning
- [x] `git diff --check` 通过

## Phase 41：Readable Document Source Return

- [x] 定位 PM 手测反馈：Markdown 样例里点击 VibeCard `回到原文` 无反应
- [x] 确认根因：卡片已发出 `vibereader:navigate-paragraph`，但 Markdown/Text/HTML 阅读器没有 `chunk-*` 段落锚点，也没有监听该事件
- [x] 写入 BDD/TDD 规格：`tasks/bdd-tdd-vibecard-source-return-hardening.md`
- [x] 用 TDD 覆盖 Markdown chunk 回源行为
- [x] 为 readable document 渲染 `chunk-1` / `chunk-2` / `chunk-3` 段落锚点
- [x] 为 readable document 接入回源事件、滚动定位、短暂高亮和找不到来源提示
- [x] 硬化卡片端回源按钮：按钮可访问名称包含具体来源，例如 `回到原文 P1 · chunk-3`
- [x] 用 TDD 覆盖 agent-generated VibeCard 的来源标签、回源按钮来源名和点击导航回调
- [x] 跑相关与全量验证
- [x] commit + push

验收：

- [x] VibeCard 卡片继续显示来源标签，例如 `P1 · chunk-3`
- [x] `回到原文` 按钮暴露具体来源名，便于 PM 判断点的是哪段原文
- [x] PM 点击 Markdown VibeCard 的 `回到原文` 后，阅读区应滚动到对应原文段落并短暂高亮
- [x] 来源段落不存在时，界面提示 `未找到这张卡片的原文段落`，不再静默无反应
- [x] RED：`npm run test -- src/ArtifactPanel.test.jsx` 失败，缺少 `回到原文 P1 · chunk-3` 按钮名
- [x] GREEN：`npm run test -- src/ArtifactPanel.test.jsx` 通过（1 file / 17 tests）
- [x] `npm run test -- src/DocumentReader.test.jsx` 通过（1 file / 5 tests）
- [x] `npm run test -- src/ArtifactPanel.test.jsx src/DocumentReader.test.jsx src/WorkspaceLayout.test.jsx src/App.retrievalContext.test.jsx` 通过（4 files / 47 tests）
- [x] `npm run test -- src/DocumentReader.test.jsx src/dragInject.test.js src/WorkspaceLayout.test.jsx src/ArtifactPanel.test.jsx` 通过（4 files / 41 tests）
- [x] `npm run test` 通过（52 files / 272 tests）
- [x] `npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` 通过（1 test）
- [x] `npm run build` 通过，保留既有 chunk size warning
- [x] `git diff --check` 通过

## Phase 40：PM Manual QA Test Pack

- [x] 明确当前可测形态：Tauri 桌面 App 开发版为主，Web 开发面为辅助
- [x] 新增 PM 手动验收清单：`docs/PM_MANUAL_QA_PHASE40.md`
- [x] 新增稳定测试文档：`demo-assets/create-vibecard-sample.md`
- [x] 更新 demo assets 索引
- [x] 启动 `npm run tauri:dev` 验证桌面窗口能打开
- [x] 记录手动验收边界和剩余风险
- [x] commit + push

验收：

- [x] 产品经理能知道测哪个形态
- [x] 产品经理能知道打开哪个文件
- [x] 产品经理能按 Given / When / Then 验收 `Create VibeCard`
- [x] `npm run tauri:dev` 启动成功
- [x] `git diff --check` 通过

## Phase 39：Create VibeCard E2E Acceptance

- [x] 写入 BDD/TDD 规格：`tasks/bdd-tdd-create-vibecard-e2e.md`
- [x] 覆盖真实本地 reading agent loop：`get_current_document` -> `get_document_chunks` -> 3 次 `create_vibecard`
- [x] 少于 3 个 source chunks 时拒绝部分成功，不调用 `create_vibecard`
- [x] `ArtifactPanel` 显示 agent-generated VibeCard 的标题、原文摘录、AI 内容和来源标签
- [x] 确认运行 `Create VibeCard` 后，3 张卡通过 App adapter 写入 Notes / VibeCards 区
- [x] 成功后切到 Notes / VibeCards，并给出 3 张卡创建成功反馈

验收：

- [x] `npm run test -- src/agent/readingTaskModels.test.js src/agent/cardGenerationFlow.test.js src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过（4 files / 38 tests）
- [x] `npm run test -- src/ArtifactPanel.test.jsx` 通过（1 file / 17 tests）
- [x] `npm run test -- src/WorkspaceLayout.test.jsx` 通过（1 file / 16 tests）
- [x] `npm run test` 通过（52 files / 271 tests）
- [x] `npm run build` 通过
- [x] `cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过
- [x] `git diff --check` 通过

## Phase 38：Create VibeCard Agent Entry

- [x] 写入 BDD/TDD 规格：`tasks/bdd-tdd-card-generation-agent-entry.md`
- [x] 将 `card_generation_agent` 产品入口命名为 `Create VibeCard`
- [x] 在 Tasks 面板暴露 `Create VibeCard`
- [x] 运行前弹出写入确认，说明至少创建 3 张 VibeCard
- [x] 用户取消确认时不启动 task
- [x] 用户确认后用本次任务权限开启 `create_vibecard`
- [x] deterministic card model 在足够 chunks 下连续创建 3 张 source-grounded VibeCards
- [x] 通过现有 artifact/VibeCard persistence 链路保存 agent 产物

验收：

- [x] `npm run test -- src/agent/readingTaskModels.test.js src/agent/skills.test.js src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过（4 files / 34 tests）
- [x] `npm run test` 通过（51 files / 267 tests）
- [x] `npm run build` 通过
- [x] `cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过
- [x] `git diff --check` 通过

## Phase 0：保护现场

- [x] 初始化 git，或创建时间戳备份目录
- [x] 创建/更新 `DEVLOG.md`
- [x] 记录当前 webpack build 基线
- [x] 标记当前版本为迁移前基线

验收：

- [x] `git status` 可用，或备份目录存在
- [x] `npm run build` 通过
- [x] `DEVLOG.md` 有 Phase 0 记录

## Phase 1：Tauri v2 壳

- [x] 安装 Tauri v2 依赖
- [x] 迁移 webpack 到 Vite
- [x] 初始化 `src-tauri`
- [x] 配置应用名、bundle id、窗口尺寸、图标
- [x] 添加 scripts：`dev`、`build`、`tauri:dev`、`tauri:build`

验收：

- [x] `npm run dev` 通过
- [x] `npm run build` 通过
- [x] `npm run tauri:dev` 打开桌面窗口

## Phase 2：本地文件打开

- [x] 新增 `src/services/documentService.js`
- [x] 定义统一文档对象
- [x] 新增 `src/store/documentStore.js`
- [x] Tauri 环境接入系统文件选择器
- [x] 浏览器环境保留上传 fallback
- [x] PDF 打开后继续复用 `extractTextFromPDF` 和 `PdfViewer`

验收：

- [x] Tauri 权限包含 dialog + 只读文件读取能力
- [x] 浏览器 dev server 入口可访问
- [x] Tauri dev 窗口可启动
- [x] 文件夹误选会被拦截并提示
- [x] PDF 解析和视觉渲染使用独立二进制副本
- [x] 真实 PDF 文件完成解析
- [x] PDF 视觉渲染成功
- [x] 打开失败有明确错误提示

## Phase 3：阅读器 + AI 双栏工作台

- [x] 新增双栏工作台布局
- [x] 左侧显示文档阅读器
- [x] 右侧显示 AI 面板 Tabs
- [x] 加可拖拽分隔线
- [x] 窄屏/小窗口有降级状态

验收：

- [x] 阅读器和 AI 面板同时可见
- [x] 拖拽不会压坏布局
- [x] 选区注入仍能用

## Phase 4：Stop generating

- [x] BDD/TDD 计划写入 `tasks/bdd-tdd-phase4.md`
- [x] `aiService.chatStream` 支持 `AbortSignal`
- [x] UI 保存当前 `AbortController`
- [x] `ChatInput` loading 时显示停止按钮
- [x] 停止后保留已生成内容

验收：

- [x] 长回复可中断（自动化模拟 AbortError）
- [x] UI 停止 loading（Abort 回调结束 typing/loading）
- [x] 控制台无未捕获异常（构建、测试、PDF QA 未发现新增未捕获异常）
- [x] 真实模型长回复中断手工验收

## Phase 5：Markdown/Text 阅读

- [x] 新增 Markdown 文档阅读器
- [x] 新增 Text 文档阅读器
- [x] HTML 只做安全正文读取，不执行脚本
- [x] 所有文本阅读器支持选区注入

验收：

- [x] `.md` 可打开
- [x] `.txt` 可打开
- [x] `.html` 可安全打开或给出明确提示
- [x] 选区可注入 AI

## Phase 6：PDF 大纲与最小批注

- [x] `pdfDoc.getOutline()` 显示目录
- [x] 点击目录跳转
- [x] 选区创建高亮记录
- [x] 选区创建笔记记录
- [x] 批注保存到本地持久存储

验收：

- [x] 有目录 PDF 可跳转
- [x] 批注列表刷新后仍存在
- [x] 不要求第一版写回 PDF 文件

## Phase 7：演示准备

- [x] 新建 `demo-assets/`
- [x] 准备 PDF/Markdown/Text/HTML 示例文件
- [x] 新建 `docs/DEMO_SCRIPT.md`
- [x] 写 3 分钟和 8 分钟演示脚本
- [x] 按 `docs/ACCEPTANCE_AND_QA.md` 完整验收

验收：

- [x] 3 分钟演示闭环可跑通
- [x] 失败备用路径可执行
- [x] 最终 QA 结果写入 `DEVLOG.md`

## Phase 8：gstack 对齐后的发布硬化

- [x] 新增 `tasks/bdd-tdd-phase8.md`
- [x] MiniMax/AI 生产包通信路径明确并测试（Tauri 原生 HTTP 绕过 CORS）
- [x] 无 API key / 坏 key 用户提示闭环
- [x] 多文档状态隔离验收（App.jsx useEffect + PdfViewer 重置 + documentIsolation 测试）
- [x] Playwright smoke 脚本固化（5 spec 文件 / 20 测试全部通过）
- [x] PDF 批注高亮视觉重绘（rect 坐标存储 + highlightLayer 叠加渲染）
- [x] 包体优化与代码分割（manualChunks + React.lazy，首屏 -80%）
- [x] Tauri 原生 HTTP Stop regression：`AbortSignal` 传入 `@tauri-apps/plugin-http`，取消错误归一为中断态
- [ ] gstack pre-landing review 报告
- [ ] Commit/checkpoint 当前 demo-ready 基线

验收：

- [x] `npm run test` 通过（14 files / 48 tests）
- [x] `npm run build` 通过
- [x] `cd src-tauri && cargo check` 通过
- [x] `npx playwright test` 通过（20 tests）
- [x] 2026-05-31 回归验证：`npm run test` 通过（24 files / 102 tests），`npm run build` 通过，`cd src-tauri && cargo check` 通过
- [ ] Phase 8 结果写入 `DEVLOG.md`

## Phase 9：非线性阅读 P0/P1 任务信封

- [x] gstack 产品方向收束：`docs/GSTACK_PRODUCT_DIRECTION.md`
- [x] P0 拖拽引用：`tasks/codex-drag-to-inject.md`
  - [x] RED 基线：在临时 `HEAD` worktree 复制现有测试后，`src/dragInject.test.js` 2 失败 / 1 通过
  - [x] GREEN：当前工作树 `src/dragInject.test.js` 3 通过
  - [x] 全量测试：`npm run test` 通过（并行任务前 20 文件 / 69 测试；最终 24 文件 / 100 测试）
  - [x] 构建：`npm run build` 通过，保留既有 chunk size warning
- [x] P0 段落级思维树：`tasks/codex-thinking-tree.md`
  - [x] Agent Team Worker A 执行 `paragraphExtractor` + `ThinkingTreePanel` 主实现
  - [x] 定向测试：`src/paragraphExtractor.test.js` 6 测试通过，`src/ThinkingTreePanel.test.jsx` 4 测试通过
  - [x] 集成修复：`PdfViewer.jsx` 段落导航 effect 移到 `goToPage` 初始化之后，避免初始化顺序回归
- [x] P1 双向锚定核心：`tasks/codex-bidirectional-anchor.md`
  - [x] Agent Team Worker B 执行 `bidirectionalAnchor` 核心模块与测试
  - [x] 定向测试：`src/bidirectionalAnchor.test.js` 13 测试通过
  - [ ] UI / PDF / 思维树集成闭环待接入
- [x] P1 AI 注意力导航仪核心：`tasks/codex-attention-navigator.md`
  - [x] Agent Team Worker C 执行 `attentionNavigator` 核心模块与测试
  - [x] 定向测试：`src/attentionNavigator.test.js` 8 测试通过
  - [ ] Attention Navigator 面板与触发入口待接入
- [x] GitHub 开发效率调研
  - [x] Agent Team Researcher 输出可立即应用的 agent workflow 改进
  - [x] 本轮采用：窄上下文子代理、互斥写入范围、任务轨迹、轻量测试/构建 gate

## Phase 10：Reading Agent Runtime Skeleton

- [x] 新增 `tasks/bdd-tdd-reading-agent.md`
- [x] 定义 reading tool registry 边界
- [x] 定义 context packer 输入/输出契约
- [x] 定义 source-grounded artifact schema
- [x] 打通一个最小 Lens Card：选区 -> context pack -> AI -> artifact
- [x] 右侧 Artifacts 面板显示已保存 Lens Card
- [x] Artifact 来源回跳到 PDF 原文页和选区高亮
- [x] LiteParse / Rust PDF 解析 POC 评估：`docs/PDF_PARSE_LITEPARSE_EVALUATION.md`
- [x] PDF 阅读区默认 Fit Width，并随工作区宽度自适应重排
- [x] 修复透明 text layer 横向溢出触发的 PDF 抽搐/反复缩放反馈
- [x] 替换浏览器 favicon、侧边栏图标和 Tauri 应用图标

验收：

- [x] context packer 和 artifact schema 有自动化测试
- [x] Lens Card 输出包含 source span id 或 inference 标记
- [x] 不引入任意文件、shell、网页浏览权限
- [x] `npm run test` 通过（28 files / 113 tests）
- [x] `npm run build` 通过
- [x] `cd src-tauri && cargo check` 通过
- [x] Playwright UI smoke 通过（Artifacts 空状态可见，console/pageerror 为空）
- [x] Playwright PDF smoke 通过（`/Users/mahaoxuan/Downloads/欧游notion pdf.pdf` 上传后 20 次采样 canvas 宽度稳定、无横向 overflow、console/pageerror 为空）

## Phase 11：Web 端产品闭环优先

- [x] 平台顺序决策：先把 Web 端做成真实可用产品，再推进 Tauri App / Rust 强化
- [x] 产品布局决策：Session 侧栏之后是一张阅读纸面，Skim Map 是纸面左边注，PDF 正文居中，右侧 Notes 承载 Lens Cards
- [x] Web 端阅读工作台 viewport QA：桌面、窄屏、浏览器缩放下左读右问不挤压、不裁切
- [x] Web 端 PDF 打开闭环：上传、解析、Fit Width、翻页、缩放、选区稳定
- [x] Web 端非纯文字 PDF 当前页 OCR：扫描页仍可进入阅读器，用户显式点击“识别当前页”，OCR words 生成带 bbox/confidence/source 的 source spans
- [x] Web 端 Lens Card 闭环：选区 -> 生成卡片 -> 保存 artifact -> Notes 列表 -> 回到原文
- [x] Web 端模型配置闭环：无 key、坏 key、代理/CORS 失败都有可理解提示
  - [x] 模型服务配置入口在 Notes/Lens Card 等非 Chat 工作流里可见，点击后切回 Chat 并打开配置弹窗
  - [x] 坏 key、代理/CORS、provider 不可用的错误归因和提示继续补齐
- [x] Web 端持久化闭环：刷新后保留文档相关 artifacts / annotations，且不同文档隔离
  - [x] 浏览器 runtime 下 document records 有 localStorage fallback，刷新后 Recent documents 有恢复入口；不自动打开缺少正文的 recent-only 文档
  - [x] 同一文件重开使用稳定 document id，artifacts / annotations 可按文档恢复并隔离其他文档
- [x] Web 端演示脚本更新：用浏览器路径先跑通核心产品叙事
- [x] 桌面端差异清单：标明哪些能力后续由 Tauri/Rust 增强，不阻塞 Web 端发布

验收：

- [x] Web BDD 行为文档落盘：`tasks/bdd-tdd-phase11-web-closure.md`
- [x] 相关定向测试通过：`src/WorkspaceLayout.test.jsx`、`src/ThinkingTreePanel.test.jsx`
- [x] `npm run test` 通过（29 files / 114 tests）
- [x] `npm run build` 通过，保留既有 chunk size warning
- [x] Playwright Web smoke 覆盖空文档布局：Skim Map 和 Reader 共享同一 reading surface，右侧 Notes 顺序正确，console/pageerror 为空
- [x] Playwright PDF smoke 覆盖真实同名 PDF：`工业机器人应用、制造业就业转移与劳动者健康-蔚金霞.pdf` 40 次采样 canvas/page shell 宽度稳定，console/pageerror 为空
- [x] Playwright PDF 划词 smoke 覆盖真实鼠标拖拽：选中 160 字纯 PDF 正文，不混入侧栏/标题文本，工具条位于 PDF 滚动区内，异常超宽 text span 数量为 0
- [x] OCR 行为文档落盘：`tasks/bdd-tdd-pdf-ocr-current-page.md`
- [x] OCR 自动化验证：`npm run test` 通过（32 files / 123 tests），`npm run build` 通过，`git diff --check` 通过
- [x] OCR / 文字层页面级 smoke：无文字层 PDF 显示“当前页没有可选文字”和“识别当前页”；文本型 PDF 显示“当前页可划词”且隐藏 OCR 入口
- [x] Phase 11 结果写入 `DEVLOG.md`

## Phase 12：Rust Local Index Foundation

- [x] BDD/TDD 行为文档落盘：`tasks/bdd-tdd-rust-source-index.md`
- [x] SQLite source span 表：按 document_id 保存页码、paragraphId、chunkId、sourceType、metadataJson、orderIndex 和 normalized text
- [x] Rust storage core 支持 `replace_source_spans` / `list_source_spans` / `search_source_spans`
- [x] Tauri command contract 支持 `storage_replace_source_spans` / `storage_list_source_spans` / `storage_search_source_spans`
- [x] JS bridge functions 支持 `replacePersistentSourceSpans` / `listPersistentSourceSpans` / `searchPersistentSourceSpans`
- [x] 浏览器 runtime 下 source index bridge 安全空返回，不阻塞 Web-first 产品路径
- [x] BDD/TDD 行为文档落盘：`tasks/bdd-tdd-rust-source-index-bridge.md`
- [x] 前端 `sourceIndexService` 支持 retrieval chunk -> source span 映射
- [x] Tauri runtime 下 Chat retrieval 优先写入 / 搜索 Rust source index
- [x] 浏览器 runtime 下 Chat retrieval 保持现有 JS 检索路径，不调用 Rust source span storage
- [x] Rust search 为空或失败时回退到现有 JS retrieval
- [x] Source index renderer-session cache：同一文档版本连续提问不重复 replace `source_spans`
- [x] Source index cache invalidation：同一 `documentId` 的正文/版本签名变化后重建 source index
- [x] SQLite `source_index_status`：保存 `documentId/indexSignature/spanCount/indexedAt`
- [x] Source index freshness：renderer cache 清空后可用 SQLite 状态跳过重复 replace
- [x] 文档打开/解析完成后主动调度 `indexDocumentSourceSpans`，Chat retrieval 保留兜底 ensure

验收：

- [x] RED：`cargo test --test storage_core source_spans` 先失败于缺少 `SourceSpanInput` 和 source span storage 方法
- [x] RED：`npm run test -- src/services/persistentStorage.test.js` 先失败于缺少 source span bridge functions
- [x] RED：`npm run test -- src/services/sourceIndexService.test.js` 先失败于缺少 `sourceIndexService`
- [x] GREEN：`cargo test --test storage_core source_spans` 通过（2 tests）
- [x] GREEN：`npm run test -- src/services/persistentStorage.test.js` 通过（4 tests）
- [x] 相关 JS 验证：`npm run test -- src/services/persistentStorage.test.js src/retrievalContext.test.js` 通过（2 files / 12 tests）
- [x] Indexed retrieval 验证：`npm run test -- src/services/sourceIndexService.test.js src/App.retrievalContext.test.jsx` 通过（2 files / 14 tests）
- [x] Retrieval/storage 回归：`npm run test -- src/retrievalContext.test.js src/services/persistentStorage.test.js src/services/sourceIndexService.test.js src/App.retrievalContext.test.jsx` 通过（4 files / 26 tests）
- [x] RED：`npm run test -- src/services/sourceIndexService.test.js` 先失败于缺少 `clearSourceIndexCache`
- [x] GREEN：`npm run test -- src/services/sourceIndexService.test.js` 通过（1 file / 7 tests）
- [x] Cache/retrieval 回归：`npm run test -- src/services/sourceIndexService.test.js src/App.retrievalContext.test.jsx src/retrievalContext.test.js src/services/persistentStorage.test.js` 通过（4 files / 28 tests）
- [x] RED：`cargo test --test storage_core source_index_status` 先失败于缺少 `SourceIndexStatusInput` 和 status storage 方法
- [x] RED：`npm run test -- src/services/persistentStorage.test.js` 先失败于缺少 `loadPersistentSourceIndexStatus` / `savePersistentSourceIndexStatus`
- [x] RED：`npm run test -- src/services/sourceIndexService.test.js` 先失败于 renderer cache 清空后仍重复 replace source spans
- [x] RED：`npm run test -- src/WorkspaceLayout.test.jsx` 先失败于打开文档后未调用 `indexDocumentSourceSpans`
- [x] Source index status 验证：`cargo test --test storage_core source_index_status` 通过（1 filtered test）
- [x] Source ingestion/retrieval 组合验证：`npm run test -- src/services/sourceIndexService.test.js src/services/persistentStorage.test.js src/WorkspaceLayout.test.jsx src/App.retrievalContext.test.jsx src/retrievalContext.test.js` 通过（5 files / 32 tests）
- [x] 全量前端测试：`npm run test` 通过（47 files / 208 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt && cargo fmt --check && cargo check && cargo test` 通过（16 storage tests + 1 command test 通过）
- [x] 格式检查：`git diff --check` 通过

## Phase 13：Rust Task State Foundation

- [x] BDD/TDD 行为文档落盘：`tasks/bdd-tdd-task-state.md`
- [x] SQLite `task_records`：保存 `id/document_id/type/status/title/progress/payload_json/result_json/error_message/created_at/updated_at/started_at/completed_at/cancelled_at`
- [x] Task status 约束为 `pending` / `running` / `succeeded` / `failed` / `cancelled`
- [x] Rust storage core 支持 `upsert_task` / `load_task` / `list_tasks`
- [x] Tauri command contract 支持 `storage_upsert_task` / `storage_load_task` / `storage_list_tasks`
- [x] JS bridge functions 支持 `savePersistentTask` / `loadPersistentTask` / `listPersistentTasks`
- [x] 浏览器 runtime 下 task bridge 安全 no-op，不调用 Tauri
- [x] `indexDocumentSourceSpans` 记录 `source_index` 任务 `running` -> `succeeded`
- [x] source indexing 失败时记录 `failed`，并保留原错误继续抛给调用方

验收：

- [x] RED：`cargo test --test storage_core task` 先失败于缺少 `TaskInput` 和 task storage 方法
- [x] RED：`npm run test -- src/services/persistentStorage.test.js` 先失败于缺少 task bridge functions
- [x] RED：`npm run test -- src/services/sourceIndexService.test.js` 先失败于没有记录 source indexing task state
- [x] GREEN：`cargo test --test storage_core task` 通过（2 filtered tests）
- [x] GREEN：`npm run test -- src/services/persistentStorage.test.js` 通过（1 file / 4 tests）
- [x] GREEN：`npm run test -- src/services/sourceIndexService.test.js` 通过（1 file / 10 tests）
- [x] 全量前端测试：`npm run test` 通过（47 files / 210 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test）

## Phase 14：Task State UI and Reading Task Adoption

- [x] BDD/TDD 行为文档落盘：`tasks/bdd-tdd-task-state-ui.md`
- [x] Summary 章节摘要生成记录 `section_summary` 任务状态
- [x] Summary 生成失败记录 `failed` 和错误原因
- [x] Attention Navigator 分析记录 `attention_analysis` 任务状态
- [x] Attention 分析失败记录 `failed` 和错误原因
- [x] 新增 `TaskStatusPanel`，按当前文档列出任务 title/type/status/progress/error
- [x] 右侧工具区新增 `Tasks` tab
- [x] 浏览器/no task 场景显示安全空状态

验收：

- [x] RED：`npm run test -- src/SummaryCard.test.jsx` 先失败于未写 `section_summary` task state
- [x] RED：`npm run test -- src/AttentionNavigatorPanel.test.jsx` 先失败于未写 `attention_analysis` task state
- [x] RED：`npm run test -- src/TaskStatusPanel.test.jsx` 先失败于缺少 `TaskStatusPanel`
- [x] GREEN：`npm run test -- src/SummaryCard.test.jsx src/AttentionNavigatorPanel.test.jsx src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过（4 files / 19 tests）
- [x] 全量前端测试：`npm run test` 通过（48 files / 216 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test）

## Phase 15：Task 状态实时刷新

- [x] 新增 `tasks/bdd-tdd-task-live-refresh.md`
- [x] `savePersistentTask` 成功写入 Tauri storage 后发出本地 task update 事件
- [x] `TaskStatusPanel` 监听当前文档 task update 事件并刷新任务快照
- [x] 其它文档 task update 事件不会刷新当前文档面板
- [x] 浏览器 no-op 路径不派发成功事件

验收：

- [x] RED：`npm run test -- src/services/persistentStorage.test.js src/TaskStatusPanel.test.jsx` 先失败于没有 task update 事件和面板订阅
- [x] GREEN：`npm run test -- src/services/persistentStorage.test.js src/TaskStatusPanel.test.jsx` 通过（2 files / 9 tests）
- [x] 全量前端测试：`npm run test` 通过（48 files / 219 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test）

## Phase 16：Source Index 任务重试

- [x] 新增 `tasks/bdd-tdd-task-source-index-retry.md`
- [x] failed / cancelled 的 `source_index` task 在 Tasks 面板显示 Retry
- [x] Retry 会把完整 task record 交给 `onRetryTask`
- [x] App 只对当前文档的 `source_index` task 执行重试
- [x] 重试调用现有 `indexDocumentSourceSpans(currentDocument)`，不伪造 Summary / Attention executor

验收：

- [x] RED：`npm run test -- src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` 先失败于缺少 Retry 按钮和 App retry callback
- [x] GREEN：`npm run test -- src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过（2 files / 9 tests）
- [x] 全量前端测试：`npm run test` 通过（48 files / 221 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test）

## Phase 17：PRD Reading Tool Registry

- [x] 新增 `tasks/bdd-tdd-reading-tool-registry-prd-names.md`
- [x] Agent registry 暴露 PRD 可读工具名：`get_current_document` / `get_page_text` / `search_document` / `get_document_chunks`
- [x] 保留既有 legacy 工具：`extractText` / `navigatePage` / `listAnnotations`
- [x] `get_current_document` 只返回安全 metadata，不返回 `contentText` / `pages`
- [x] `search_document` 返回当前文档内 bounded、source-locatable matches
- [x] `get_document_chunks` 返回当前文档内 bounded chunks，并支持 query 过滤
- [x] 默认权限允许 PRD 读工具，继续拒绝 `create_vibecard` / `create_annotation` / `export_note`

验收：

- [x] RED：`npm run test -- src/agent/tools.test.js src/agent/permissions.test.js` 先失败于缺少 PRD 工具函数、registry entries 和默认权限项
- [x] GREEN：`npm run test -- src/agent/tools.test.js src/agent/permissions.test.js` 通过（2 files / 12 tests）
- [x] Agent 相关扩展验证：`npm run test -- src/agent/tools.test.js src/agent/permissions.test.js src/agent/runtime.test.js src/agent/index.test.js` 通过（4 files / 18 tests）
- [x] 全量前端测试：`npm run test` 通过（48 files / 225 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test）
- [x] diff whitespace 检查：`git diff --check` 通过

## Phase 18：Permission-gated PRD Write Tools

- [x] 新增 `tasks/bdd-tdd-reading-tool-registry-gated-writes.md`
- [x] Agent registry 暴露 PRD 工具名：`list_attention_insights` / `create_vibecard` / `create_annotation` / `export_note`
- [x] `list_attention_insights` 默认允许，作为当前文档只读工具
- [x] `create_vibecard` / `create_annotation` / `export_note` 默认拒绝
- [x] 写入/导出工具必须同时进入 `allowedTools` 且打开对应能力 flag 才可调用
- [x] 写入/导出工具只委托 adapter，不在 tool 内直接改状态或文件
- [x] 缺少写入/导出 adapter 时抛出明确错误

验收：

- [x] RED：`npm run test -- src/agent/tools.test.js src/agent/permissions.test.js` 先失败于缺少 PRD 写入/导出工具函数、registry entries 和权限 flags
- [x] GREEN：`npm run test -- src/agent/tools.test.js src/agent/permissions.test.js` 通过（2 files / 16 tests）
- [x] Agent 相关扩展验证：`npm run test -- src/agent/tools.test.js src/agent/permissions.test.js src/agent/runtime.test.js src/agent/index.test.js` 通过（4 files / 22 tests）
- [x] 全量前端测试：`npm run test` 通过（48 files / 229 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test）
- [x] diff whitespace 检查：`git diff --check` 通过

## Phase 19：Agent Task Runner

- [x] 新增 `tasks/bdd-tdd-agent-task-runner.md`
- [x] 新增 `runReadingAgentTask`
- [x] Agent task 成功时记录 `pending` -> `running` -> `succeeded`
- [x] Agent 返回非 completed 状态时记录 `failed`
- [x] Agent runner 抛错时记录 `failed`，并保留原错误信息
- [x] task result 保存 agent status、content 和 artifact count
- [x] `src/agent/index.js` 导出 task runner

验收：

- [x] RED：`npm run test -- src/agent/taskRunner.test.js src/agent/index.test.js` 先失败于缺少 `taskRunner` 模块和公共导出
- [x] GREEN：`npm run test -- src/agent/taskRunner.test.js src/agent/index.test.js` 通过（2 files / 4 tests）
- [x] Agent 相关扩展验证：`npm run test -- src/agent/tools.test.js src/agent/permissions.test.js src/agent/runtime.test.js src/agent/taskRunner.test.js src/agent/index.test.js` 通过（5 files / 25 tests）
- [x] 全量前端测试：`npm run test` 通过（49 files / 232 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test）
- [x] diff whitespace 检查：`git diff --check` 通过

## Phase 20：Retryable Agent Task Payload

- [x] 新增 `tasks/bdd-tdd-agent-task-retry-payload.md`
- [x] `runReadingAgentTask` 保存 `payload.agentOptions`
- [x] 已有 payload 字段在保存 agent options 时不丢失
- [x] 新增 `retryReadingAgentTask`
- [x] `retryReadingAgentTask` 可从 `payload` 或 `payloadJson` 解析 agent options
- [x] retry 复用原 task id / documentId / type / title
- [x] 缺少 agent options 时抛出明确错误

验收：

- [x] RED：`npm run test -- src/agent/taskRunner.test.js src/agent/index.test.js` 先失败于未保存 `payload.agentOptions`、缺少 `retryReadingAgentTask` 和公共导出
- [x] GREEN：`npm run test -- src/agent/taskRunner.test.js src/agent/index.test.js` 通过（2 files / 6 tests）
- [x] Agent 相关扩展验证：`npm run test -- src/agent/tools.test.js src/agent/permissions.test.js src/agent/runtime.test.js src/agent/taskRunner.test.js src/agent/index.test.js` 通过（5 files / 27 tests）
- [x] 全量前端测试：`npm run test` 通过（49 files / 234 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test）
- [x] diff whitespace 检查：`git diff --check` 通过

## Phase 21：Agent Task UI Retry

- [x] 新增 `tasks/bdd-tdd-agent-task-ui-retry.md`
- [x] `TaskStatusPanel` 对 failed / cancelled 的 `_agent` task 显示 Retry
- [x] Retry 会把完整 Agent task record 交给 `onRetryTask`
- [x] App 对当前文档的 `_agent` task 调用 `retryReadingAgentTask(task)`
- [x] App 保留 `source_index` retry 走 `indexDocumentSourceSpans(currentDocument)`
- [x] Agent retry 不误触 source indexing

验收：

- [x] RED：`npm run test -- src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` 先失败于 Agent task 不显示 Retry、App 未调用 `retryReadingAgentTask`
- [x] GREEN：`npm run test -- src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过（2 files / 11 tests）
- [x] 全量前端测试：`npm run test` 通过（49 files / 236 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test）
- [x] diff whitespace 检查：`git diff --check` 通过

## Phase 22：Paper Overview Agent Entry

- [x] 新增 `tasks/bdd-tdd-paper-overview-agent-entry.md`
- [x] `TaskStatusPanel` 在有当前文档时显示 `Paper overview` 启动按钮
- [x] 没有当前文档时不显示 Agent 启动入口
- [x] App 从 Tasks 面板启动当前文档的 `paper_overview_agent`
- [x] `paper_overview_agent` 使用现有 `runReadingAgentTask` 写入 task lifecycle
- [x] 本地 deterministic paper overview model 调用只读工具 `get_current_document` / `get_document_chunks`
- [x] `paper_overview_agent` retry 会重建当前文档的本地 runtime options
- [x] `runReadingAgentTask` 保留调用方提供的可序列化 `payload.agentOptions`，避免把函数和 tool closure 当成 retry payload 持久化

验收：

- [x] RED：`npm run test -- src/agent/taskRunner.test.js src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` 先失败于缺少 `Paper overview` 按钮、App 未调用 `runReadingAgentTask`、runtime options 覆盖 serialized payload
- [x] GREEN：`npm run test -- src/agent/taskRunner.test.js src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过（3 files / 20 tests）
- [x] 全量前端测试：`npm run test` 通过（49 files / 240 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test）
- [x] diff whitespace 检查：`git diff --check` 通过

## Phase 23：Task Result Preview

- [x] 新增 `tasks/bdd-tdd-task-result-preview.md`
- [x] `TaskStatusPanel` 对 succeeded task 显示 `result.content` 短预览
- [x] 长结果预览有长度上限并显示省略号
- [x] 没有结果内容时不显示空预览容器

验收：

- [x] RED：`npm run test -- src/TaskStatusPanel.test.jsx` 先失败于缺少 `.task-status-result`
- [x] GREEN：`npm run test -- src/TaskStatusPanel.test.jsx` 通过（1 file / 10 tests）
- [x] 目标组合测试：`npm run test -- src/agent/taskRunner.test.js src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过（3 files / 22 tests）
- [x] 全量前端测试：`npm run test` 通过（49 files / 242 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test）
- [x] diff whitespace 检查：`git diff --check` 通过
- [x] localhost smoke：Playwright 打开 `http://127.0.0.1:3217/`，确认 `VibeReader Dev` 和 `Tasks` 可见

## Phase 24：Task Result To Note

- [x] 新增 `tasks/bdd-tdd-task-result-to-note.md`
- [x] `TaskStatusPanel` 对有结果内容的 succeeded task 显示 `Save to Notes`
- [x] 空结果 task 不显示保存入口
- [x] `ArtifactPanel` 支持 `reading_note` artifact 展示
- [x] App 将当前文档的 task result 保存为 `reading_note` artifact 并切到 Notes/Artifacts

验收：

- [x] RED：`npm run test -- src/TaskStatusPanel.test.jsx src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx` 先失败于缺少保存入口、Reading Note 展示和 App artifact 创建
- [x] GREEN：`npm run test -- src/TaskStatusPanel.test.jsx src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过（3 files / 31 tests）
- [x] 目标组合测试：`npm run test -- src/agent/taskRunner.test.js src/TaskStatusPanel.test.jsx src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过（4 files / 37 tests）
- [x] 全量前端测试：`npm run test` 通过（49 files / 246 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test）
- [x] diff whitespace 检查：`git diff --check` 通过

## Phase 25：Task Result Source Refs

- [x] 新增 `tasks/bdd-tdd-task-result-source-refs.md`
- [x] `runReadingAgent` 保留 final response 的 `sourceRefs`
- [x] `runReadingAgentTask` 将 agent `sourceRefs` 写入 task result
- [x] 本地 `paper_overview_agent` 输出 bounded chunk source refs
- [x] 保存 task result 到 Notes 时，`reading_note` artifact 保留 `currentContent.sourceRefs`
- [x] 有来源的 Reading Note 标记为 `grounded` 并写入 `sourceSpanIds`
- [x] Notes 面板显示 Reading Note 来源标签

验收：

- [x] RED：`npm run test -- src/agent/runtime.test.js` 先失败于 runtime 未保留 final response source refs
- [x] RED：`npm run test -- src/agent/taskRunner.test.js src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx` 先失败于 task result 和 reading note artifact 未保留 source refs
- [x] GREEN：`npm run test -- src/agent/runtime.test.js src/agent/taskRunner.test.js src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过（4 files / 32 tests）
- [x] 全量前端测试：`npm run test` 通过（49 files / 248 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test）
- [x] diff whitespace 检查：`git diff --check` 通过

## Phase 26：Reading Note Export Source Refs

- [x] 新增 `tasks/bdd-tdd-reading-note-export-source-refs.md`
- [x] Rust `export_reading_note` 导出 `reading_note` artifact 的正文
- [x] Markdown 导出显示 `sourceRefs` 页码和段落锚点
- [x] 无 `sourceRefs` 时保留普通 VibeCard 来源页 fallback
- [x] JSON payload 继续保留原始 `aiContent/sourceRefs`

验收：

- [x] RED：`cargo test --test storage_core reading_note_export_renders_artifact_body_and_source_refs` 先失败于 Markdown 未包含 `reading_note` 正文
- [x] GREEN：`cargo test --test storage_core reading_note_export_renders_artifact_body_and_source_refs` 通过（1 test）
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（19 storage tests + 1 command test）
- [x] 全量前端测试：`npm run test` 通过（49 files / 248 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning

## Phase 27：Reading Note Source Links

- [x] 新增 `tasks/bdd-tdd-reading-note-source-links.md`
- [x] Reading Note Markdown 中的 source refs 渲染为页码/段落链接
- [x] 文末生成 `## Sources` 区块
- [x] Sources 区块包含稳定 HTML anchor 和原文摘录
- [x] 相同 anchor 的来源在 Sources 区块中去重

验收：

- [x] RED：`cargo test --test storage_core reading_note_export_renders_artifact_body_and_source_refs` 先失败于缺少 `[P2 page-2-para-0](#source-p2-page-2-para-0)` 链接
- [x] GREEN：`cargo test --test storage_core reading_note_export_renders_artifact_body_and_source_refs` 通过（1 test）
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（19 storage tests + 1 command test）
- [x] 全量前端测试：`npm run test` 通过（49 files / 248 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning

## Phase 28：Export Filenames

- [x] 新增 `tasks/bdd-tdd-export-filenames.md`
- [x] 完整 Reading Note Markdown / JSON 下载文件名包含清理后的文档名和日期
- [x] Selected VibeCards Markdown / Obsidian Markdown 下载文件名包含清理后的文档名、导出类型和日期
- [x] `ArtifactPanel` 在缺少文档名时继续 fallback 到 `documentId`
- [x] App 将 `currentDocument.name` 传入 Notes export 面板

验收：

- [x] RED：`npm run test -- src/ArtifactPanel.test.jsx` 先失败于下载文件名仍为 `vibereader-doc-1-...`
- [x] GREEN：`npm run test -- src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过（2 files / 22 tests）
- [x] 全量前端测试：`npm run test` 通过（49 files / 250 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（19 storage tests + 1 command test）

## Phase 29：Exported At Timestamp

- [x] 新增 `tasks/bdd-tdd-exported-at.md`
- [x] Rust `export_reading_note` 返回 `exportedAt`
- [x] JSON payload 包含 `exportedAt`
- [x] Markdown metadata 显示 `Exported At`
- [x] 完整 Reading Note Markdown / JSON 文件名日期使用 `exportedAt`
- [x] Selected VibeCards 导出继续保持前端即时日期

验收：

- [x] RED：`npm run test -- src/ArtifactPanel.test.jsx` 先失败于文件名仍使用浏览器当前日期
- [x] RED：`cargo test --test storage_core builds_markdown_reading_note_export_without_secrets` 先编译失败于 `ReadingNoteExport` 缺少 `exported_at`
- [x] GREEN：`npm run test -- src/ArtifactPanel.test.jsx` 通过（1 file / 14 tests）
- [x] GREEN：`cargo test --test storage_core builds_markdown_reading_note_export_without_secrets` 通过（1 test）
- [x] 全量前端测试：`npm run test` 通过（49 files / 250 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（19 storage tests + 1 command test）
- [x] Whitespace 检查：`git diff --check` 通过

## Phase 30：Reading Note Export Schema

- [x] 新增 `tasks/bdd-tdd-reading-note-export-schema.md`
- [x] Rust `export_reading_note` 返回 `exportType`
- [x] Rust `export_reading_note` 返回 `schemaVersion`
- [x] JSON payload 顶层包含 `exportType: "reading_note"`
- [x] JSON payload 顶层包含 `schemaVersion: 1`

验收：

- [x] RED：`cargo test --test storage_core builds_markdown_reading_note_export_without_secrets` 先编译失败于 `ReadingNoteExport` 缺少 `export_type/schema_version`
- [x] GREEN：`cargo test --test storage_core builds_markdown_reading_note_export_without_secrets` 通过（1 test）
- [x] 全量前端测试：`npm run test` 通过（49 files / 250 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（19 storage tests + 1 command test）
- [x] Whitespace 检查：`git diff --check` 通过

## Phase 31：Reading Note JSON Import

- [x] 新增 `tasks/bdd-tdd-reading-note-json-import.md`
- [x] Rust `import_reading_note_json` 校验 `exportType/schemaVersion`
- [x] Rust 可把 Reading Note JSON 导入 SQLite
- [x] 导入恢复 document metadata、summaries、annotations、vibecards、flashcard decks、attention insights、thinking tree、conversations
- [x] 重复导入按文档替换导出覆盖的集合，避免追加重复 rows
- [x] Tauri command `storage_import_reading_note_json`
- [x] 前端 adapter `importPersistentReadingNoteJson`

验收：

- [x] RED：`cargo test --test storage_core import_reading_note` 先失败于 `Storage` 缺少 `import_reading_note_json`
- [x] RED：`npm run test -- src/services/persistentStorage.test.js` 先失败于缺少 `importPersistentReadingNoteJson`
- [x] GREEN：`cargo test --test storage_core imports_reading_note_export_json_into_storage` 通过（1 test）
- [x] GREEN：`cargo test --test storage_core reading_note_json` 通过（1 test）
- [x] GREEN：`npm run test -- src/services/persistentStorage.test.js` 通过（1 file / 5 tests）
- [x] 全量前端测试：`npm run test` 通过（49 files / 250 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（21 storage tests + 1 command test）
- [x] Whitespace 检查：`git diff --check` 通过

## Phase 32：Reading Note JSON Import UI

- [x] 新增 `tasks/bdd-tdd-reading-note-json-import-ui.md`
- [x] Notes / Export 工具栏新增 `Import JSON` 入口
- [x] 支持粘贴 Reading Note JSON 后导入
- [x] 支持选择 `.json` 文件并填入导入输入框
- [x] 导入调用 `importPersistentReadingNoteJson`
- [x] 导入成功后回调 App 刷新最近文档
- [x] 导入当前文档时刷新 Notes / VibeCards 列表

验收：

- [x] RED：`npm run test -- src/ArtifactPanel.test.jsx` 先失败于找不到 `Import JSON` 按钮
- [x] RED：`npm run test -- src/WorkspaceLayout.test.jsx` 先失败于 `ArtifactPanel` 未收到 `onReadingNoteImported`
- [x] GREEN：`npm run test -- src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过（2 files / 25 tests）
- [x] 全量前端测试：`npm run test` 通过（49 files / 253 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（21 storage tests + 1 command test）
- [x] Whitespace 检查：`git diff --check` 通过

## Phase 33：Document Content Persistence Foundation

- [x] 新增 `tasks/bdd-tdd-document-content-persistence.md`
- [x] Rust SQLite 新增 `document_contents` 表
- [x] Rust storage 支持 `upsert_document_content` / `load_document_content`
- [x] Tauri command 新增 `storage_upsert_document_content` / `storage_load_document_content`
- [x] 前端 adapter 新增 `savePersistentDocumentContent` / `loadPersistentDocumentContent`
- [x] Markdown / Text / HTML 打开后保存正文到 Rust storage
- [x] Recent 文本文档点击后加载 persisted content 并恢复阅读器
- [x] Browser runtime 保持 metadata-only fallback，不把正文写进 Recent metadata

验收：

- [x] RED：`cargo test --test storage_core document_content` 先失败于缺少 `DocumentContentInput` 与 storage 方法
- [x] GREEN：`cargo test --test storage_core document_content` 通过（1 test）
- [x] RED：`npm run test -- src/services/persistentStorage.test.js` 先失败于缺少 document content adapter
- [x] GREEN：`npm run test -- src/services/persistentStorage.test.js` 通过（1 file / 6 tests）
- [x] RED：`npm run test -- src/WorkspaceLayout.test.jsx` 先失败于 App 未保存正文、Recent 未恢复正文
- [x] GREEN：`npm run test -- src/WorkspaceLayout.test.jsx` 通过（1 file / 11 tests）
- [x] 全量前端测试：`npm run test` 通过（49 files / 256 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（22 storage tests + 1 command test）
- [x] Whitespace 检查：`git diff --check` 通过

## Phase 34：Reading Note Document Content Export

- [x] 新增 `tasks/bdd-tdd-reading-note-document-content.md`
- [x] Reading Note JSON payload 新增可选 `documentContent`
- [x] `export_reading_note` 导出当前文档 persisted content
- [x] `import_reading_note_json` 导入 `documentContent` 时恢复 `document_contents`
- [x] 旧 schema v1 JSON 缺少 `documentContent` 时仍可导入
- [x] 前端 `exportPersistentReadingNote` 保持 `documentContent` 字段透传

验收：

- [x] RED：`cargo test --test storage_core reading_note` 先失败于 JSON 缺少 `documentContent`，导入后 `load_document_content` 为空
- [x] GREEN：`cargo test --test storage_core reading_note` 通过（4 tests）
- [x] GREEN：`npm run test -- src/services/persistentStorage.test.js` 通过（1 file / 6 tests）
- [x] 全量前端测试：`npm run test` 通过（49 files / 256 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（22 storage tests + 1 command test）
- [x] Whitespace 检查：`git diff --check` 通过

## Phase 35：Reading Agent Skill Registry

- [x] 新增 `tasks/bdd-tdd-reading-agent-skill-registry.md`
- [x] 新增 `src/agent/skills.js`
- [x] 注册首批 reading task skills：`paper_overview_agent` / `attention_agent` / `card_generation_agent` / `note_export_agent`
- [x] 每个 skill 明确 `skillPath`、`requiredTools`、`outputArtifactType`、`goal` 和 `maxIterations`
- [x] `App` 启动 `paper_overview_agent` 时通过 registry 构造可序列化 task payload
- [x] 新增 `docs/reading-agent-skills/` 下 4 份 skill contract 文档

验收：

- [x] RED：`npm run test -- src/agent/skills.test.js` 先失败于缺少 `src/agent/skills.js`
- [x] RED：`npm run test -- src/WorkspaceLayout.test.jsx` 先失败于 paper overview task payload 缺少 `skillPath` 和 `requiredTools`
- [x] GREEN：`npm run test -- src/agent/skills.test.js src/WorkspaceLayout.test.jsx` 通过（2 files / 14 tests）
- [x] 全量前端测试：`npm run test` 通过（50 files / 259 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（22 storage tests + 1 command test）
- [x] Whitespace 检查：`git diff --check` 通过

## Phase 36：Attention Agent Entry

- [x] 新增 `tasks/bdd-tdd-attention-agent-entry.md`
- [x] `TaskStatusPanel` 支持通过 `agentSkills` 渲染多个可启动 reading agent
- [x] `App` 将 runnable skills 限定为 `paper_overview_agent` 和 `attention_agent`
- [x] 新增本地 deterministic `attention_agent` model
- [x] `attention_agent` 调用 `get_current_document` / `list_attention_insights` / `get_document_chunks`
- [x] `attention_agent` task result 保留 source refs
- [x] App 内 `createReadingTools` 接入 `listPersistentAttentionInsights` adapter
- [x] `.task-status-agent-actions` 支持多个 task 按钮紧凑换行

验收：

- [x] RED：`npm run test -- src/TaskStatusPanel.test.jsx` 先失败于找不到 `Attention route` 启动按钮
- [x] GREEN：`npm run test -- src/TaskStatusPanel.test.jsx` 通过（1 file / 13 tests）
- [x] RED：`npm run test -- src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` 先失败于 App 未启动 `attention_agent`
- [x] GREEN：`npm run test -- src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过（2 files / 25 tests）
- [x] 全量前端测试：`npm run test` 通过（50 files / 261 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（22 storage tests + 1 command test）
- [x] Whitespace 检查：`git diff --check` 通过

## Phase 37：Reading Agent Model Boundary

- [x] 新增 `tasks/bdd-tdd-reading-agent-model-boundary.md`
- [x] 新增 `src/agent/readingTaskModels.js`
- [x] 新增 `src/agent/readingTaskModels.test.js`
- [x] 把 `paper_overview_agent` 本地模型从 `App.jsx` 抽到 agent 模块
- [x] 把 `attention_agent` 本地模型从 `App.jsx` 抽到 agent 模块
- [x] `src/agent/index.js` 导出 reading task models
- [x] `WorkspaceLayout.test.jsx` mock 同步新增模型工厂导出

验收：

- [x] RED：`npm run test -- src/agent/readingTaskModels.test.js` 先失败于缺少 `readingTaskModels` 模块
- [x] GREEN：`npm run test -- src/agent/readingTaskModels.test.js` 通过（1 file / 1 test）
- [x] RED：新增 attention route 行为后，同一测试先失败于 attention model 仍返回占位 final
- [x] GREEN：`npm run test -- src/agent/readingTaskModels.test.js` 通过（1 file / 2 tests）
- [x] 定向回归：`npm run test -- src/agent/readingTaskModels.test.js src/WorkspaceLayout.test.jsx src/TaskStatusPanel.test.jsx` 通过（3 files / 27 tests）
- [x] 全量前端测试：`npm run test` 通过（51 files / 263 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示）
- [x] 前端构建：`npm run build` 通过，保留既有 chunk size warning
- [x] Rust 标准验证：`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（22 storage tests + 1 command test）
- [x] Whitespace 检查：`git diff --check` 通过

## Review

2026-06-12：继续推进 Phase 37，把 `paper_overview_agent` 和 `attention_agent` 的 deterministic 本地模型从 `App.jsx` 抽到 `src/agent/readingTaskModels.js`。新增 `tasks/bdd-tdd-reading-agent-model-boundary.md` 和模型行为测试，覆盖 tool 调用顺序、空/截断 fallback 继承点，以及 insight/chunk source refs 组装。`App.jsx` 现在只从 agent 模块导入模型并负责 document、tool adapter、task runner wiring；`WorkspaceLayout.test.jsx` 的 `./agent` mock 同步公开新模型工厂。验证：红灯先失败于缺少 `readingTaskModels` 模块，随后 attention 行为红灯失败于占位 final；实现后定向回归 `npm run test -- src/agent/readingTaskModels.test.js src/WorkspaceLayout.test.jsx src/TaskStatusPanel.test.jsx` 通过（3 files / 27 tests），全量 `npm run test` 通过（51 files / 263 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（22 storage tests + 1 command test），`git diff --check` 通过。剩余风险：本切片只调整本地 deterministic model 边界，不新增 planner、云模型执行或 Agent 权限 UI。

2026-06-12：继续推进 Phase 36，把 registry 中的 `attention_agent` 接成第二个可运行 reading task。新增 `tasks/bdd-tdd-attention-agent-entry.md`；`TaskStatusPanel` 现在支持通过 `agentSkills` 渲染多个可启动 reading agent；`App` 将 runnable skills 限定为 `paper_overview_agent` 和 `attention_agent`，并传给 Tasks 面板。新增本地 deterministic `attention_agent` model，按顺序调用 `get_current_document`、`list_attention_insights`、`get_document_chunks`，生成 `# Attention route` task result，并保留 insight/chunk source refs。App 内 `createReadingTools` 已接入 `listPersistentAttentionInsights` adapter。验证：红灯先失败于找不到 `Attention route` 启动按钮、App 未启动 `attention_agent`；实现后 `npm run test -- src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过（2 files / 25 tests），全量 `npm run test` 通过（50 files / 261 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（22 storage tests + 1 command test），`git diff --check` 通过。剩余风险：`attention_agent` 仍是本地 deterministic task，不是云模型 planner；`card_generation_agent` 和 `note_export_agent` 仍未接运行入口，需要等写入/导出权限确认 UI。

2026-06-11：继续推进 Phase 35，把 Agent 架构收敛成可扩展的 Reading Agent Skill Registry。新增 `tasks/bdd-tdd-reading-agent-skill-registry.md`；`src/agent/skills.js` 注册 `paper_overview_agent`、`attention_agent`、`card_generation_agent`、`note_export_agent` 四个稳定 task skill，每个 skill 明确 `skillPath`、`requiredTools`、`outputArtifactType`、`goal` 和 `maxIterations`。`App` 启动 paper overview 时通过 registry 构造可序列化 task payload，runtime options 仍只在执行时注入 model 和 tools，避免把 closure 写入持久 task。新增 `docs/reading-agent-skills/` 下四份 skill contract 文档。验证：红灯先失败于缺少 `src/agent/skills.js`、paper overview task payload 缺少 `skillPath` 和 `requiredTools`；实现后 `npm run test -- src/agent/skills.test.js src/WorkspaceLayout.test.jsx` 通过（2 files / 14 tests），全量 `npm run test` 通过（50 files / 259 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（22 storage tests + 1 command test），`git diff --check` 通过。剩余风险：本切片只注册 skill/task contract，当前 UI 仍只启动已有本地可运行的 `paper_overview_agent`；其它三个 skill 还没有 planner、权限确认 UI 或真实运行入口。

2026-06-11：继续推进 Phase 34，补齐 Phase 33 后 Reading Note JSON 备份/恢复正文的缺口。新增 `tasks/bdd-tdd-reading-note-document-content.md`；`ReadingNoteExportPayload` 现在包含向后兼容的可选 `documentContent` 字段，`export_reading_note` 会读取 `document_contents`，`import_reading_note_json` 会先清理目标文档旧正文，再在 payload 带正文时写回。旧 schema v1 JSON 缺少 `documentContent` 仍可导入。前端 `exportPersistentReadingNote` 保持 command 返回体中的 `documentContent` 透传。验证：红灯先失败于 JSON 缺少 `documentContent`、导入后 `load_document_content` 为空；实现后 `cargo test --test storage_core reading_note` 通过（4 tests），`npm run test -- src/services/persistentStorage.test.js` 通过（1 file / 6 tests），全量 `npm run test` 通过（49 files / 256 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（22 storage tests + 1 command test），`git diff --check` 通过。剩余风险：本切片不把全文正文渲染进 Markdown 导出，不处理 PDF 二进制、OCR 缓存或 source spans 的完整导出。

2026-06-11：继续推进 Phase 33，把文本文档正文持久化从运行时状态推进到 Rust-backed SQLite。新增 `tasks/bdd-tdd-document-content-persistence.md`；Rust storage 增加 `document_contents` 表和 upsert/load 方法，Tauri command 暴露 `storage_upsert_document_content` / `storage_load_document_content`，前端 adapter 增加 `savePersistentDocumentContent` / `loadPersistentDocumentContent`。App 打开 Markdown / Text / HTML 后会保存 `contentText`，Recent documents 中的文本类 metadata 记录可以从 persisted content 恢复正文并进入阅读器，同时重新触发 source index。浏览器 runtime 继续保持 metadata-only fallback，不把正文塞进 Web recent metadata。验证：红灯先分别失败于 Rust 缺少 content storage、前端缺少 adapter、App 未保存/恢复正文；实现后目标测试通过（Rust 1 test、persistentStorage 1 file / 6 tests、Workspace 1 file / 11 tests），全量 `npm run test` 通过（49 files / 256 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（22 storage tests + 1 command test），`git diff --check` 通过。剩余风险：本切片不做 PDF 二进制缓存、OCR 缓存、删除级联或 schema migration UI。

2026-06-11：继续推进 Phase 32，把 Phase 31 的 Reading Note JSON 导入能力接到 Notes / Export UI。新增 `tasks/bdd-tdd-reading-note-json-import-ui.md`；`ArtifactPanel` 现在有 `Import JSON` 入口，支持粘贴 JSON 或选择 `.json` 文件，导入时调用 `importPersistentReadingNoteJson`，成功后关闭导入框并通过 `onReadingNoteImported` 通知 App。App 接到导入成功后会刷新最近文档列表；如果导入的是当前文档，会重新读取当前文档的 Notes / VibeCards，让恢复的数据不用重启即可出现在面板里。验证：红灯先失败于缺少 Import JSON 按钮和 App 回调接线；实现后目标测试通过（2 files / 25 tests），全量 `npm run test` 通过（49 files / 253 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（21 storage tests + 1 command test），`git diff --check` 通过。剩余风险：本切片不做复杂冲突解决 UI，也不自动切换到被导入的非当前文档。

2026-06-11：继续推进 Phase 31，补齐 PRD Notes / Export P0 的 “JSON 可重新导入 VibeReader” 后端闭环。新增 `tasks/bdd-tdd-reading-note-json-import.md`；Rust `Storage::import_reading_note_json` 现在会校验 `exportType: reading_note` 与 `schemaVersion: 1`，并把导出的 document metadata、summaries、annotations、vibecards、flashcard decks/cards、attention insights、thinking tree 和 conversations 写回 SQLite。导入同一文档时会先替换导出覆盖的文档级集合，避免 annotation/flashcard/attention 重复追加。新增 Tauri command `storage_import_reading_note_json` 和前端 adapter `importPersistentReadingNoteJson`；本切片不做文件选择 UI。验证：红灯先失败于 Rust 缺少导入方法、前端缺少 adapter；实现后目标 Rust 导入恢复测试通过（1 test）、schema 拒绝测试通过（1 test）、persistentStorage adapter 测试通过（1 file / 5 tests），全量 `npm run test` 通过（49 files / 250 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（21 storage tests + 1 command test），`git diff --check` 通过。剩余风险：这里只完成 Rust/SQLite 导入和前端 adapter，尚未做“选择 JSON 文件并导入”的 UI。

2026-06-11：继续推进 Phase 30，补齐 Reading Note JSON 导出的显式 schema metadata。新增 `tasks/bdd-tdd-reading-note-export-schema.md`；Rust `export_reading_note` 现在在 command 返回体和 JSON payload 顶层写入 `exportType: "reading_note"` 与 `schemaVersion: 1`，为后续 JSON 重新导入和 schema migration 提供稳定判别字段。本切片不实现导入。验证：红灯先失败于 `ReadingNoteExport` 缺少 `export_type/schema_version` 字段；实现后目标 Rust 测试通过（1 test），全量 `npm run test` 通过（49 files / 250 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（19 storage tests + 1 command test），`git diff --check` 通过。剩余风险：这里只声明导出 schema，尚未实现 JSON 重新导入。

2026-06-11：继续推进 Phase 29，修复 Phase 28 遗留的导出日期来源问题。新增 `tasks/bdd-tdd-exported-at.md`；Rust `export_reading_note` 现在生成毫秒级 `exportedAt`，并同时写入 command 返回体、JSON payload 和 Markdown metadata；`ArtifactPanel` 的完整 Reading Note Markdown/JSON 下载文件名日期改为使用 `exportPreview.exportedAt`，Selected VibeCards 导出仍保持前端即时日期。验证：红灯先分别失败于前端文件名仍使用 2026-06-11 浏览器日期、Rust `ReadingNoteExport` 缺少 `exported_at` 字段；实现后 `npm run test -- src/ArtifactPanel.test.jsx` 通过（1 file / 14 tests），`cargo test --test storage_core builds_markdown_reading_note_export_without_secrets` 通过（1 test），全量 `npm run test` 通过（49 files / 250 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（19 storage tests + 1 command test），`git diff --check` 通过。剩余风险：JSON schema 还没有显式版本号；后续导入/导出兼容性应和 `exportedAt` 一起进入 export metadata。

2026-06-11：继续推进 Phase 28，补齐 PRD Notes / Export P0 的“导出文件名包含文档名和日期”。新增 `tasks/bdd-tdd-export-filenames.md`；`ArtifactPanel` 的完整 Reading Note Markdown/JSON 下载、Selected VibeCards Markdown、Selected Obsidian Markdown 下载现在优先使用清理后的 `documentName`，并追加导出类型和日期；缺少文档名时继续 fallback 到 `documentId`；App 已把 `currentDocument.name` 传给 Notes 面板。验证：红灯先失败于文件名仍为 `vibereader-doc-1-...`；实现后 `npm run test -- src/ArtifactPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过（2 files / 22 tests），全量 `npm run test` 通过（49 files / 250 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（19 storage tests + 1 command test）。剩余风险：文件名使用本地浏览器时区日期，尚未接 Rust export payload 的 opened/exported timestamp。

2026-06-11：继续推进 Phase 27，把 Reading Note 导出中的 source refs 从纯文本锚点推进为 Markdown 内可点击链接。新增 `tasks/bdd-tdd-reading-note-source-links.md`；Rust `export_reading_note` 现在将 `sourceRefs` 渲染为 `[P2 page-2-para-0](#source-p2-page-2-para-0)`，并在文末生成去重后的 `## Sources` 区块，包含稳定 HTML anchor 和原文摘录。验证：红灯先失败于缺少 Markdown source 链接；实现后目标测试通过（1 test），`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（19 storage tests + 1 command test），`npm run test` 通过（49 files / 248 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning。剩余风险：这些链接是导出 Markdown 内部跳转，不是从 Obsidian 反向打开 VibeReader 的应用深链。

2026-06-11：继续推进 Phase 26，把 Agent task result 保存成 `reading_note` 后的完整导出补上来源。新增 `tasks/bdd-tdd-reading-note-export-source-refs.md`；Rust `export_reading_note` 的 Markdown renderer 现在会解析 `reading_note` VibeCard 的 `ai_content.body` 和 `ai_content.sourceRefs`，导出正文、页码和 `paragraphId`，同时普通 VibeCard 仍保留已有 page fallback。验证：红灯先失败于 Markdown 未包含 reading note 正文；实现后目标测试通过（1 test），`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（19 storage tests + 1 command test），`npm run test` 通过（49 files / 248 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning。剩余风险：Markdown source refs 仍是文本锚点，尚未做 Obsidian/wiki-link 或应用内深链格式。

2026-06-11：继续推进 Phase 25，把 Agent task result 保存到 Notes 的链路从纯文本推进为 source-grounded。新增 `tasks/bdd-tdd-task-result-source-refs.md`；`runReadingAgent` 现在保留 final response 的 `sourceRefs`，`runReadingAgentTask` 将这些 refs 写入 succeeded task result；本地 `paper_overview_agent` 从 bounded chunks 生成 source refs；App 保存 task result 到 Notes 时会写入 `currentContent.sourceRefs`、`sourceSpanIds` 和首个 source，并在有来源时标记为 `grounded`；`ArtifactPanel` 对 Reading Note 复用来源标签展示。验证：runtime 红灯先失败于缺少 `result.sourceRefs`，task/App 红灯先失败于 saved note 仍是 ungrounded 且无 source refs；实现后目标测试通过（4 files / 32 tests），全量 `npm run test` 通过（49 files / 248 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test），`git diff --check` 通过。剩余风险：Reading Note 仍是 task result 级 artifact，还没有合并成完整导出模板或做 markdown source-ref 链接化。

2026-06-11：继续推进 Phase 24，让 completed Agent task 产物能沉淀到 Notes。新增 `tasks/bdd-tdd-task-result-to-note.md`；`TaskStatusPanel` 对有结果正文的 succeeded task 显示 `Save to Notes`，空结果不显示保存入口；`App` 将当前文档 task result 保存为 `reading_note` artifact，并自动切到 Notes/Artifacts；`ArtifactPanel` 新增 `reading_note` 类型展示标题和正文。验证：红灯先失败于缺少保存按钮、Reading Note 渲染和 App `createArtifact` 调用；实现后目标测试通过（3 files / 31 tests），目标组合测试通过（4 files / 37 tests），全量 `npm run test` 通过（49 files / 246 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test），`git diff --check` 通过。剩余风险：保存的是 task result 纯文本，还没有合并 source refs 或完整 Reading Note 模板。

2026-06-11：继续推进 Phase 23，让 Agent task 产物先在 Tasks 面板可见。新增 `tasks/bdd-tdd-task-result-preview.md`；`TaskStatusPanel` 现在会读取 succeeded task 的 `result.content` / `summary` / `text`，压缩空白后显示 bounded preview，长内容用省略号截断；没有结果内容时不渲染空预览容器。验证：红灯先失败于缺少 `.task-status-result`；实现后 `npm run test -- src/TaskStatusPanel.test.jsx` 通过（1 file / 10 tests），目标组合测试通过（3 files / 22 tests），全量 `npm run test` 通过（49 files / 242 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test），`git diff --check` 通过；Playwright localhost smoke 打开 `http://127.0.0.1:3217/` 后确认 `VibeReader Dev` 和 `Tasks` 可见。剩余风险：预览是纯文本短摘要，还没有 Markdown 展开、保存到 Notes、转 VibeCard 或 source refs 点击。

2026-06-11：继续推进 Phase 22，补第一个用户可见的 Agent task 启动入口。新增 `tasks/bdd-tdd-paper-overview-agent-entry.md`；`TaskStatusPanel` 在当前文档存在且传入 `onStartAgentTask` 时显示 `Paper overview` 按钮，无当前文档时不显示入口。`App` 新增 `handleStartAgentTask`，只允许启动当前文档的 `paper_overview_agent`，通过 `runReadingAgentTask` 写入 pending/running/succeeded/failed 生命周期；本地 deterministic paper overview model 只调用 `get_current_document` 和 `get_document_chunks` 两个只读工具，先形成可验收的 task 链路，不依赖云模型 key。`paper_overview_agent` retry 现在会重建当前文档 runtime options；`runReadingAgentTask` 保留调用方提供的可序列化 `payload.agentOptions`，避免把函数或 tool closure 写进可恢复 payload。验证：红灯先失败于缺少 `Paper overview` 按钮、App 未调用 `runReadingAgentTask`、runtime options 覆盖 serialized payload；实现后目标测试通过（3 files / 20 tests），全量 `npm run test` 通过（49 files / 240 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test），`git diff --check` 通过。剩余风险：这是本地 deterministic agent entry，还不是云模型 planner；结果只进入 task record，尚未生成 VibeCard / Note / source refs artifact。

2026-06-11：继续推进 Phase 21，把 failed / cancelled 的 Agent task 接到现有 Tasks 面板 retry 流程。新增 `tasks/bdd-tdd-agent-task-ui-retry.md`；`TaskStatusPanel` 现在会对 `type` 以 `_agent` 结尾且状态为 failed/cancelled 的任务显示 Retry，并把完整 task record 交给 `onRetryTask`。`App` 的 `handleRetryTask` 保留 `source_index` 走 `indexDocumentSourceSpans(currentDocument)`，对当前文档的 `_agent` task 调用 `retryReadingAgentTask(task)`，避免 Agent retry 误触 source indexing。验证：红灯先失败于 Agent task 不显示 Retry、App 未调用 `retryReadingAgentTask`；实现后 `npm run test -- src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过（2 files / 11 tests），全量 `npm run test` 通过（49 files / 236 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test），`git diff --check` 通过。剩余风险：这里接的是 retry 执行入口，还没有做用户创建 Agent task 的入口或 planner。

2026-06-11：继续推进 Phase 20，让 Agent task record 具备可恢复重试的执行参数。新增 `tasks/bdd-tdd-agent-task-retry-payload.md`；`runReadingAgentTask` 现在会把 `agentOptions` 合并保存到 `payload.agentOptions`，同时保留调用方已有 payload 字段。新增 `retryReadingAgentTask`，支持从 persisted `payload` 或 `payloadJson` 中解析 `agentOptions`，复用原 task id / documentId / type / title 重新运行；缺少 agent options 时抛出明确错误，不猜测模型、工具或上下文参数。验证：红灯先失败于未保存 `payload.agentOptions`、缺少 `retryReadingAgentTask` 和公共导出；实现后 `npm run test -- src/agent/taskRunner.test.js src/agent/index.test.js` 通过（2 files / 6 tests），Agent 扩展验证通过（5 files / 27 tests），全量 `npm run test` 通过（49 files / 234 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test），`git diff --check` 通过。剩余风险：UI 还没有把 `_agent` task retry 接到这个 helper。

2026-06-11：继续推进 Phase 19，把 reading agent 从纯函数推进到可持久记录的 task lifecycle。新增 `tasks/bdd-tdd-agent-task-runner.md` 和 `src/agent/taskRunner.js`；`runReadingAgentTask` 会先保存 `pending`，再保存 `running`，底层 `runReadingAgent` 返回 `completed` 时保存 `succeeded` 和结果摘要，返回 `permission_denied` 等非 completed 状态或 runner 抛错时保存 `failed` 并保留错误信息。`src/agent/index.js` 已导出 task runner。验证：红灯先失败于缺少模块和公共导出；实现后 `npm run test -- src/agent/taskRunner.test.js src/agent/index.test.js` 通过（2 files / 4 tests），Agent 扩展验证通过（5 files / 25 tests），全量 `npm run test` 通过（49 files / 232 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test），`git diff --check` 通过。剩余风险：task runner 还没有接 UI planner、retry/cancel UX 或 streaming progress event。

2026-06-11：继续推进 Phase 18，把 PRD Tool Registry 第一批剩余工具注册为 permission-gated tools。新增 `tasks/bdd-tdd-reading-tool-registry-gated-writes.md`；`createReadingTools` 现在包含 `list_attention_insights`、`create_vibecard`、`create_annotation`、`export_note`。其中 `list_attention_insights` 是只读工具并默认允许；`create_vibecard`、`create_annotation`、`export_note` 默认拒绝，必须同时进入 `allowedTools` 且打开 `canWriteVibeCards` / `canWriteAnnotations` / `canExportNotes` 才能调用。写入/导出工具只委托 adapter，缺少 adapter 时抛出明确错误，避免在 registry 内直接改状态或写文件。验证：红灯先失败于缺少函数、registry entries 和权限 flags；实现后 `npm run test -- src/agent/tools.test.js src/agent/permissions.test.js` 通过（2 files / 16 tests），Agent 扩展验证通过（4 files / 22 tests），全量 `npm run test` 通过（48 files / 229 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test），`git diff --check` 通过。剩余风险：这些工具还没有接真实 Agent planner；写入权限 UX、任务审计日志和可恢复 execution record 仍未完成。

2026-06-11：继续推进 Phase 17，把 PRD 里的 Agent Tool Registry 第一批可读工具名接入当前 `src/agent` runtime。新增 `tasks/bdd-tdd-reading-tool-registry-prd-names.md`，明确本切片只补读工具与权限边界，不实现 VibeCard 写入、annotation write 或 note export。`createReadingTools` 现在暴露 `get_current_document`、`get_page_text`、`search_document`、`get_document_chunks` 四个 PRD 工具名，并保留 `extractText`、`navigatePage`、`listAnnotations` 旧工具；`get_current_document` 只返回文档 metadata，`search_document` / `get_document_chunks` 返回 bounded source-locatable 结果；默认 permission 允许这些读工具，但继续拒绝 `create_vibecard`、`create_annotation`、`export_note`。验证：红灯先失败于缺少新函数、registry entries 和权限项；实现后 `npm run test -- src/agent/tools.test.js src/agent/permissions.test.js` 通过（2 files / 12 tests），Agent 扩展验证通过（4 files / 18 tests），全量 `npm run test` 通过（48 files / 225 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test），`git diff --check` 通过。剩余风险：写入型工具、agent planner、Rust task executor 仍未接入。

2026-06-11：继续推进 Phase 16，补齐第一个真实 task retry 闭环。新增 `tasks/bdd-tdd-task-source-index-retry.md`，明确本切片只重试已有 executor 的 `source_index`，不为 Summary/Attention 伪造重试或取消。`TaskStatusPanel` 对 failed / cancelled 的 `source_index` task 显示 Retry，点击后调用 `onRetryTask(task)`；`App` 接入 `handleRetryTask`，只在 `task.documentId === currentDocument.id` 且 `task.type === 'source_index'` 时调用 `indexDocumentSourceSpans(currentDocument)`。验证：红灯先失败于缺少 Retry 按钮和 App retry callback；实现后 `npm run test -- src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过（2 files / 9 tests），全量 `npm run test` 通过（48 files / 221 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test）。剩余风险：这仍不是通用 task executor；Summary/Attention retry、真实 cancellation token、跨窗口 progress event 还未实现。

2026-06-11：继续推进 Phase 15，把 Phase 14 的 Tasks 快照面板接到本地实时刷新链路。新增 `tasks/bdd-tdd-task-live-refresh.md`，明确 `savePersistentTask` 成功保存后必须发出本地 task update 事件，`TaskStatusPanel` 只响应当前文档事件并重新读取 `listPersistentTasks(documentId)`，其它文档事件不触发刷新。实现后 `persistentStorage` 导出 `TASK_UPDATED_EVENT`，`savePersistentTask` 仅在 Tauri command 成功返回后派发事件；`TaskStatusPanel` 订阅该事件，保持多文档隔离。验证：红灯先失败于事件未派发、面板未刷新；实现后 `npm run test -- src/services/persistentStorage.test.js src/TaskStatusPanel.test.jsx` 通过（2 files / 9 tests），全量 `npm run test` 通过（48 files / 219 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test）。剩余风险：这仍是 renderer-local refresh event，不是 Rust progress event stream；还没有 retry/cancel/executor。

2026-06-11：继续推进 Phase 14，把 Phase 13 的持久 task state 接到真实阅读任务和可见 UI。新增 `tasks/bdd-tdd-task-state-ui.md`，明确 Summary、Attention、Tasks 面板三条行为。`SummaryCard` 生成章节摘要时写入 `section_summary` 任务：开始为 `running`，成功为 `succeeded` 并记录 `sectionId/summaryLength/keyPointCount`，失败为 `failed` 并记录错误信息；`AttentionNavigatorPanel` 分析关键位置时写入 `attention_analysis` 任务：开始为 `running`，成功记录 `insightCount`，失败记录错误信息。新增 `TaskStatusPanel`，读取 `listPersistentTasks(documentId)`，展示当前文档任务 title、type、status、progress 和 failure reason；`App` 右侧工具区新增 `Tasks` tab。验证：红灯分别失败于 Summary/Attention 没有 task state、缺少 `TaskStatusPanel`；实现后 `npm run test -- src/SummaryCard.test.jsx src/AttentionNavigatorPanel.test.jsx src/TaskStatusPanel.test.jsx src/WorkspaceLayout.test.jsx` 通过（4 files / 19 tests），全量 `npm run test` 通过（48 files / 216 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test）。剩余风险：Tasks 面板目前是 snapshot list，不是 live event stream；还没有 retry/cancel 按钮，需等 task executor 和取消协议落地。

2026-06-11：继续推进 PRD 里的 Agent/长任务基础验收，把 source indexing 从纯 fire-and-forget 推进到持久 task state。新增 `tasks/bdd-tdd-task-state.md`，明确任务状态必须按文档可持久、状态集合封闭、浏览器 no-op、source indexing 记录 running/succeeded/failed。Rust SQLite 新增 `task_records` 表，保存任务类型、状态、进度、payload/result/error 和生命周期时间戳；新增 storage core `upsert_task` / `load_task` / `list_tasks`、Tauri commands `storage_upsert_task` / `storage_load_task` / `storage_list_tasks`、前端 `savePersistentTask` / `loadPersistentTask` / `listPersistentTasks`。`indexDocumentSourceSpans` 现在会记录 `source_index` 任务状态，成功写入 `succeeded + spanCount/indexSignature`，失败写入 `failed + errorMessage` 并继续抛出原错误，保持文档打开不被索引失败阻塞。验证：Rust 红灯先失败于缺少 `TaskInput` / task 方法，JS 红灯先失败于缺少 task bridge，sourceIndex 红灯先失败于没有记录任务状态；实现后 `cargo test --test storage_core task` 通过（2 filtered tests），`npm run test -- src/services/persistentStorage.test.js` 通过（1 file / 4 tests），`npm run test -- src/services/sourceIndexService.test.js` 通过（1 file / 10 tests），全量 `npm run test` 通过（47 files / 210 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt && cargo fmt --check && cargo check && cargo test` 通过（18 storage tests + 1 command test）。剩余风险：这仍不是完整 task queue，还没有 UI 进度、后台取消、任务事件流；下一步应把 summary / attention 等长任务迁到同一 task state，并补 list/retry UI。

2026-06-11：继续推进 Phase 12，将 source index freshness 从 renderer 内存推进到 Rust/SQLite，并把索引触发点前移到文档打开。新增 Rust `source_index_status` 表，按 `document_id` 保存 `index_signature`、`span_count`、`indexed_at`、`updated_at`，并新增 storage core `upsert_source_index_status` / `load_source_index_status`、Tauri commands `storage_upsert_source_index_status` / `storage_load_source_index_status`、前端 `savePersistentSourceIndexStatus` / `loadPersistentSourceIndexStatus`。`sourceIndexService` 在 force-write source spans 后写入 status；`ensureDocumentSourceIndex` 在 renderer cache miss 时会读取 SQLite status，签名一致则跳过 replace 并继续 search；`App` 在 `recordDocumentOpened` 中非阻塞调用 `indexDocumentSourceSpans(document)`，让 PDF/Markdown/Text/HTML 打开后就调度索引，Chat retrieval 只保留兜底 ensure。验证：Rust 红灯先失败于缺少 `SourceIndexStatusInput` / storage 方法，JS 红灯先失败于缺少 status adapter，service 红灯先失败于 renderer cache 清空后重复 replace，App 红灯先失败于打开文档后不索引；实现后 `cargo test --test storage_core source_index_status` 通过，`npm run test -- src/services/sourceIndexService.test.js src/services/persistentStorage.test.js src/WorkspaceLayout.test.jsx src/App.retrievalContext.test.jsx src/retrievalContext.test.js` 通过（5 files / 32 tests），全量 `npm run test` 通过（47 files / 208 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt && cargo fmt --check && cargo check && cargo test` 通过（16 storage tests + 1 command test），`git diff --check` 通过。剩余风险：索引调度仍是 fire-and-forget，没有后台任务进度、取消或失败状态 UI；后续应接入 PRD 里的 Rust task queue / progress event。

2026-06-11：继续收紧 Phase 12 Rust source index bridge 的热路径行为。补充 `tasks/bdd-tdd-rust-source-index-bridge.md` 两条 BDD：同一文档版本在当前 renderer session 内只索引一次；同一 `documentId` 的正文或版本签名变化后必须重建索引。按 TDD 先补 `src/services/sourceIndexService.test.js` 红灯，失败于缺少 `clearSourceIndexCache` 和索引缓存能力。实现后 `sourceIndexService` 新增文档 source index signature（`id/fingerprint/updatedAt/size/kind/maxCharsPerChunk/contentHash`）、renderer-session cache、`clearSourceIndexCache()`，`buildIndexedRetrievalContext` 通过 `ensureDocumentSourceIndex` 避免同版本重复 `replacePersistentSourceSpans`，但显式 `indexDocumentSourceSpans()` 仍保留 force-write 语义；正文变化时签名变化，会重新写入 source spans。验证：`npm run test -- src/services/sourceIndexService.test.js` 通过（1 file / 7 tests），`npm run test -- src/services/sourceIndexService.test.js src/App.retrievalContext.test.jsx src/retrievalContext.test.js src/services/persistentStorage.test.js` 通过（4 files / 28 tests），全量 `npm run test` 通过（47 files / 206 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo fmt --check && cargo check && cargo test` 通过（15 storage tests + 1 command test），`git diff --check` 通过。剩余风险：索引状态仍是 renderer session 内缓存，应用重启后首次提问会重建一次；后续更完整的方案应把 index signature/indexed_at 写入 SQLite 或 document metadata，并在文档打开/解析完成时调度索引。

2026-06-11：继续推进 Phase 12 Rust Local Index Foundation 的前端 bridge。新增 `tasks/bdd-tdd-rust-source-index-bridge.md`，明确四条业务规则：parsed chunks 可转 Rust source spans、Tauri Chat retrieval 优先使用 Rust search、浏览器 runtime 保持 JS retrieval、Rust 空结果回退 JS retrieval。按 TDD 先补 `src/services/sourceIndexService.test.js` 红灯，失败于缺少 `sourceIndexService`；实现后新增 `src/services/sourceIndexService.js`，复用 `buildDocumentChunks` 生成 source spans，在 Tauri runtime 下通过 `replacePersistentSourceSpans` 写入 Rust index，再用 `searchPersistentSourceSpans` / `listPersistentSourceSpans` 生成与旧 UI 兼容的 prompt 和 source refs；`retrievalContext` 抽出 `buildRetrievalContextFromChunks` 保持提示词格式单一来源；`App.jsx` 把 Chat retrieval 改为异步 `buildIndexedRetrievalContext`。浏览器 runtime 下仍走原 JS retrieval，不调用 Rust storage。验证：`npm run test -- src/services/sourceIndexService.test.js src/App.retrievalContext.test.jsx` 通过（2 files / 14 tests），`npm run test -- src/retrievalContext.test.js src/services/persistentStorage.test.js src/services/sourceIndexService.test.js src/App.retrievalContext.test.jsx` 通过（4 files / 26 tests）。剩余风险：当前 Tauri Chat 提问时会即时重建当前文档 source index，后续需要改成文档打开/解析完成后的增量索引或缓存状态，避免长文档重复写库。

2026-06-11：继续推进 Phase 12 Rust Local Index Foundation。先落 `tasks/bdd-tdd-rust-source-index.md`，明确本切片只把 retrieval primitives 的 source span / local search substrate 放到 Rust，不替换 React/PDF.js 渲染，也不把 Chat 默认切到 Rust 检索。按 TDD 先补 Rust 红灯：`SourceSpanInput`、`replace_source_spans`、`list_source_spans`、`search_source_spans` 均不存在；再补 JS 红灯：`replacePersistentSourceSpans`、`listPersistentSourceSpans`、`searchPersistentSourceSpans` 不存在。实现后 Rust SQLite 新增 `source_spans` 表，保存 `document_id/page/paragraph_id/chunk_id/text/normalized_text/order_index/source_type/metadata_json`，支持按文档 replace/list/search，搜索先按文档隔离，再按 token 命中次数和阅读顺序排序并限制返回数量；Tauri command 和前端 persistentStorage bridge 已接通，浏览器 runtime 保持安全空返回，不改变 Web-first 路径。验证：红灯符合预期；`cargo test --test storage_core source_spans` 通过（2 tests），`npm run test -- src/services/persistentStorage.test.js` 通过（4 tests），`npm run test -- src/services/persistentStorage.test.js src/retrievalContext.test.js` 通过（2 files / 12 tests），全量 `npm run test` 通过（46 files / 199 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning。曾遇到 Tauri build-script 从旧 target 读取 `/Users/mahaoxuan/Desktop/ai-chat-standalone/...` stale absolute path 的缓存错误；执行 `cd src-tauri && cargo clean && cargo check && cargo test` 后标准 Rust 验证通过（15 storage tests + 1 command test）。

2026-06-11：收口 Phase 11 剩余文档验收件。重写 `docs/DEMO_SCRIPT.md` 为 Web-first 演示脚本，默认用 `npm run dev -- --port 3217` 和浏览器文件选择器跑通 PDF Reader、Lens Card、Notes 回源、刷新恢复、文档隔离、模型错误 fallback 的核心产品叙事；新增 `docs/WEB_DESKTOP_DIFF.md`，明确 Web 当前可验收能力与 Tauri/Rust 后续增强边界，避免把桌面签名、Rust SQLite、Keychain、Rust AI proxy、LiteParse、向量索引、Agent runtime 当成 Web 发布阻塞项。对应 Phase 11 清单中“Web 端演示脚本更新”和“桌面端差异清单”已勾选。

2026-06-11：继续推进 Web 端阅读工作台 viewport QA。先落 BDD/TDD 文档 `tasks/bdd-tdd-viewport-qa.md`，明确 1024px 窄屏、820px 平板宽度、有效缩放宽度下 Reader / Skim Map / Notes 不能互相挤压、裁切或产生横向 body overflow。新增 `e2e/workspace-viewport.spec.js`，用真实 DOM rect 断言 `workspace-reading-surface` 与 `workspace-ai-pane` 在窄屏上下布局、pane 不重叠、Reader/AI 宽高达到可用阈值。红灯验证：1024x768 下 `metrics.stacked` 为 false，因为工作台断点仍是 980px，侧栏展开后横向三栏会挤压右侧 Notes。实现后将窄屏布局断点从 `980px` 提到 `1100px`，让 1024px 演示环境进入上读下记布局，同时保留桌面大屏横向布局。验证：`npx playwright test e2e/workspace-viewport.spec.js --project=chromium` 通过（3 tests），`npx playwright test e2e/workspace-viewport.spec.js e2e/visual-qa.spec.js --project=chromium` 通过（6 tests），并生成 `test-results/visual-qa/narrow-1024x768.png`；视觉检查该截图中 Reader、Skim Map、Notes 均可见。全量 `npm run test` 通过（46 files / 199 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning。尝试用 Chrome DevTools 浏览器工具打开 `127.0.0.1:3217` 时，当前 Chrome CDP `localhost:9222/json/version` 返回 HTTP Not Found，因此本轮可见面验证以仓库标准 Playwright 截图和布局契约为准。

2026-06-11：继续推进 Web 端模型配置 / 请求错误闭环。先落 BDD/TDD 文档 `tasks/bdd-tdd-model-error-classification.md`，聚焦请求发出后的错误归因：Tauri native HTTP 401 必须归因为 `UNAUTHORIZED`，503 必须归因为 `PROVIDER_UNAVAILABLE`，浏览器 CORS / `Failed to fetch` 继续走 CORS 分类。红灯验证：`npm run test -- src/aiService.test.js` 中 Tauri 401/503 都退化成 `UNKNOWN`，且 provider detail 中的 key 片段会进入 console error。实现后 `aiService` 用 `error.status` 分类，`aiError` 新增 502/503/504 的 provider unavailable 分类，`tauriHttp` 在包装错误前脱敏 `sk-` / `api-` 等 token；测试改为语言无关断言，验证错误 code、可读标题/操作和日志不含原始 key。验证：`npm run test -- src/aiService.test.js` 通过（1 file / 6 tests），相关测试 `npm run test -- src/aiService.test.js src/aiError.test.js src/modelConfigGuard.test.js src/aiEndpoint.test.js` 通过（4 files / 34 tests），全量 `npm run test` 通过（46 files / 199 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning。

2026-06-11：继续推进 Web 端 Lens Card / Notes 回源闭环。先落 BDD/TDD 文档 `tasks/bdd-tdd-notes-source-ref-navigation.md`，明确两类来源：PDF selection Lens Card 继续通过 `vibereader:navigate-source-span` 带 rect/rects 回跳，只有 `sourceRefs` 的 Explain/Concept/Evidence Card 应通过 `vibereader:navigate-paragraph` 回跳段落。红灯验证：保存带 sourceRefs 的 assistant Explain Card 后，在 Notes 点击“回到原文”不会发出 paragraph navigation。实现后 `handleNavigateArtifactSource` 先识别带 `paragraphId` 的来源并分发 `vibereader:navigate-paragraph`，否则保留原有 source-span 回跳；同时补充 Lens Card 回归测试，证明 PDF 选区卡片会带 `page/spanId/rect/rects/coordinateSpace/sourceType` 回到原文。验证：红灯 `npm run test -- src/App.retrievalContext.test.jsx` 失败于 navigate listener 0 次；实现后同命令通过（1 file / 9 tests），相关测试 `npm run test -- src/App.retrievalContext.test.jsx src/App.lensCardClosure.test.jsx src/ArtifactPanel.test.jsx src/agent/lensCard.test.js src/agent/artifact.test.js` 通过（5 files / 29 tests），全量 `npm run test` 通过（46 files / 196 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` 通过（1 test）。

2026-06-11：继续推进 Phase 11 Web 端持久化闭环。先在 `tasks/bdd-tdd-web-persistence-refresh.md` 补“重新打开同一文件复用同一 document id”的行为约束，再补红灯：`fileToDocument()` 对同名、同大小、同 `lastModified` 的浏览器文件必须生成同一个 `id/fingerprint`，且 id 不能包含 `Date.now()`。实现后 `documentService` 基于 `source/name/size/lastModified/path` 生成稳定 fingerprint，浏览器文件和 Tauri 本地文件都记录该 fingerprint，`openedAt` 仍保留真实打开时间；`App` 初始化时不再因为 Rust storage command 不可用就跳过 `listPersistentDocuments()`，因此 Web fallback 的 Recent documents 能在刷新后恢复。新增 `e2e/web-persistence.spec.js`，先观察刷新后 Recent document 丢失的红灯，再验证重新上传同一 PDF 后只显示当前文档的 artifact / annotation，其他 documentId 的数据保持隐藏。验证：`npm run test -- src/services/documentService.test.js` 通过（1 file / 3 tests），相关单测 `npm run test -- src/services/documentService.test.js src/services/persistentStorage.test.js src/services/artifactService.test.js src/services/annotationService.test.js src/store/documentStore.test.js src/WorkspaceLayout.test.jsx` 通过（6 files / 16 tests），相关 e2e `npx playwright test e2e/web-persistence.spec.js e2e/source-ref-navigation.spec.js --project=chromium` 通过（2 tests），`npm run test` 通过（46 files / 194 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo test` 通过，`git diff --check` 通过。

2026-06-11：继续推进 Phase 11 Web 端持久化闭环入口。先落 BDD/TDD 文档 `tasks/bdd-tdd-web-persistence-refresh.md`，红灯验证浏览器 runtime 下 `savePersistentDocument()` 返回 `null`，导致刷新后 `listPersistentDocuments()` 无法恢复 Recent document 记录。实现后 `persistentStorage` 在非 Tauri runtime 下使用 `vibereader.web.documents` localStorage fallback 保存最多 100 条 document metadata，只存 `id/name/kind/source/path/mimeType/size/fingerprint/openedAt/updatedAt/parseStatus`，不存 `contentText`、PDF binary 或解析全文；Tauri runtime 仍走 `storage_list_documents` / `storage_upsert_document` Rust SQLite 命令。验证：先观察 `npm run test -- src/services/persistentStorage.test.js` 红灯返回 `null`；实现后同命令通过（1 file / 4 tests）。相关验证：`npm run test -- src/services/persistentStorage.test.js src/services/artifactService.test.js src/services/annotationService.test.js src/store/documentStore.test.js src/WorkspaceLayout.test.jsx` 通过（5 files / 13 tests）。全量验证：`npm run test` 通过（46 files / 193 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo test` 通过，`npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` 通过（1 test），`git diff --check` 通过；3217 无残留 dev server。后续 e2e 覆盖已在上方闭环记录补齐。

2026-06-11：继续推进 Notes / Export P1 “Obsidian 格式”。先落 BDD/TDD 文档 `tasks/bdd-tdd-selected-vibecard-obsidian-export.md`，红灯验证 ArtifactPanel 没有 Obsidian 导出入口；补充边界红灯验证取消全部选择后旧 Obsidian 预览不能继续留在界面上。实现后 Notes/Artifacts 复用现有选中 VibeCards 集合，toolbar 新增 `Obsidian` 预览和 `Obsidian Markdown` 下载；导出 Markdown 包含 Obsidian frontmatter（`type`、`document_id`、`card_count`、`tags`）、`[[document#Ppage]]` 来源链接、paragraph id、quote callout、note callout、卡片类型和 verification。全文 Reading Note 仍走现有 Rust-backed `exportPersistentReadingNote(documentId)`，本切片没有改 Rust 全文导出路径。验证：先观察 `npm run test -- src/ArtifactPanel.test.jsx` 红灯找不到 Obsidian 按钮；实现后补 stale preview 红灯并修复；最终 `npm run test -- src/ArtifactPanel.test.jsx` 通过（1 file / 11 tests），相关测试 `npm run test -- src/services/artifactService.test.js src/services/artifactService.persistent.test.js src/services/persistentStorage.test.js` 通过（3 files / 10 tests）。全量验证：`npm run test` 通过（46 files / 192 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`cd src-tauri && cargo test` 通过，`npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` 通过（1 test），`git diff --check` 通过。

2026-06-11：继续推进 Notes / Export P1 “只导出选中 VibeCards”。先落 BDD/TDD 文档 `tasks/bdd-tdd-selected-vibecard-export.md`，红灯验证 ArtifactPanel 没有选卡 checkbox 和 `Export Selected` 入口。实现后 Notes/Artifacts 每张卡片可勾选，toolbar 新增 `Export Selected`，会生成只包含选中 VibeCards 的 Markdown 预览，并提供 `Selected Markdown` 下载；导出内容保留 card 类型、verification、source refs（页码和 paragraph id）、摘要/解释/回答、key points、claims 和用户备注。全文 Reading Note 仍走现有 Rust-backed `exportPersistentReadingNote(documentId)`，本切片没有改 Rust 全文导出路径。验证：先观察 `npm run test -- src/ArtifactPanel.test.jsx` 红灯找不到 checkbox；实现后 `npm run test -- src/ArtifactPanel.test.jsx` 通过（1 file / 9 tests），相关测试 `npm run test -- src/ArtifactPanel.test.jsx src/services/artifactService.test.js src/services/artifactService.persistent.test.js src/services/persistentStorage.test.js` 通过（4 files / 19 tests），`cargo test --test storage_core` 通过（13 tests）。全量验证：`npm run test` 通过（46 files / 190 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`cd src-tauri && cargo test` 通过，`npm run build` 通过并保留既有 chunk size warning，`npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` 通过（1 test），`git diff --check` 通过；3217 无残留 dev server。

2026-06-11：继续推进 VibeCard Phase 2 “卡片能编辑 / 卡片能删除”。先落 BDD/TDD 文档 `tasks/bdd-tdd-vibecard-edit-delete.md`，红灯覆盖四层：ArtifactPanel 缺少编辑/删除入口，persistentStorage 缺少 `deletePersistentVibeCard`，artifactService persistent adapter 不会合并更新或删除，Rust `Storage` 缺少 `delete_vibecard` 且同 id `create_vibecard` 会冲突。实现后 Notes/Artifacts 卡片支持备注编辑、保存、取消和确认删除；App 将更新/删除写入 `artifactService` 并同步右侧列表；persistent adapter 在 Tauri runtime 下先按 documentId 读取当前 VibeCard，再用同 id upsert 保存；Rust SQLite `vibecards` 改为 `ON CONFLICT(id) DO UPDATE` 并新增 delete command，避免编辑后重启丢失或删除后重启复活。验证：先观察 `npm run test -- src/ArtifactPanel.test.jsx src/services/artifactService.persistent.test.js src/services/persistentStorage.test.js` 红灯 6 项失败，`cargo test --test storage_core` 红灯缺少 `delete_vibecard`；实现后聚焦测试通过（3 files / 15 tests），`cargo test --test storage_core` 通过（13 tests）。全量验证：`npm run test` 通过（46 files / 189 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`cd src-tauri && cargo test` 通过，`npm run build` 通过并保留既有 chunk size warning，`npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` 通过（1 test），`git diff --check` 通过；3217 无残留 dev server。

2026-06-11：继续推进 VibeCard P1 “VibeCard 可拖入 Chat”。先落 BDD/TDD 文档 `tasks/bdd-tdd-vibecard-drag-to-chat.md`，再补红灯：Notes/Artifacts 中保存的 VibeCard 必须是 draggable，并在 dragstart 时写入现有 `application/x-vibereader-drag-inject` payload 和 `text/plain`，payload 需包含卡片标题、核心内容、要点和来源页码；拖入 Chat 复用现有 drag-inject 接收逻辑，只注入草稿不自动发送。实现后 `ArtifactPanel` 为所有 artifact card 增加 drag source，复用 `createDragInjectPayload` / `writeDragInjectData`，按 card 类型组装可读文本，不新增拖拽库或第二套 Chat 注入协议。验证：先观察 `npm run test -- src/ArtifactPanel.test.jsx` 红灯（card 缺少 `draggable`），实现后 `npm run test -- src/ArtifactPanel.test.jsx` 通过（1 file / 6 tests），`npm run test -- src/ArtifactPanel.test.jsx src/dragInject.test.js` 通过（2 files / 9 tests），`npm run test` 通过（46 files / 185 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` 通过（1 test），`git diff --check` 通过；3217 无残留 dev server。

2026-06-11：继续推进 VibeCard P1 “Summary 要点可保存为 Concept Card”。先落 BDD/TDD 文档 `tasks/bdd-tdd-summary-concept-card.md`，再补红灯：`SummaryCard` 已生成摘要后必须创建 `concept_card` artifact，包含 `documentId`、section id/title、summary、key points 和 section 原文来源；真实 `ArtifactPanel` 必须显示 Concept Card 的章节、摘要、要点、source refs；App 必须接住 SummaryPanel 的 `onArtifactCreated` 并切到 Notes/Artifacts。实现后 `SummaryCard` 新增“保存概念卡片”按钮，调用现有 `createArtifact`，`SummaryPanel` 透传 `onArtifactCreated`，App 复用 `handleArtifactCreated`，`ArtifactPanel` 扩展 `concept_card` 展示，不新增第二套卡片系统。验证：先观察 `npm run test -- src/SummaryCard.test.jsx` 红灯缺少保存入口，再观察 `npm run test -- src/SummaryCard.test.jsx src/App.retrievalContext.test.jsx` 红灯覆盖 App 未接线；实现后 `npm run test -- src/SummaryCard.test.jsx src/ArtifactPanel.test.jsx src/App.retrievalContext.test.jsx` 通过（3 files / 17 tests），`npm run test` 通过（46 files / 184 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` 通过（1 test），`git diff --check` 通过；3217 无残留 dev server。

2026-06-11：继续推进 VibeCard P1 / Notes 展示闭环。按 TDD 先补红灯：`explain_card` 在 Notes/Artifacts 中必须显示为 Explain Card，并渲染上一条用户问题、AI 回答正文、source refs 来源标签，还能继续触发“回到原文”。实现后 `ArtifactPanel` 扩展 artifact type label，`LensCard` 同一组件按 `explain_card` 渲染问题/回答/来源，不新增第二套卡片系统。验证：`npm run test -- src/ArtifactPanel.test.jsx` 通过（1 file / 4 tests），`npm run test -- src/ArtifactPanel.test.jsx src/App.retrievalContext.test.jsx` 通过（2 files / 11 tests），`npm run test` 通过（46 files / 181 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` 通过（1 test），`git diff --check` 通过；3217 无残留 dev server。

2026-06-11：继续推进 VibeCard P1 “AI 回答可保存为 Explain Card”。按 TDD 先补红灯：assistant 回答下方必须出现“保存回答卡片”，点击后创建 `explain_card` artifact，包含当前 `documentId`、上一条用户问题、AI 回答正文、回答携带的 source refs，并在有 source refs 时标记为 `grounded`；保存后右侧切到 Notes/Artifacts。实现后 Chat assistant 气泡下方新增轻量 action，复用现有 `createArtifact` / artifact 列表 / `setRightToolTab('artifacts')` 流程，不新增并行卡片系统。验证：定向 `npm run test -- src/App.retrievalContext.test.jsx` 通过（1 file / 7 tests），扩展定向 `npm run test -- src/AttentionNavigatorPanel.test.jsx src/App.retrievalContext.test.jsx` 通过（2 files / 13 tests），`npm run test` 通过（46 files / 180 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` 通过（1 test），`git diff --check` 通过。

2026-06-11：继续推进 Attention Navigator 2.0 P1 insight-to-chat。按 TDD 先补红灯：单条 attention insight 必须能发送到 Chat，问题文本包含类型、页码、`paragraphId` 和 insight 描述；App 的 Navigator tab 必须把 Attention 的 `onAskAI` 接到现有 Chat 提交流程。实现后 `AttentionNavigatorPanel` 新增“问 AI”操作，点击时不触发段落跳转，只把结构化来源问题交给 `handleAskAI`；App 通过已有 `handleAskAI` 复用检索式 Chat，不新增并行聊天入口。验证：定向 `npm run test -- src/AttentionNavigatorPanel.test.jsx src/App.retrievalContext.test.jsx` 通过（2 files / 12 tests），`npm run test` 通过（46 files / 179 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` 通过（1 test），`git diff --check` 通过；3217 无残留 dev server。

2026-06-11：继续推进 Attention Navigator 2.0 P1 insight-to-card。按 TDD 先补红灯：用户能把单条 attention insight 保存为 source-bound reading card，卡片必须绑定 `documentId`、页码、`paragraphId`、原 insight 描述，并标记为 `grounded`。实现后 `AttentionNavigatorPanel` 新增“保存卡片”操作，调用现有 `createArtifact` 创建 `evidence_card`，`originalContent/currentContent/source` 保留 insight 来源，保存成功后通过 `onArtifactCreated` 回填 App artifact 列表并自动切到 Notes/Artifacts 面板。验证：定向 `npm run test -- src/AttentionNavigatorPanel.test.jsx` 通过（1 file / 5 tests），`npm run test` 通过（46 files / 177 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` 通过（1 test），`git diff --check` 通过；3217 无残留 dev server。

2026-06-11：继续推进 Attention Navigator 2.0 的 P1 闭环。按 TDD 先在 `src/AttentionNavigatorPanel.test.jsx` 补两个红灯：用户能按 insight 类型筛选关键位置；用户能把单条 insight 标记为已读，并把更新后的 readStatus 按文档持久化。实现后 `AttentionNavigatorPanel` 基于已有 `readStatus` 数据模型新增类型 `Segmented` 筛选、已读/未读切换按钮、已读状态弱化显示；切换 readStatus 时会更新本地列表、同步 `onInsightsChange` 给 PDF marker 层，并通过 `savePersistentAttentionInsights(documentId, nextInsights)` 保存该文档的完整 insights 列表。验证：定向 `npm run test -- src/AttentionNavigatorPanel.test.jsx` 通过（1 file / 4 tests），`npm run test` 通过（46 files / 176 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` 通过（1 test），`git diff --check` 通过；3217 无残留 dev server。

2026-06-11：继续推进 Phase 3 Chat 模式选择，补齐 PRD 要求的“当前章节”上下文范围。按 TDD 先补 `src/retrievalContext.test.js` 红灯：`mode: 'section'` 必须只打包当前章节页码范围内的 chunks/source refs；再补 `src/App.retrievalContext.test.jsx` 红灯：Chat 选择 `Current section` 后，即使问题关键词命中其他页，也只把当前 PDF 页所在章节送入模型 payload。实现后 `buildRetrievalContext` 支持 `section.pageStart/pageEnd`，App 从 `vibeData.sections` 根据当前阅读页推导 active section，Chat Context Segmented 新增 `Current section`，并在状态条显示 `P{page} · {section}`。验证：定向 `npm run test -- src/retrievalContext.test.js src/App.retrievalContext.test.jsx` 通过（2 files / 13 tests），`npm run test` 通过（46 files / 174 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` 通过（1 test），`git diff --check` 通过；3217 无残留 dev server。

2026-06-11：继续推进 Phase 3 “只基于当前位置回答”。新增 Chat `Selected paragraph` 上下文模式：`buildRetrievalContext` 支持 `mode: 'paragraph'` 与 `paragraphId`，即使用户问题关键词命中其他页，也只打包当前选中段落的 source excerpts 和 source refs；App 复用现有 `vibereader:select-paragraph` 状态，Chat Context Segmented 增加 `Selected paragraph`，未选中段落时该选项禁用，避免伪造空来源。实现保持用户气泡只显示原始问题，模型 payload 才附加所选段落上下文。验证：先观察 `src/retrievalContext.test.js` 红灯仍命中 P2，再实现 paragraph mode 转绿；先观察 `src/App.retrievalContext.test.jsx` 找不到 Selected paragraph 控件红灯，再接 UI/state 转绿。最终 `npm run test -- src/retrievalContext.test.js src/App.retrievalContext.test.jsx` 通过（2 files / 11 tests），`npm run test` 通过（46 files / 172 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` 通过（1 test），`git diff --check` 通过。

2026-06-11：继续推进 Phase 3 Chat 模式选择。按 BDD/TDD 补齐“相关段落 / 当前页”两个上下文范围：`buildRetrievalContext` 新增 `mode: 'page'` 与 `page` 参数，当前页模式不再按问题检索全文，而是只打包当前 PDF 页的 chunks 和 source refs；App 记录 `PdfViewer` 上报的当前页，在 Chat 面板增加 `Context` Segmented（Relevant / Current page），提交问题时把模式和页码传入 retrieval，用户消息仍保持原问题不被上下文污染。`PdfViewer` 增加可选 `onPageChange` 回调，不改变现有翻页/渲染行为。验证：先观察 `src/retrievalContext.test.js` 页面模式红灯失败，再实现转绿；先观察 `src/App.retrievalContext.test.jsx` 找不到 Current page 控件红灯失败，再实现转绿。最终 `npm run test -- src/retrievalContext.test.js src/App.retrievalContext.test.jsx` 通过（2 files / 9 tests），`npm run test` 通过（46 files / 170 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`npm run build` 通过并保留既有 chunk size warning，`npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` 通过（1 test），`git diff --check` 通过。

2026-06-11：补齐 Phase 3 source refs 的真实 PDF 回跳浏览器验收。新增 `e2e/source-ref-navigation.spec.js`，使用 `demo-assets/wonderland_short.pdf` 走真实上传、pdf.js canvas/text layer 渲染、翻到第 2 页读取真实 `data-paragraph-id`、回到第 1 页后派发与 Chat source 按钮相同的 `vibereader:navigate-paragraph` 事件，验收 PDF 阅读器能跳回第 2 页并给目标段落加上 `.paragraph-pulse-highlight`。这条 e2e 与已有 App 级 source-ref 单测形成分层覆盖：App 单测验证 `Sources` 按钮派发正确 payload，浏览器验收验证真实 PDF 消费该事件并高亮段落。验证：`npx playwright test e2e/source-ref-navigation.spec.js --project=chromium` 通过（1 test），`npm run test -- src/retrievalContext.test.js src/App.retrievalContext.test.jsx` 通过（2 files / 7 tests），`npx playwright test e2e/source-ref-navigation.spec.js e2e/pdf-viewer.spec.js --project=chromium` 通过（7 tests）。

2026-06-11：继续补强 Phase 3 source refs 的产品级引用体验。新增 App 级红灯测试：回答下方来源按钮不仅显示页码，还必须有可访问名称说明将打开哪段来源；点击按钮必须派发 `vibereader:navigate-paragraph`，并在 detail 中携带 `documentId`、`page`、`paragraphId` 和原文 `text`，方便 PDF 高亮、后续 Notes/Export 和诊断复用。实现后 `AssistantSourceRefs` 保持紧凑显示 `P2`，但 `aria-label` / `title` 带来源片段；source-ref 样式从内联迁到 `src/styles.css` 的 `.assistant-source-*` 类，使用现有设计 token。验证：定向 `npm run test -- src/retrievalContext.test.js src/App.retrievalContext.test.jsx` 通过（2 files / 7 tests），`npm run test` 通过（46 files / 168 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`cd src-tauri && cargo test` 通过（1 command test + 11 storage tests），`npm run build` 通过并保留既有 chunk size warning，`git diff --check` 通过；启动 `npm run dev -- --host 127.0.0.1 --port 3217` 后 `npm run qa:smoke` 通过，live AI 因无本地 key 按脚本跳过。

2026-06-11：补强 Phase 3 source-grounded Chat 的真实回跳契约。发现上轮 retrieval 使用 `page-N-para-1` 起始索引，且不识别 `pdfService` 实际输出的 `--- 第 n 页 ---` marker，会导致回答下方 `Sources` 按钮存在但 PDF 段落回跳偏移或失败。按 TDD 先把 `src/retrievalContext.test.js` 与 `src/App.retrievalContext.test.jsx` 改成真实 PDF marker、0 起始段落 ID、长段落分片仍保留基础 `paragraphId` 的红灯；实现后 `retrievalContext` 同时识别 `[page:n]` 和 `--- 第 n 页 ---`，生成与 `PdfViewer` / `ThinkingTreePanel` / `AttentionNavigatorPanel` 一致的 `page-N-para-M`，分片使用独立 `chunkId`，但 `sourceRefs.paragraphId` 始终保持可导航基础锚点。验证：定向 `npm run test -- src/retrievalContext.test.js src/App.retrievalContext.test.jsx` 通过（2 files / 6 tests），`npm run test` 通过（46 files / 167 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`cd src-tauri && cargo test` 通过（1 command test + 11 storage tests），`npm run build` 通过并保留既有 chunk size warning，`git diff --check` 通过；启动 `npm run dev -- --host 127.0.0.1 --port 3217` 后 `npm run qa:smoke` 通过，live AI 因无本地 key 按脚本跳过。

2026-06-11：继续推进 Phase 3 检索式 AI Chat 的第一切片。新增 `src/retrievalContext.js`，支持从当前文档生成页码/段落感知 chunks、按用户问题做本地词项检索、打包 `Relevant source excerpts` prompt，并返回可回跳的 `sourceRefs`；新增 `src/retrievalContext.test.js` 覆盖页码锚点、相关段落优先、source-ref prompt、长文档不全文注入。`App.jsx` 文档切换时不再把全文写入 `aiService.setPaperContext(text)`，改为清空旧上下文；聊天提交时用户气泡保留原问题，发给模型的 payload 附加检索片段，assistant 消息保存 `sourceRefs` 并在 UI 显示 `Sources` / 页码按钮，可触发段落回跳事件。新增 `src/App.retrievalContext.test.jsx`，先红后绿验证模型 payload 只包含相关 P2 片段、不包含 P1/P3 无关内容，且 assistant 消息保存 source refs。验证：定向 `npm run test -- src/retrievalContext.test.js src/App.retrievalContext.test.jsx` 通过（2 files / 5 tests），`npm run test` 通过（46 files / 166 tests，含既有 AntD/jsdom `getComputedStyle` 非致命提示），`cd src-tauri && cargo test` 通过（1 command test + 11 storage tests），`npm run build` 通过并保留既有 chunk size warning，`git diff --check` 通过；启动 `npm run dev -- --host 127.0.0.1 --port 3217` 后 `npm run qa:smoke` 通过，live AI 因无本地 key 按脚本跳过。

2026-06-11：继续推进 Notes / Export P0。新增 Rust `export_reading_note(document_id)` 聚合当前文档的 document metadata、summaries、annotations、vibecards、flashcard decks/cards、attention insights、thinking tree 状态和 document-bound conversations，生成可预览的 Markdown 与结构化 JSON；Markdown 包含来源页码（如 P3/P5），不写入 raw model request、authorization header、API key 等敏感字段。新增 Tauri command `storage_export_reading_note` 与前端 `exportPersistentReadingNote` adapter；右侧 Notes（ArtifactPanel）保留 Lens Card 列表，并新增 `Preview Export`、Markdown 下载、JSON 下载。验证：定向 export 测试先红后绿；`npm run test` 通过（44 files / 161 tests，含一条 AntD/jsdom `getComputedStyle` 非致命提示），`cd src-tauri && cargo test` 通过（1 command test + 11 storage tests），`npm run build` 通过，`git diff --check` 通过；启动 `npm run dev -- --host 127.0.0.1 --port 3217` 后 `npm run qa:smoke` 通过，live AI 因无本地 key 按脚本跳过。

2026-06-11：继续推进 Phase 1 Flashcard 持久化与文档隔离。新增 Rust SQLite `flashcard_decks` / `flashcards` 表，支持按 `document_id` replace/list 卡组快照，并保留卡片 `known/unknown` 学习状态；新增 Tauri commands `storage_replace_flashcard_decks` / `storage_list_flashcard_decks`；前端 `persistentStorage` 增加 `savePersistentFlashcardDecks` / `listPersistentFlashcardDecks`；`FlashcardDeck` 接收当前 `documentId`，Tauri runtime 下进入文档时加载该文档卡组，加载完成后将新建卡组、手动加卡、AI 生成卡片、学习进度变化保存回该文档，浏览器/无文档场景保留原 Zustand/localStorage 行为。验证：定向 Flashcard 测试先红后绿；`npm run test` 通过（44 files / 160 tests，含一条 AntD/jsdom `getComputedStyle` 非致命提示），`cd src-tauri && cargo test` 通过（1 command test + 10 storage tests），`npm run build` 通过，`git diff --check` 通过；启动 `npm run dev -- --host 127.0.0.1 --port 3217` 后 `npm run qa:smoke` 通过，live AI 因无本地 key 按脚本跳过。

2026-06-11：继续推进 Phase 1 Summary 持久化。新增 Rust SQLite `summaries` 表，按 `document_id + summary_kind + section_id` upsert，支持同一章节重新生成后覆盖旧摘要，并提供 load/list core 方法与 Tauri commands；前端 `persistentStorage` 增加 `savePersistentSummary` / `loadPersistentSummary`，负责 `keyPointsJson` 与组件数组结构互转；`SummaryPanel` 传入当前 `documentId`，`SummaryCard` 挂载时恢复该文档章节摘要，生成后写入 SQLite，未绑定文档时保留原有内存行为。验证：定向 Summary 测试先红后绿；`npm run test` 通过（43 files / 158 tests），`cd src-tauri && cargo test` 通过（1 command test + 9 storage tests），`npm run build` 通过，`git diff --check` 通过；启动 `npm run dev -- --host 127.0.0.1 --port 3217` 后 `npm run qa:smoke` 通过，live AI 因无本地 key 按脚本跳过。

2026-06-11：继续推进 Phase 1 Attention Navigator 持久化。新增 Rust SQLite `attention_insights` 表，按 document_id 存储一组可查询 insight rows（type、description、page、paragraph_index、paragraph_id、read_status、payload_json），并提供 replace/list core 方法与 Tauri commands；前端 `persistentStorage` 增加 `savePersistentAttentionInsights` / `listPersistentAttentionInsights`，保存时摊平可查询字段，读取时还原面板原 insight shape；`AttentionNavigatorPanel` 接收 `documentId`，挂载时恢复该文档 insights，分析完成后覆盖保存，并同步 `onInsightsChange` 给 PDF attention marker 层。验证：`npm run test` 通过（42 files / 155 tests），`cd src-tauri && cargo test` 通过（1 command test + 8 storage tests），`npm run build` 通过，`git diff --check` 通过；启动 `npm run dev` 后 `npm run qa:smoke` 通过，live AI 因无本地 key 按脚本跳过。

2026-06-11：继续推进 Phase 1 阅读产物持久化。新增 Thinking Tree 持久化闭环：Rust SQLite 增加 `thinking_trees` 表、core upsert/load、Tauri commands；前端 `persistentStorage` 增加 `savePersistentThinkingTree` / `loadPersistentThinkingTree`；`ThinkingTreePanel` 接收 `documentId`，生成 Skim Map 后写入本地 SQLite，同一文档重新挂载时自动恢复，未绑定文档时保留原先内存行为。验证：`npm run test` 通过（41 files / 153 tests），`cd src-tauri && cargo test` 通过（1 command test + 7 storage tests），`npm run build` 通过，`git diff --check` 通过。已补齐本机 Playwright Chromium 缓存并启动 `npm run dev` 后，`npm run qa:smoke` 通过；live AI 因无本地 key 被脚本按设计跳过。

2026-06-11：继续推进 Rust-backed local data layer。新增最近文档前端闭环：`documentStore` 支持加载持久化 document records，App 启动后读取 SQLite 文档列表并在左侧栏显示 `Recent documents`，但不会把缺少正文内容的历史记录误设为当前 reader。新增会话持久化闭环：Rust SQLite 增加 `conversations` 表、core CRUD、Tauri commands；前端 `persistentStorage` 增加 conversation adapter，`storage.js` 在 Tauri runtime 下优先走 SQLite，浏览器环境继续 IndexedDB fallback。验证：`npm run test` 通过（41 files / 151 tests），`cd src-tauri && cargo test` 通过（1 command test + 6 storage tests），`npm run build` 通过，`git diff --check` 通过。`npm run qa:smoke` 仍因本机 Playwright Chromium 缓存缺失失败：需要 `npx playwright install` 后重跑；live AI 因未配置本地 key 被脚本正常跳过。

2026-06-11：开始按 `docs/VIBEREADER_PRD_RUST_BACKED.md` 推进 Rust-backed local-first 阅读工作台路线。Phase 0 文档基线已落盘：`docs/current-state.md`、`docs/data-model-draft.md`、`docs/qa-checklist.md`，并新增执行计划 `docs/superpowers/plans/2026-06-11-rust-backed-local-data-layer.md`。Phase 1 最小数据层已完成第一切片：新增 Rust SQLite storage core、统一 command error、Tauri storage commands、前端 `persistentStorage` adapter；`annotationService` 和 `artifactService` 在 Tauri 可用时走持久化 adapter，浏览器继续走 localStorage fallback；App 启动时初始化持久化，打开文档后 sidecar 保存 document record。验证：`cd src-tauri && cargo test` 通过（1 command test + 5 storage tests），定向 Vitest 通过（7 files / 15 tests）。剩余风险：UI 尚未展示最近文档列表；SQLite 目前覆盖 documents / annotations / vibecards，conversation / summary / attention / thinking tree 迁移未开始。

2026-05-23：已完成本轮规划接力，并完成 Phase 0 版本保护。当前基线提交为 `e6ea59f`。下一步应从 Phase 1：Tauri v2 壳 + Vite 迁移开始。

2026-05-23：继续执行 Phase 1/2。已完成 Vite 迁移、Tauri v2 初始化、dialog/fs 插件、桌面图标、统一文档服务和文档状态 store。`npm run build`、`cargo check`、`npm run tauri:dev` 均通过。剩余需要在真实桌面交互中选择一份 PDF，完成 A3/A4/A5 手工验收。

2026-05-23：根据真实截图和 dev 日志修复 PDF 可视渲染链路：拦截名字以 `.pdf` 结尾的目录，增加 `fs:allow-stat`，并为 pdf.js 文本解析和 Viewer 渲染拆分独立 byte copy。下一次手工验收建议选择 `/Users/mahaoxuan/Desktop/黑客松/Vibero/test/tests/data/wonderland_short.pdf`。

2026-05-23：为避免旧 Zotero fork、旧 `_apps/Vibero.app` 与当前 Tauri dev app 混淆，当前主线命名为 `VibeReader Standalone Dev`，并新增 `PROJECT_MAP.md` 作为路径和验收对象说明。下一步先完成真实 PDF 可视验收，再推进 Phase 3 双栏工作台。

2026-05-23：真实 PDF 验收通过。通过 `http://127.0.0.1:3217/` 灌入 `/Users/mahaoxuan/Desktop/黑客松/Vibero/test/tests/data/wonderland_short.pdf`，页面显示 `PDF 已加载，共 29 页`，文本层包含 Alice in Wonderland 内容，canvas 数量为 1，尺寸 612x792，采样到 613 个非白像素样本。截图保存在 `/tmp/vibereader-pdf-qa.png`。

2026-05-23：Phase 3 双栏工作台已落地。左侧 PDF 阅读器与右侧 AI Tabs 同屏显示，拖拽分隔线将阅读器宽度从 666.8px 调整到 551px，右侧 AI 面板同步扩展到 589px；窄屏 820px 验证为上下堆叠且无横向溢出。桌面截图 `/tmp/vibereader-dual-pane-qa.png`，窄屏截图 `/tmp/vibereader-dual-pane-narrow-qa.png`。剩余需手工验证 PDF 选区注入。

2026-05-23：Phase 4 Stop generating 已按 BDD/TDD 推进。新增 Vitest + Testing Library 测试底座，先观察到 `AbortSignal` 未传递、AbortError 会变成硬失败、loading 状态下没有 Stop 控件的红灯失败，再完成最小实现并转绿。真实 PDF 选区注入通过 CDP 验收：`wonderland_short.pdf` 加载 29 页，canvas 612x792 非空，文本层包含 Alice/Project Gutenberg，选中 `Project` 后右侧 Chat 出现 `基于以下论文内容： Project`，阅读器与 AI 面板仍同时可见。截图 `/tmp/vibereader-phase4-qa.png`。由于当前模型请求返回 `Failed to fetch`，真实模型长回复中断仍需用有效 API 配置手工验收。

2026-05-23：已把可用的 MiniMax Token Plan 配置迁回当前 Tauri 主线 `VibeReader Standalone Dev` 的 WebKit localStorage。来源为本机 `~/.mmx/config.json`，写入目标为 `~/Library/WebKit/vibereader/.../LocalStorage/localstorage.sqlite3`，写入前已生成 `.bak-20260523160540` 备份。回读确认选中配置为 `vibereader-minimax-token-plan`，模型为 `MiniMax-M2.7`，协议为 Anthropic 兼容，API key 存在但未写入 git 或文档。旧 Codex 备份里的另一枚 MiniMax key 已验证为 `401 invalid api key`，未迁入。Kimi/Moonshot 只找到旧网页运行面的 `trial-kimi-priority` 标记，未找到可复用的真实 Moonshot API key，因此未创建不可用的 Kimi 配置。

2026-05-23：Phase 5 Markdown/Text/HTML 通用阅读已按 BDD/TDD 完成。新增 `DocumentReader`、HTML 安全正文提取、浏览器/Tauri 非 PDF 文档读取链路，并把 `.md/.markdown/.txt/.html/.htm` 接入现有“左读右问”工作台。定向红灯先失败于缺少 `DocumentReader`、`fileToDocumentWithContent`、`sanitizeHtmlToText`；实现后 `npm run test` 通过 4 个测试文件 / 9 个测试，`npm run build` 通过且仅保留既有 chunk size warning。CDP 浏览器验收已灌入 `/tmp/vibereader-phase5/sample.md`、`sample.txt`、`sample.html`：Markdown/Text/HTML 均可见，HTML script/style 不显示且脚本未执行，Markdown 选区注入后右侧 Chat 出现 document context 消息。截图 `/tmp/vibereader-phase5-qa.png`。

2026-05-23：Phase 6 PDF 大纲与最小批注已按 BDD/TDD 完成。新增 `annotationService`、`PdfAnnotationToolbar`、`pdfOutline`，并接入 `PdfViewer`。红灯覆盖缺少批注服务、批注工具栏、大纲解析；绿灯后 `npm run test` 通过 7 个测试文件 / 15 个测试，`npm run build` 通过，`cargo check` 通过。真实浏览器验收使用 `/tmp/vibereader-phase6-outline.pdf`：pdf.js 读出 Introduction / Methods / Findings 三个大纲项，点击 Methods 跳转到第 2 页；选中第 2 页文本后保存高亮和 `QA note` 笔记，`localStorage.vibereader.annotations` 记录 2 条批注，批注列表显示 P2、高亮文本和笔记。截图 `/tmp/vibereader-phase6-qa.png`。第一版批注不写回 PDF 文件。

2026-05-23：Phase 7 演示闭环已完成。新增 `demo-assets/`，包含 `outline-demo.pdf`、`wonderland_short.pdf`、`sample.md`、`sample.txt`、`sample.html`、`demo-fallback-answer.md`；新增 `docs/DEMO_SCRIPT.md` 和 `tasks/bdd-tdd-phase7.md`。PDF worker 改为 Vite/Tauri 本地打包资产，构建产物包含 `dist/assets/pdf.worker.min-*.mjs`，不再依赖 CDN。MiniMax 在本地 dev 运行面新增同源 `/api/minimax` 代理，解决浏览器 CORS 预检失败。最终验收：`npm run test` 通过 11 个测试文件 / 23 个测试，`npm run build` 通过，`cargo check` 通过，`npx tauri dev --no-watch --config '{"build":{"beforeDevCommand":""}}'` 成功启动 `target/debug/vibereader`。Playwright 真实闭环使用 demo 资产完成 PDF 大纲跳转、批注、Markdown 选区注入、MiniMax 长回复 Stop，控制台无错误，截图 `/tmp/vibereader-phase7-qa.png`。

2026-05-23：根据 `/Users/mahaoxuan/gstack` 规范完成 VibeReader 项目治理对齐。新增 `docs/GSTACK_ALIGNMENT.md`、`tasks/gstack-backlog.md`、`tasks/bdd-tdd-phase8.md` 和 `docs/superpowers/plans/2026-05-23-vibereader-gstack-roadmap.md`。当前下一阶段是 Phase 8 发布硬化：优先处理生产包 AI 通信路径、无 key/坏 key UX、多文档隔离、Playwright smoke 固化和 gstack pre-landing review。

2026-05-23：Phase 8 开始执行。已新增 `src/modelConfigGuard.js` 和 `src/modelConfigGuard.test.js`，发送前拦截缺少配置、缺少 API key、缺少 base URL、缺少模型名四类问题，不进入 loading，也不泄露 key。已新增 `scripts/qa-smoke.mjs` 和 `npm run qa:smoke`，无密钥时输出 `SKIPPED_LIVE_AI`，Playwright 未安装时给出明确依赖错误。

2026-05-31：继续 Phase 8 / Rust C 方向的最小强化切片。修复 Tauri 原生 HTTP 路径下 Stop generating 取消链路：`aiService.chatStream` 现在把同一个 `AbortSignal` 传给 `tauriChatStream`，`tauriChatStream` 再传给 `@tauri-apps/plugin-http`；Tauri 插件返回的 `Request cancelled` 归一为 `aborted` 中断态，而不是普通未知错误。先新增红灯测试确认旧逻辑未传 signal、取消错误分类错误，再实现转绿。验证：`npm test -- src/aiService.test.js` 通过（4 tests），`npm run test` 通过（24 files / 102 tests），`npm run build` 通过且仅保留既有 chunk warning，`cd src-tauri && cargo check` 通过。

2026-06-02：按产品闭环完成 Phase 10 最小 Lens Card：PDF 选区生成 source-aware selection，Reading Agent 打包上下文并调用当前模型生成解释，保存为 `lens_card` artifact，右侧新增 Artifacts tab 展示卡片，点击“回到原文”通过 `vibereader:navigate-source-span` 跳回 PDF 页并高亮原选区。验证：定向 `npm test -- src/services/artifactService.test.js src/agent/lensCard.test.js src/PdfAnnotationToolbar.test.jsx src/ArtifactPanel.test.jsx src/agent/artifact.test.js` 通过（5 files / 10 tests），`npm run test` 通过（28 files / 111 tests），`npm run build` 通过，`cd src-tauri && cargo check` 通过，`git diff --check` 通过，Playwright UI smoke 通过。

2026-06-02：继续收口 PDF 阅读体验和品牌入口。PDF Viewer 默认 Fit Width，随阅读栏 ResizeObserver 重渲染；透明 text layer 增加 overflow clipping，避免 Notion 导出的 PDF 文本层 scrollWidth 过大造成 fit-width 反馈抖动。已用 `/Users/mahaoxuan/Downloads/欧游notion pdf.pdf` 做 Playwright smoke：20 次采样 canvas 宽度稳定为 810，外层 scrollWidth=842/clientWidth=842，console/pageerror 为空，截图 `/tmp/vibereader-ouyou-notion-repro-final.png`。项目图标已替换为 Downloads 中的书本图，覆盖 `icons/vibero.png`、`public/favicon.png` 和 `src-tauri/icons/`；`index.html` 已接入 favicon / apple-touch-icon。

2026-06-02：平台推进顺序更新。虽然最终仍保留 Web 和 Tauri App 两个平台，但当前开发优先级改为先把 Web 端做成真实可用产品：阅读工作台、PDF 稳定性、Lens Card artifact、来源回跳、模型配置和浏览器持久化先闭环；Tauri App / Rust / LiteParse / SQLite / 本地向量索引作为后续增强，不阻塞 Web 端产品完成度。
