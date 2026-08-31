# VibeReader Code Wiki

> 最后更新：2026-06-27
> 状态：Hackathon 活跃开发中

---

## 1. 项目概览

### 1.1 产品定位

VibeReader 是一个本地优先的 AI 阅读工作台。用户在阅读 PDF / Markdown / 文本文件时，右侧 AI 面板提供对话、摘要、闪卡、思维导图、注意力导航等辅助功能。所有数据存储在本地 SQLite 中，不上传云端。

### 1.2 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端框架 | React | 18.2 |
| 构建工具 | Vite | 8.0 |
| 状态管理 | Zustand | 5.0 |
| UI 组件库 | Ant Design 5 + Ant Design X | — |
| 富文本输入 | Slate.js | 0.123 |
| Markdown 渲染 | react-markdown + remark-gfm + rehype-katex | — |
| PDF 渲染 | pdfjs-dist | 4.0 |
| OCR | tesseract.js | 7.0 |
| 桌面壳 | Tauri v2 | 2.11 |
| 本地数据库 | RusQLite (SQLite) | — |
| 单元测试 | Vitest | 4.1 |
| E2E 测试 | Playwright | 1.60 |
| 包管理器 | pnpm | — |

### 1.3 项目结构

```
ai-chat-standalone/
├── src/
│   ├── App.jsx                    ← 根组件（布局编排 + 状态机）
│   ├── styles.css                 ← 全局样式
│   ├── aiService.js               ← AI 统一入口
│   ├── aiEndpoint.js              ← 运行时端点路由（dev proxy vs 直连）
│   ├── aiError.js                 ← AI 错误分类 + 用户友好消息
│   ├── browserTool.js             ← 网页内容抓取
│   ├── chatHardFailureContent.js  ← 聊天硬失败内容构建器
│   ├── chatRegionBlockedError.js  ← 区域封锁检测
│   ├── clientImageDataUrl.js      ← 图片 base64 转换
│   ├── customAnthropicService.js  ← Anthropic 协议适配器
│   ├── customChatTemperature.js   ← 模型温度特殊处理
│   ├── customOpenAIService.js     ← OpenAI 协议适配器
│   ├── dragInject.js              ← 选中文字拖拽注入聊天
│   ├── i18n.js                    ← 中英双语国际化
│   ├── modelConfigGuard.js        ← 模型配置验证
│   ├── modelPresets.js            ← 10+ AI 厂商预设
│   ├── multimodalApiError.js      ← 多模态错误码
│   ├── paragraphExtractor.js      ← PDF 段落提取
│   ├── pdfOutline.js              ← PDF 大纲提取
│   ├── pdfSelection.js            ← PDF 选中逻辑
│   ├── pdfService.js              ← PDF 文本提取
│   ├── pdfWorker.js               ← pdf.js worker 配置
│   ├── retrievalContext.js        ← 检索上下文构建
│   ├── storage.js                 ← 数据持久化（localStorage + IndexedDB）
│   ├── vibeParser.js              ← 论文结构化解析
│   ├── vibePrompts.js             ← AI prompt 模板
│   ├── attentionNavigator.js      ← 注意力导航算法
│   ├── bidirectionalAnchor.js     ← 双向锚点（PDF 段落 ↔ 面板高亮）
│   ├── ocrSourceSpans.js          ← OCR 结果标准化
│   ├── tauriHttp.js               ← Tauri 原生 HTTP 客户端
│   ├── agent/                     ← 阅读 Agent 系统（8 模块）
│   ├── services/                  ← 数据服务层（6 模块）
│   ├── store/                     ← Zustand stores（8 个）
│   ├── *.jsx                      ← React 组件（18 个）
│   └── __tests__/                 ← 44 个单元测试文件
├── src-tauri/
│   └── src/
│       ├── lib.rs                 ← Tauri 入口，注册 30 个命令
│       ├── main.rs                ← main 函数
│       ├── commands/              ← Tauri 命令层
│       │   ├── mod.rs
│       │   └── storage.rs         ← 35+ 个存储命令
│       └── core/                  ← Rust 核心层
│           ├── mod.rs
│           ├── storage.rs         ← RusQLite 数据访问层（2400 行）
│           └── error.rs           ← 错误类型定义
├── e2e/                           ← 9 个 Playwright 测试文件
├── scripts/                       ← 工具脚本（模型配置 seeding / QA 冒烟）
├── docs/                          ← 18 份项目文档
├── demo-assets/                   ← 7 个演示用文件
├── proxy/                         ← Vercel Edge 代理（Kimi + MiniMax API Key 隐藏）
├── DESIGN.md                      ← 视觉设计规范
├── DEVLOG.md                      ← 开发日志（95KB+）
├── package.json
├── vite.config.js
├── vitest.config.js
└── playwright.config.cjs
```

