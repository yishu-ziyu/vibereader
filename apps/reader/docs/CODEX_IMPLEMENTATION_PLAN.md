# Vibero Standalone 两周开发执行计划

最后更新：2026-05-23

## 当前执行状态

2026-05-23 更新：

- Phase 0 已完成：本目录已初始化 git，并保留迁移前基线提交。
- Phase 1 已完成：已迁移到 Vite，并初始化 Tauri v2 桌面壳。
- Phase 2 已进入实现状态：已新增统一文档服务、Tauri 文件选择器接入、浏览器上传 fallback、`documentStore` 和 PDF 解析复用链路。
- 自动验证已通过：`npm run build`、`cd src-tauri && cargo check`、`npm run tauri:dev`。
- 尚未完成的 Phase 2 手工验收：在真实桌面窗口中选择一份本地 PDF，确认解析、视觉渲染、翻页缩放和选区注入。

下文 “当前项目状态” 保留为制定计划时的基线快照，实际进度以 `tasks/todo.md` 和 `DEVLOG.md` 为准。

## 0. 接力结论

这份计划承接前一轮 Antigravity CLI 的讨论与本轮本机复核。结论已经确认：

- 主战场切换到 `/Users/mahaoxuan/Desktop/ai-chat-standalone`。
- 不再继续把 Zotero fork 当作主要产品路线。
- 桌面壳选择 Tauri v2。
- Hackathon 目标不是“完整替代 Zotero”，而是交付一个可演示、可打开本地文件、可读 PDF/Markdown/HTML、可把阅读内容注入 AI 的轻量桌面阅读器。

旧目录 `/Users/mahaoxuan/Desktop/黑客松/Vibero` 只保留历史对照和桥接文档。后续开发不要优先修改旧 Zotero fork，除非明确为了迁移资产或做架构对照。

## 1. 当前项目状态

### 1.1 已核实的本地事实

- `/Users/mahaoxuan/Desktop/ai-chat-standalone` 当前不是 git 仓库。
- `npm run build` 可以完成，耗时约 18 秒。
- 构建产物存在体积警告：`main.30b3a2ec.js` 约 2.43 MiB。
- 当前使用 webpack，不是 Vite。
- 当前 PDF 打开方式依赖浏览器 `<input type="file">`。
- `src/pdfService.js` 已经把 PDF 的 `ArrayBuffer` 写入 `usePdfStore().setPdfFile(arrayBuffer)`，`src/PdfViewer.jsx` 可以基于该数据视觉渲染 PDF。
- AI Service 已经支持 OpenAI/Anthropic 双协议，并支持 MiniMax/Anthropic 风格 `thinking_delta`。
- 已经存在 Summary、Flashcard、MindMap、AgentProgressPanel、browserTool、Zustand store。

### 1.2 当前能力清单

| 模块 | 文件 | 当前状态 | 风险 |
| --- | --- | --- | --- |
| 聊天主界面 | `src/App.jsx` | 可用，集成多标签页和会话 | 文件偏大，后续布局改造容易牵连 |
| AI 服务 | `src/aiService.js` | 可用，支持流式、thinking、多协议 | 缺 AbortController，停止生成能力缺失 |
| PDF 文本解析 | `src/pdfService.js` | 可用，带进度事件 | worker 来自 CDN，桌面离线体验不稳 |
| PDF 视觉阅读 | `src/PdfViewer.jsx` | 可用，支持渲染、缩放、翻页、选中注入 | 无大纲、无批注、无多文档 |
| 数据持久化 | `src/storage.js` | IndexedDB + localStorage 可用 | 未持久化文档库和批注 |
| Markdown 渲染 | `src/MarkdownRenderer.jsx` | 可用 | 目前主要服务聊天内容，不是文档阅读器 |
| 摘要/闪卡/思维导图 | `SummaryPanel` 等 | 可用 | 与文档结构、选区、批注的耦合还弱 |
| 桌面端 | 无 `src-tauri` | 未开始 | 当前不能作为桌面应用交付 |

## 2. 产品成功标准

