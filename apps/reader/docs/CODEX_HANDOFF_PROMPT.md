# 给 Codex 的接力提示词

把下面整段交给新的 Codex 开发会话即可。

```text
你正在接手 VibeReader Standalone Dev 的两周 Hackathon 开发任务。

工作目录：
/Users/mahaoxuan/Desktop/ai-chat-standalone

重要背景：
- 旧的 /Users/mahaoxuan/Desktop/黑客松/Vibero 是 Zotero fork 路线，不再作为主战场。
- 用户已明确选择：全力推进 ai-chat-standalone，并用 Tauri v2 包成桌面端。
- 当前 ai-chat-standalone 已初始化 git。
- 当前应用名为 `VibeReader Standalone Dev`，旧 `_apps/Vibero.app` 不用于当前验收。
- 当前 npm run build 已验证通过，但有 bundle size warning。
- 当前项目已有 React 18、Ant Design 5、pdfjs-dist、Zustand、AI streaming、Thinking block、Summary/Flashcard/MindMap 等能力。

必须先读：
1. /Users/mahaoxuan/Desktop/ai-chat-standalone/docs/CODEX_IMPLEMENTATION_PLAN.md
2. /Users/mahaoxuan/Desktop/ai-chat-standalone/docs/ACCEPTANCE_AND_QA.md
3. /Users/mahaoxuan/Desktop/ai-chat-standalone/tasks/todo.md
4. /Users/mahaoxuan/Desktop/ai-chat-standalone/implementation-notes.md
5. /Users/mahaoxuan/Desktop/ai-chat-standalone/package.json
6. /Users/mahaoxuan/Desktop/ai-chat-standalone/src/App.jsx
7. /Users/mahaoxuan/Desktop/ai-chat-standalone/src/PdfViewer.jsx
8. /Users/mahaoxuan/Desktop/ai-chat-standalone/src/pdfService.js
9. /Users/mahaoxuan/Desktop/ai-chat-standalone/src/aiService.js

当前任务目标：
把现有 Web App 迁移为 Tauri v2 桌面应用，并完成 Hackathon demo 的最小可用闭环：
1. 桌面应用启动。
2. 系统文件选择器打开本地 PDF。
3. PDF 可视觉阅读、翻页、缩放、选择文字。
4. 选中文字可注入 AI 面板。
5. AI 支持流式回复和停止生成。
6. 支持 Markdown/Text 作为非论文阅读格式。
7. 产出 demo 脚本和验收记录。

执行顺序：
1. Phase 0：保护现场，初始化 git 或创建备份，记录 npm run build 基线，创建/更新 DEVLOG.md。
2. Phase 1：迁移 Vite，初始化 Tauri v2，验证 npm run dev / npm run build / npm run tauri:dev。
3. Phase 2：实现 Tauri 文件打开，抽象 documentService，并保留浏览器 fallback。
4. Phase 3：改造成左侧边栏 + 中间阅读器 + 右侧 AI 面板的工作台布局。
5. Phase 4：给 aiService 和 ChatInput 增加 AbortController/Stop generating。
6. Phase 5：Markdown/Text 阅读器，支持选区注入。
7. Phase 6：PDF 大纲和最小批注，视时间决定深度。
8. Phase 7：demo-assets、DEMO_SCRIPT、最终 QA。

每完成一个阶段：
- 更新 tasks/todo.md。
- 更新 DEVLOG.md。
- 运行 docs/ACCEPTANCE_AND_QA.md 中对应的验收命令。
- 不要声称完成，除非验证输出已经读过。

约束：
- 不要回到 Zotero fork 做主线开发。
- 不要优先做 EPUB/Word/PPT。
- 不要一开始大重构 App.jsx。
- 不要在没有版本保护的状态下进行 Tauri/Vite 大迁移。
- 不要引入重型批注框架，先做最小可演示批注。
- 保持改动小、可回退、可验证。

优先级：
P0 = Tauri 启动、本地 PDF 打开、PDF 阅读、选区注入 AI、Stop generating、无 API key 错误提示、演示脚本。
P1 = Markdown/Text 阅读、PDF 大纲、最小批注、多文档切换。
P2 = EPUB、Word/PPT、自动更新、移动端、高精度 PDF overlay。
```
