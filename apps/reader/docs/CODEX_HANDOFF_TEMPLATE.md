# Codex 技术对接文档模板

> 用途：当 Claude Code 规划完成后，将本模板填充为具体任务，转发给 Codex 执行 TDD 实现。

---

## 项目上下文

- **项目路径**: `/Users/mahaoxuan/Desktop/ai-chat-standalone`
- **技术栈**: Tauri v2 + React 18 + Vite 5 + pdf.js-dist + Ant Design X + Zustand
- **测试框架**: Vitest + @testing-library/react (jsdom)
- **运行命令**:
  - `npm run test` — 运行单元测试
  - `npm run build` — 生产构建
  - `npm run dev` — 开发服务器
  - `npm run tauri:dev` — Tauri 桌面开发

## Claude Code 已完成的工作

1. BDD 行为用例已写入 `tasks/bdd-tdd-*.md`
2. 技术预研报告已完成（如需参考，问 Claude Code）
3. 当前测试基线: 19 文件 / 66 测试全部通过
4. Git 基线已提交，工作区 clean

## Codex 的任务清单

### 任务格式

每个任务必须包含以下字段：

```yaml
task_id: "唯一标识"
type: "new_feature" | "bug_fix" | "refactor"
bdd_file: "tasks/bdd-tdd-xxx.md 中的行为用例编号"
files_to_read:
  - "src/xxx.jsx"  # 必须读取的现有文件
  - "src/xxx.js"
files_to_create:
  - "src/xxx.test.js"  # 先写测试（RED）
  - "src/xxx.js"       # 再写实现（GREEN）
files_to_modify:
  - "src/App.jsx"      # 集成点
constraints:
  - "遵循不可变数据模式（spread，不 mutate）"
  - "函数 <50 行，文件 <800 行"
  - "不硬编码，用常量"
  - "现有测试必须继续通过"
verification:
  - "npm run test 通过"
  - "npm run build 通过"
git:
  - "提交格式: feat: 简短描述"
```

### 当前任务

#### 任务 1: 拖拽引用（Drag-to-Inject）

```yaml
task_id: "drag-to-inject"
type: "new_feature"
bdd_file: "tasks/bdd-tdd-nonlinear-reading.md 用例 1.1-1.3"
files_to_read:
  - "src/PdfViewer.jsx"      # 当前选区注入逻辑
  - "src/App.jsx"            # 工作台布局 + AI Chat
  - "src/DocumentReader.jsx" # Markdown/Text 阅读器
  - "src/styles.css"         # 现有样式
files_to_create:
  - "src/dragInject.test.js" # TDD 测试
  - "src/dragInject.js"      # 拖拽逻辑封装
files_to_modify:
  - "src/PdfViewer.jsx"      # 添加 dragstart
  - "src/DocumentReader.jsx" # 添加 dragstart
  - "src/App.jsx"            # AI pane 添加 dragover/drop
  - "src/styles.css"         # 拖拽视觉反馈
constraints:
  - "使用 HTML5 Drag and Drop API"
  - "拖拽数据格式: text/plain + application/json (含 source 信息)"
  - "注入格式: '> 引用文本 [P{页码}]'"
  - "视觉反馈: 半透明遮罩 + 'Drop here to inject' 提示"
verification:
  - "npm run test 通过（含新增测试）"
  - "npm run build 通过"
git:
  - "feat: 拖拽引用交互（Drag-to-Inject）"
```

#### 任务 2: 段落级思维树（True Thinking Tree）

```yaml
task_id: "thinking-tree"
type: "new_feature"
bdd_file: "tasks/bdd-tdd-nonlinear-reading.md 用例 2.1-2.3"
files_to_read:
  - "src/pdfService.js"      # PDF 文本提取
  - "src/PdfViewer.jsx"      # PDF 渲染 + TextLayer
  - "src/pdfOutline.js"      # 大纲解析
  - "src/store/documentStore.js" # 文档状态
files_to_create:
  - "src/paragraphExtractor.test.js"
  - "src/paragraphExtractor.js"
  - "src/ThinkingTreePanel.test.jsx"
  - "src/ThinkingTreePanel.jsx"
files_to_modify:
  - "src/pdfService.js"      # 段落级提取
  - "src/PdfViewer.jsx"      # TextLayer 添加 data-paragraph-id
  - "src/App.jsx"            # 集成 ThinkingTreePanel
  - "src/store/documentStore.js" # 存储思维树数据
constraints:
  - "段落分组算法: 按 y 坐标 + hasEOL + 字体变化"
  - "段落 ID: page-{pageNum}-para-{index}"
  - "AI 提示词见 bdd-tdd-nonlinear-reading.md 技术要点"
  - "按章节分批生成，避免超时"
verification:
  - "npm run test 通过"
  - "npm run build 通过"
git:
  - "feat: 段落级非线性思维树"
```

#### 任务 3: 双向锚定（Bidirectional Anchor）

```yaml
task_id: "bidirectional-anchor"
type: "new_feature"
bdd_file: "tasks/bdd-tdd-nonlinear-reading.md 用例 3.1-3.3"
files_to_read:
  - "src/PdfViewer.jsx"       # 页面跳转
  - "src/ThinkingTreePanel.jsx" # 思维树（任务 2 产出）
files_to_create:
  - "src/bidirectionalAnchor.test.js"
  - "src/bidirectionalAnchor.js"
files_to_modify:
  - "src/PdfViewer.jsx"       # goToParagraph + 脉冲高亮
  - "src/ThinkingTreePanel.jsx" # 节点激活状态
constraints:
  - "思维树 → PDF: goToPage + scrollIntoView({behavior: 'smooth'})"
  - "PDF → 思维树: TextLayer 委托点击 + setActiveNode"
  - "跳转延迟 < 300ms"
verification:
  - "npm run test 通过"
  - "npm run build 通过"
git:
  - "feat: 思维树与原文双向锚定"
```

## 代码规范

### 不可变数据
```javascript
// WRONG
user.name = 'new';

// CORRECT
const newUser = { ...user, name: 'new' };
```

### 错误处理
```javascript
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  console.error('Operation failed:', error);
  throw new Error('User-friendly message');
}
```

### 文件大小限制
- 函数: <50 行
- 文件: <800 行
- 超出则提取为独立模块

## 调试技巧

- `npm run test -- --reporter=verbose` — 详细测试输出
- `npm run test -- src/xxx.test.js` — 只跑特定测试
- `npx vitest --ui` — 图形化测试浏览器

## 常见问题

Q: 测试报 `window.matchMedia is not a function`?
A: 已在 `vitest.setup.js` 中 mock，如需扩展请修改该文件。

Q: pdf.js 在测试中报错?
A: 已在 `vitest.config.js` 中配置 `exclude: ['**/e2e/**']`，确保不加载 Playwright 测试。

Q: Ant Design 组件在 jsdom 中渲染异常?
A: 使用 `@testing-library/react` 的 `render`，不要直接 `createRoot`。