### 2.1 Hackathon 演示必须成立的闭环

1. 用户启动 Vibero 桌面应用。
2. 用户通过系统文件选择器打开本地 PDF。
3. PDF 在阅读面板中视觉呈现，能翻页、缩放、选择文本。
4. 用户选中文本并注入 AI 面板。
5. AI 能围绕该选区解释、总结、提问或生成卡片。
6. 用户可以切换到 Summary、Flashcards、Mind Map 面板看到基于文档的结构化结果。
7. 用户可以再打开 Markdown 或 HTML 文档，证明产品不只服务论文 PDF。
8. 演示过程中界面稳定，不需要解释 Zotero、XULRunner 或插件安装。

### 2.2 两周内不追求的内容

- 不做完整 Zotero 兼容层。
- 不做云同步账户系统。
- 不做 Word/PPT/EPUB 的完整生产级解析。
- 不做复杂 OCR。
- 不做完整引用管理器。
- 不做生产级自动更新和签名发布。

## 3. 开发阶段

### Phase 0：保护现场与基线验证（0.5 天）

目标：让后续 Codex 可以安全修改，不在无版本保护状态下直接大改。

任务：

1. 在 `/Users/mahaoxuan/Desktop/ai-chat-standalone` 初始化 git，或先复制一个时间戳备份目录。
2. 记录当前 `npm run build` 输出。
3. 新建 `DEVLOG.md`，之后每个阶段记录改动和验证结果。
4. 给当前 webpack 版本打一个本地基线标记，例如 `baseline-webpack-standalone`。

验收：

- `git status` 能显示清晰工作区状态，或存在明确备份目录。
- `npm run build` 仍然通过。
- `DEVLOG.md` 有 Phase 0 记录。

### Phase 1：Tauri v2 桌面壳（1-2 天）

目标：把现有 Web App 包进 Tauri，但先不改变业务逻辑。

任务：

1. 安装 Tauri 相关依赖：
   - `@tauri-apps/cli`
   - `@tauri-apps/api`
   - `@tauri-apps/plugin-dialog`
   - `@tauri-apps/plugin-fs`
2. 迁移构建工具到 Vite：
   - 新增 `vite.config.js`
   - 将 `public/index.html` 迁移为 Vite 入口 `index.html`
   - 更新 `package.json` scripts：`dev`、`build`、`tauri:dev`、`tauri:build`
3. 初始化 `src-tauri`：
   - 应用名 `VibeReader`
   - bundle identifier `cn.yishuziyu.vibereader`
   - 权限只开放文件选择和必要文件读取。
4. 迁移图标：使用现有 `icons/vibero.png` 生成 Tauri 所需 icon。

验收：

- `npm run build` 通过。
- `npm run dev` 能打开浏览器版。
- `npm run tauri:dev` 能启动桌面窗口。
- 桌面窗口中现有聊天界面、PDF 上传入口、Tabs 不崩溃。

### Phase 2：桌面文件打开与文档模型（1 天）

目标：从浏览器文件上传升级到桌面文件打开，并为多格式阅读打基础。

任务：

1. 新增 `src/services/documentService.js`。
2. 定义统一文档对象：

```js
{
  id: string,
  name: string,
  kind: 'pdf' | 'markdown' | 'html' | 'text',
  source: 'local-file' | 'browser-upload',
  path?: string,
  mimeType?: string,
  size?: number,
  contentText?: string,
  binary?: ArrayBuffer,
  openedAt: number
}
```

3. 新增 `openLocalDocument()`：
   - 在 Tauri 环境使用 `@tauri-apps/plugin-dialog` 打开系统文件选择器。
   - 在浏览器环境回退到 `<input type="file">`。
4. 修改 `pdfStore` 或新增 `documentStore`，保存当前文档、文档列表、活动文档 id。
5. 保持旧 PDF 上传路径可用，作为浏览器 fallback。

验收：

- 在 Tauri 窗口中点击“打开文件”能选择本地 PDF。
- PDF 解析和视觉渲染仍然正常。
- 在普通浏览器 `npm run dev` 下也能通过上传文件使用。
- 文件打开失败时有用户可读错误，不出现空白页。