### 1.4 核心数据流

```
用户打开文件
  │
  ▼
documentService.fileToDocument()        ← 生成 stable document ID
  │
  ├─ PDF → PdfViewer.jsx (pdfjs-dist 渲染)
  │         │
  │         ├─ paragraphExtractor       ← 提取段落
  │         ├─ pdfOutline              ← 提取大纲
  │         └─ pdfSelection            ← 选中 → annotation / drag-inject
  │
  ├─ Markdown/Text/HTML → DocumentReader.jsx (MarkdownRenderer)
  │
  ▼
documentStore.addDocument()             ← Zustand 内存状态
  │
  ├─ persistentStorage.savePersistentDocument()  ← Tauri → SQLite
  └─ sourceIndexService.indexDocumentSourceSpans() ← 全文索引
  │
  ▼
用户与 AI 交互
  │
  ├─ 直接对话 → aiService.sendMessage() → customOpenAIService / customAnthropicService
  │                │
  │                ├─ 浏览器环境 → fetch（通过 Vite dev proxy）
  │                └─ Tauri 环境 → tauriHttp（绕过 CORS）
  │
  ├─ 选中文字注入 → dragInject → ChatInput
  │
  └─ Agent 任务 → agent/runtime.js → model ↔ tools 循环
                     │
                     ├─ paper_overview_agent
                     ├─ attention_agent
                     └─ card_generation_agent
```

---

## 2. 模块职责

### 2.1 前端模块

#### App.jsx — 根组件

**职责**：布局编排、文档加载路由、AI 面板切换、拖拽分栏、会话管理。

**关键逻辑**：
- 根据文档类型（PDF / Markdown / Text / HTML）切换阅读器组件
- 管理 6 个 AI 面板的 lazy-load（SummaryPanel / FlashcardDeck / ThinkingTreePanel / AttentionNavigatorPanel / ArtifactPanel / TaskStatusPanel）
- 处理 `vibereader:select-paragraph` 和 `vibereader:navigate-paragraph` 自定义事件（PDF 段落 ↔ 面板联动）
- 拖拽注入（drag-inject）：选中文字拖到 AI 面板自动填充到聊天输入

#### 文档阅读器

| 组件 | 文件 | 职责 |
|------|------|------|
| `PdfViewer.jsx` | 620 行 | pdfjs-dist 渲染、缩放、翻页、文本层、大纲侧栏、选中注入、OCR 按钮 |
| `DocumentReader.jsx` | — | Markdown / Text / HTML 渲染（MarkdownRenderer） |
| `PdfAnnotationToolbar.jsx` | — | PDF 选中后弹出标注工具栏（高亮 / 笔记） |

#### AI 面板组件

| 组件 | 职责 |
|------|------|
| `SummaryPanel.jsx` | 全文 / 段落级摘要 |
| `FlashcardDeck.jsx` | 闪卡复习（Anki 风格，已知/未知标记） |
| `ThinkingTreePanel.jsx` | 思维导图（SVG 渲染） |
| `AttentionNavigatorPanel.jsx` | 注意力导航（创新点 / 方法 / 对比 / 反常四类卡片） |
| `ArtifactPanel.jsx` | VibeCard / LensCard 列表 |
| `TaskStatusPanel.jsx` | Agent 任务进度展示 |
| `AgentProgressPanel.jsx` | Agent 运行进度条 |

#### 聊天组件

| 组件 | 职责 |
|------|------|
| `ChatInput.jsx` | Slate.js 富文本输入 + 模型选择 + 图片上传 + 发送 |
| `ChatSubmitControl.jsx` | 停止生成 / 发送按钮逻辑 |
| `MarkdownRenderer.jsx` | AI 回复的 Markdown + KaTeX + 代码高亮渲染 |
| `ImageUploader.jsx` | 多模态图片上传 |
| `ImagePreview.jsx` | 图片缩略图预览 |
| `ChatImageLightbox.jsx` | 聊天图片灯箱 |

### 2.2 数据服务层（services/）

| 模块 | 文件 | 职责 |
|------|------|------|
| `documentService.js` | — | 文档 fingerprint → stable ID、文件解析、Tauri 文件打开、HTML 消毒 |
| `persistentStorage.js` | — | 适配层：浏览器用 localStorage，Tauri 用 SQLite（30+ 命令映射） |
| `artifactService.js` | — | VibeCard / LensCard CRUD，文档隔离 |
| `annotationService.js` | — | 高亮 / 笔记标注 CRUD |
| `sourceIndexService.js` | — | 全文 source span 索引 + 搜索（Rust 端或 JS 降级） |
| `ocrService.js` | — | tesseract.js OCR 调用（chi_sim + eng） |

### 2.3 Agent 系统（agent/）

| 模块 | 职责 |
|------|------|
| `index.js` | 公共 API 导出（runReadingAgent / createReadingTools / buildReadingAgentTask 等） |
| `runtime.js` | Agent 执行引擎：model ↔ tools 循环，max-iteration 停止，permission 检查 |
| `tools.js` | 阅读工具实现（extractText / navigatePage / searchDocument / createAnnotation / createVibeCard 等） |
| `permissions.js` | 工具权限白名单（默认只读，写工具显式允许） |
| `contextPacker.js` | 上下文打包：按优先级截断（goal → metadata → selection → outline → body） |
| `readingTaskModels.js` | 预定义 Agent 任务模板（paper_overview / attention / card_generation） |
| `skills.js` | Agent skill 注册（4 种 skill 类型） |
| `artifact.js` | Artifact 创建 + 有效性验证（source-grounded 保证） |
| `lensCard.js` | Lens Card 专项：选中文本 → 结构化 Lens Card |
| `taskRunner.js` | 异步任务生命周期管理（pending → running → succeeded/failed） |

### 2.4 Zustand Stores

| Store | 状态 | 关键 Actions |
|-------|------|-------------|
| `conversationStore` | messages, sessions, loading | addMessage, updateMessage, clearMessages |
| `documentStore` | documents, activeDocumentId, currentDocument | addDocument, setActiveDocument, setDocuments |
| `modelStore` | selectedModel, modelConfigs, visionCapable | selectModel, hasValidConfig（persist 到 localStorage） |
| `pdfStore` | pdfData, currentPage, totalPages, zoom | setPdfData, setCurrentPage, setZoom |
| `uiStore` | rightToolTab, sidebarCollapsed | setRightToolTab, toggleSidebar |
| `vibeStore` | vibeData, summaryData | setVibeData, setSummaryData |
| `flashcardStore` | decks, currentDeck, currentCard | — |
| `progressStore` | agentProgress | setProgress, clearProgress |

### 2.5 Rust 后端（src-tauri）

| 模块 | 职责 |
|------|------|
| `lib.rs` | Tauri 入口，注册 30 个 invoke_handler，初始化 SQLite + 3 个 Tauri 插件 |
| `commands/storage.rs` | 30+ 个 Tauri 命令的入口分发 |
| `core/storage.rs` | RusQLite 数据访问层（2400 行），15 张表的 CRUD + 导入导出 |
| `core/error.rs` | StorageError 类型定义 |

### 2.6 AI 服务层