### Phase 3：阅读器与 AI 面板双栏布局（1 天）

目标：从“Tabs 切换工具”升级为“左读右问”的核心工作台。

任务：

1. 新增 `src/components/WorkspaceLayout.jsx`。
2. 布局为三块：
   - 左侧边栏：文件/会话/设置。
   - 中间阅读器：PDF/Markdown/HTML。
   - 右侧 AI 面板：Chat/Summary/Flashcard/MindMap tabs。
3. 中间阅读器和右侧 AI 面板之间加入可拖拽分隔线。
4. 将当前 `App.jsx` 的 inline style 逐步迁移到 `styles.css` 或局部组件，但不要做大规模无关重构。
5. 保留移动/窄屏降级：小屏幕下允许折叠右侧 AI 面板。

验收：

- 桌面宽屏下阅读器和 AI 面板同时可见。
- 分隔线拖拽不会让任一面板宽度小于可用下限。
- Chat 输入框固定在右侧 AI 面板底部，不遮挡消息。
- PDF 翻页、选中文本、注入 AI 仍然可用。

### Phase 4：Stop generating 与请求取消（0.5 天）

目标：补齐 AI 产品基础体验。

任务：

1. 在 `aiService.chatStream` 中支持 `AbortSignal`。
2. 在 `App.jsx` 或 store 中保存当前请求 controller。
3. `ChatInput` loading 状态下提供停止按钮。
4. 停止后 assistant 消息状态改为非 typing，并保留已生成内容。

验收：

- 长回复生成时点击 Stop，网络请求被中断。
- UI 不再显示 loading。
- 已生成部分保留，消息可以继续追问。
- 控制台无未捕获异常。

### Phase 5：PDF 大纲、页内定位与最小批注（2-3 天）

目标：让阅读器像真正的阅读器，而不只是 PDF canvas。

任务：

1. PDF 大纲：
   - 使用 `pdfDoc.getOutline()` 获取目录。
   - 在阅读器左上或侧栏展示可折叠目录。
   - 点击目录跳转目标页。
2. 页内定位：
   - 保存当前页、缩放、滚动位置。
   - 文档切换后恢复上次阅读位置。
3. 最小批注：
   - 文本选区后出现浮动工具条。
   - 支持两种操作：高亮、添加笔记。
   - 批注数据先存 IndexedDB，不必写回 PDF 文件。
4. 批注数据结构：

```js
{
  id: string,
  documentId: string,
  page: number,
  selectedText: string,
  note?: string,
  color: 'yellow' | 'green' | 'blue',
  createdAt: number
}
```

验收：

- 有目录的 PDF 可以显示大纲并跳转。
- 用户能选中文字并创建高亮。
- 用户能给高亮添加一条笔记。
- 刷新应用后批注仍能在列表中看到。
- 如果高亮 overlay 暂时不能完美复原位置，至少批注列表、页码、选中文本、笔记必须持久化。

### Phase 6：Markdown/HTML/Text 通用阅读（1-2 天）

目标：兑现“除了论文也能读别的”。

任务：

1. 新增 `src/components/MarkdownDocumentViewer.jsx`。
2. 复用 `MarkdownRenderer` 渲染 Markdown。
3. HTML 文件先做安全保守处理：
   - 优先提取正文文本。
   - 不直接执行脚本。
   - 可以使用 iframe sandbox 或 DOMParser 清洗后渲染。
4. Text 文件用轻量阅读器，支持选中注入 AI。
5. 统一选区注入接口：`onSelectionInject(text, metadata)`。

验收：

- `.md` 文件可以打开并渲染标题、列表、代码块。
- `.html` 文件可以打开且不执行脚本。
- `.txt` 文件可以打开。
- 任意文本格式都能选中一段内容并注入 AI。

### Phase 7：演示链路与视觉打磨（2 天）

目标：让 Hackathon 演示稳定、好看、可复现。

任务：

1. 准备 `demo-assets/`：
   - 一篇 PDF 论文。
   - 一篇 Markdown 文章。
   - 一篇 HTML 或纯文本文章。
2. 写 `docs/DEMO_SCRIPT.md`：
   - 3 分钟短演示。
   - 8 分钟完整演示。
   - 失败时的备用路径。
3. 视觉打磨：
   - 应用标题显示 `VibeReader Standalone Dev`，不要继续显示 `AI Chat`。
   - 阅读器、AI 面板、侧边栏视觉层级统一。
   - 交互按钮使用图标和 tooltip。
4. 加基础空状态和错误状态。

验收：

- 新机器或清空缓存后，按演示脚本能完整跑通。
- PDF、Markdown、AI 对话三段演示都能成功。
- 没配置 API key 时，界面能清晰提示配置模型。

## 4. 推荐优先级

最高优先级：

1. Phase 0 版本保护。
2. Phase 1 Tauri 启动。
3. Phase 2 系统文件打开。
4. Phase 3 左读右问布局。
5. Phase 4 Stop generating。

第二优先级：

1. Markdown/Text 阅读。
2. PDF 大纲。
3. 最小批注。

可砍项：

1. EPUB。
2. Word/PPT。
3. 自动更新。
4. 高精度 PDF 批注 overlay。
5. 移动端。

## 5. 关键技术风险

### 风险 1：Tauri WebView 与 pdf.js worker

当前 worker 使用 CDN：

```js
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
```

桌面端应改为本地 worker，否则离线或网络受限时 PDF 解析失败。

推荐处理：

- Vite 迁移后使用本地 worker import。
- 或将 worker 文件复制到 public assets 并通过相对路径引用。

### 风险 2：一次性重构 App.jsx 太大

`src/App.jsx` 是主状态和布局中心。不要第一步就大拆。

推荐处理：

1. 先让 Tauri 跑起来。
2. 再抽出 `WorkspaceLayout`。
3. 再迁移阅读器/AI 面板。

### 风险 3：没有 git 仓库

当前目录不是 git 仓库。大规模迁移前必须保护现场。

### 风险 4：批注系统会吞时间

高精度 PDF highlight overlay 很容易超时。Hackathon 最小版本应先保证批注数据和列表成立，不强求像 Zotero 一样精确复现。

## 6. 每日里程碑

| 天数 | 目标 | 当天可验收结果 |
| --- | --- | --- |
| Day 0 | 保护现场 + 基线 | 有 git/备份，build 通过 |
| Day 1 | Vite + Tauri 初始化 | `npm run tauri:dev` 打开窗口 |
| Day 2 | Tauri 文件打开 | 系统选择器打开 PDF |
| Day 3 | 双栏工作台 | 阅读器和 AI 面板同时显示 |
| Day 4 | Stop generating + worker 本地化 | 可中断生成，PDF 离线解析 |
| Day 5 | Markdown/Text 阅读 | 打开 md/txt 并注入 AI |
| Day 6 | PDF 大纲 | 显示目录并跳转 |
| Day 7 | 最小批注 | 选区高亮/笔记可保存 |
| Day 8 | 多文档标签 | 多个文档切换 |
| Day 9 | 演示资产 + 脚本 | 按脚本跑通 |
| Day 10 | QA 修复 | 无阻塞 bug |
| Day 11-14 | 缓冲 | 打包、视觉、备用演示 |

## 7. 给开发 agent 的执行原则

- 先读本文件和 `docs/ACCEPTANCE_AND_QA.md`。
- 每完成一个 Phase，更新 `tasks/todo.md` 和 `DEVLOG.md`。
- 每次改动后至少跑 `npm run build`。
- Tauri 相关阶段还要跑 `npm run tauri:dev` 或 `npm run tauri:build`。
- 不要把旧 `Vibero` Zotero fork 作为实现主线。
- 不要先做 EPUB/Word/PPT。
- 不要为了批注系统引入重型依赖，除非确认两周内必须。
- 优先让演示闭环成立，再做架构洁癖。