```
aiService.js（统一入口）
  │
  ├─ customOpenAIService.js   ← OpenAI 协议（DeepSeek / Moonshot / Kimi 等）
  ├─ customAnthropicService.js ← Anthropic 协议（Claude / MiniMax-M3）
  │
  ├─ 运行时路由：
  │   ├─ 浏览器 → fetch（Vite dev proxy: /api/minimax /api/mimo /api/kimi）
  │   └─ Tauri  → tauriHttp.js（绕过 CORS）
  │
  ├─ 流式响应：SSE 解析 + AbortController 支持
  ├─ 多模态：图片 base64 转换 + vision 模型检测
  └─ 错误处理：aiError.js（分类 401/403/429/503/CORS/超时）+ chatHardFailureContent.js
```

---

## 3. 关键类与函数

### 3.1 前端核心

| 函数/类 | 位置 | 职责 |
|---------|------|------|
| `fileToDocument()` | services/documentService.js | 文件 → stable document ID（基于 source + name + size + lastModified 的 FNV hash） |
| `extractTextFromPDF()` | pdfService.js | pdf.js worker 提取 PDF 文本层 |
| `flattenPdfOutline()` | pdfOutline.js | PDF 嵌套大纲 → 扁平化页面列表 |
| `extractParagraphsFromPage()` | paragraphExtractor.js | PDF 页面 → 段落列表（合并同段、y-gap 分割、首行缩进检测） |
| `buildReadingAgentTask()` | agent/index.js | 构建 Agent 任务 payload（model + tools + context + permissions） |
| `runReadingAgentTask()` | agent/runtime.js | 执行 Agent 循环（model call → tool execution → 直到 final answer 或 max iterations） |
| `packDocumentContext()` | agent/contextPacker.js | 按优先级截断上下文（goal > metadata > selection > outline > annotation > body） |
| `generateLensCardArtifact()` | agent/lensCard.js | 选中文本 → 结构化 Lens Card（source-grounded） |
| `createDragInjectPayload()` | dragInject.js | 选中文字 → DataTransfer（MIME: application/x-vibereader-drag-inject） |
| `resolveAiEndpointForRuntime()` | aiEndpoint.js | 根据运行环境决定 API 端点（local proxy vs 直连） |

### 3.2 Rust 核心

| 函数 | 位置 | 职责 |
|------|------|------|
| `Storage::init_schema()` | core/storage.rs | 创建 15 张表 + 索引 |
| `Storage::upsert_document()` | core/storage.rs | 文档 upsert（INSERT ... ON CONFLICT） |
| `Storage::create_vibecard()` | core/storage.rs | VibeCard 创建 |
| `Storage::export_reading_note()` | core/storage.rs | 阅读笔记导出（Markdown + JSON） |
| `Storage::import_reading_note_json()` | core/storage.rs | 阅读笔记导入（带 document_id 一致性校验） |
| `Storage::search_source_spans()` | core/storage.rs | 全文搜索（tokenize → score → rank） |
| `tokenize_query()` | core/storage.rs | 查询分词（lowercase + 非字母数字分割 + ≥3 字符过滤） |

---

## 4. 数据模型

### 4.1 SQLite 表结构（15 张表）

| 表名 | 主键 | 索引 | 职责 |
|------|------|------|------|
| `documents` | id | opened_at DESC | 文档元数据 |
| `document_contents` | document_id | — | 文档全文内容 |
| `annotations` | id | document_id + created_at | 高亮 / 笔记标注 |
| `vibecards` | id | document_id + created_at | AI 生成的阅读卡片 |
| `flashcard_decks` | id | document_id + updated_at | 闪卡牌组 |
| `flashcards` | id | deck_id + created_at | 闪卡（前后项 + 已知/未知标记） |
| `conversations` | session_id | updated_at DESC | AI 对话会话 |
| `thinking_trees` | document_id | — | 思维导图 |
| `attention_insights` | id | document_id + page + paragraph_index | 注意力导航洞察 |
| `summaries` | (document_id, summary_kind, section_id) UNIQUE | document_id + summary_kind | 摘要 |
| `source_spans` | id | document_id + order_index | 全文段落索引（用于 source-grounded AI） |
| `source_index_status` | document_id | — | 索引状态（signature + span_count） |
| `task_records` | id | document_id + updated_at / status + updated_at | Agent 任务记录 |
| `schema_migrations` | version | — | 迁移版本管理 |

### 4.2 数据流向

```
浏览器环境                     Tauri 环境
───────────                   ───────────
localStorage                   SQLite (rusqlite)
  │                              │
  ├─ modelStore (persist)        ├─ documents / document_contents
  ├─ conversation history        ├─ annotations / vibecards
  └─ UI preferences              ├─ flashcard_decks / flashcards
                                 ├─ conversations / thinking_trees
                                 ├─ attention_insights / summaries
                                 ├─ source_spans / source_index_status
                                 └─ task_records

持久化适配层（persistentStorage.js）根据 isTauriRuntime() 自动选择路径
```

---

## 5. 依赖关系

### 5.1 前端依赖图（简化）

```
App.jsx
  ├── store/ (8 stores)
  ├── aiService.js
  │     ├── customOpenAIService.js
  │     ├── customAnthropicService.js
  │     ├── tauriHttp.js
  │     ├── aiError.js
  │     └── multimodalApiError.js
  ├── services/
  │     ├── documentService.js
  │     ├── persistentStorage.js
  │     │     └── [Tauri invoke: storage_*]
  │     ├── artifactService.js
  │     ├── annotationService.js
  │     ├── sourceIndexService.js
  │     └── ocrService.js
  ├── agent/
  │     ├── runtime.js
  │     ├── tools.js
  │     ├── contextPacker.js
  │     ├── readingTaskModels.js
  │     └── artifact.js / lensCard.js
  ├── PdfViewer.jsx
  │     ├── pdfService.js
  │     ├── pdfOutline.js
  │     ├── pdfSelection.js
  │     ├── paragraphExtractor.js
  │     └── PdfAnnotationToolbar.jsx
  └── [lazy-loaded panels]
        ├── SummaryPanel.jsx
        ├── FlashcardDeck.jsx
        ├── ThinkingTreePanel.jsx
        ├── AttentionNavigatorPanel.jsx
        ├── ArtifactPanel.jsx
        └── TaskStatusPanel.jsx
```

### 5.2 Rust 依赖

```
lib.rs
  ├── commands/storage.rs (30+ Tauri commands)
  │     └── core/storage.rs (RusQLite)
  ├── plugins: tauri_plugin_fs, tauri_plugin_dialog, tauri_plugin_http, tauri_plugin_log
  └── core/error.rs
```

---

## 6. 运行方式

### 6.1 开发环境

```bash
# 安装依赖
pnpm install

# 开发服务器（Vite HMR，端口 3217）
pnpm dev

# 生产构建
pnpm build

# 单元测试（Vitest）
pnpm test

# E2E 测试（Playwright，需要先启动 dev server）
pnpm test:e2e

# QA 冒烟测试
pnpm qa:smoke

# Tauri 桌面预览
pnpm tauri:dev
```

### 6.2 Vite 代理配置

开发环境下，AI 提供商 API 通过 Vite dev server 代理，绕过 CORS：

| 前端路径 | 后端目标 | 用途 |
|----------|---------|------|
| `/api/minimax` | `https://api.minimaxi.com/anthropic` | MiniMax Token Plan / MiniMax API（Anthropic 协议） |
| `/api/mimo` | Token Plan 端点 | MiMo 模型 |
| `/api/kimi` | `https://api.moonshot.cn/v1` | Kimi/Moonshot（OpenAI 协议） |

生产环境使用 Vercel Edge Functions（`proxy/` 目录）隐藏 API Key。

### 6.3 模型预设

| 预设 | Base URL | 协议 | 默认模型 |
|------|----------|------|---------|
| MiniMax Token Plan | `api.minimaxi.com/anthropic` | Anthropic | MiniMax-M3 |
| MiniMax API | `api.minimaxi.com/anthropic` | Anthropic | MiniMax-M3 |
| StepFun | `api.stepfun.com/step_plan` | OpenAI | step-3.7-flash |
| DeepSeek | `api.deepseek.com` | OpenAI | deepseek-chat |
| Kimi / Moonshot（可选，需真实 Key） | `api.moonshot.cn/v1` | OpenAI | kimi-k2.6 |
| MiMo | Token Plan | OpenAI | — |

当前模型服务事实以 `docs/LOCAL_MODEL_SERVICES.md` 为准。

---

## 7. 测试架构

### 7.1 单元测试（44 个文件，Vitest）

| 模块 | 测试文件数 | 关键覆盖 |
|------|-----------|---------|
| agent/ | 10 | runtime, tools, permissions, contextPacker, artifact, lensCard, taskRunner, skills, readingTaskModels, cardGenerationFlow |
| services/ | 7 | documentService, artifactService, annotationService, persistentStorage, sourceIndexService, ocrService |
| store/ | 2 | uiStore, documentStore |
| AI 层 | 5 | aiService, aiError, aiEndpoint, modelConfigGuard, modelPresets |
| PDF 层 | 5 | paragraphExtractor, pdfOutline, pdfSelection, pdfWorker, ocrSourceSpans |
| 其他 | 3 | retrievalContext, bidirectionalAnchor, demoAssets |

**测试模式**：Adapter/Mock 注入（函数作为参数传入，而非直接 import），支持纯单元测试无需真实 I/O。

### 7.2 E2E 测试（9 个文件，Playwright）

| 测试 | 覆盖 |
|------|------|
| `homepage.spec.js` | 布局结构、侧边栏折叠 |
| `pdf-viewer.spec.js` | PDF 上传、渲染、翻页、大纲导航、文本选中标注 |
| `document-reader.spec.js` | Markdown / Text / HTML 上传渲染 |
| `ai-chat.spec.js` | 选中文字注入聊天、无 API Key 错误、发送按钮 |
| `source-ref-navigation.spec.js` | 双向锚点导航 |
| `multi-document.spec.js` | 多文档切换 |
| `workspace-viewport.spec.js` | 响应式布局（1024px / 820px / 缩放） |
| `web-persistence.spec.js` | 页面刷新后 artifact 和 annotation 恢复 |
| `visual-qa.spec.js` | 多视口截图 QA |

---

## 8. 设计系统（DESIGN.md）

### 8.1 配色

| Token | 浅色 | 暗色 |
|-------|------|------|
| `--bg-base` | `#fefcf6` | `#0d1117` |
| `--bg-elevated` | `#ffffff` | `#161b22` |
| `--text-primary` | `#1a1a2e` | `#ffffffe5` |
| `--text-secondary` | `#4a4a5a` | `#ffffff8c` |
| `--border-subtle` | `rgba(26,26,26,0.06)` | `rgba(255,255,255,0.1)` |

品牌三色：蓝 `#2B7FD8` / 黄 `#F4D758` / 红 `#E84A5F`

### 8.2 字体

| 层级 | 字体 |
|------|------|
| 品牌标题 | Fraunces (italic) + Noto Serif SC |
| UI 标题 | Inter / system-ui |
| 正文 | Inter / -apple-system |
| 代码 | Fira Code, SFMono-Regular |

### 8.3 组件规范

- 圆角：卡片 12px / 按钮 pill / 输入框 10px / 标签 6px
- 阴影：`0 2px 12px rgba(0,0,0,0.04)`，hover 加深
- 动效：hover translateY(-2px) / focus blue glow / active scale(0.98)
- 禁止：glassmorphism / neon / bounce / 渐变文字 / 纯黑纯白大面积

---

## 9. 关键文件速查

| 需要了解... | 先读这个文件 |
|------------|------------|
| 整体布局和路由 | `App.jsx` |
| 状态管理 | `store/` 下 8 个文件 |
| AI 调用流程 | `aiService.js` → `customOpenAIService.js` |
| PDF 渲染 | `PdfViewer.jsx` + `pdfService.js` |
| Agent 系统 | `agent/runtime.js` + `agent/tools.js` |
| 数据持久化 | `services/persistentStorage.js` → `src-tauri/src/core/storage.rs` |
| 设计规范 | `DESIGN.md` |
| 产品需求 | `docs/VIBEREADER_PRD_RUST_BACKED.md` |
| 实现计划 | `docs/CODEX_IMPLEMENTATION_PLAN.md` |
| 开发日志 | `DEVLOG.md` |
