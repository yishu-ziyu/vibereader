# Codex 任务：拖拽引用（Drag-to-Inject）

> 任务 ID: `drag-to-inject`
> 类型: `new_feature`
> BDD 来源: `tasks/bdd-tdd-nonlinear-reading.md` 用例 1.1-1.3
> 优先级: P0

---

## 项目上下文

- **项目路径**: `/Users/mahaoxuan/Desktop/ai-chat-standalone`
- **技术栈**: Tauri v2 + React 18 + Vite 5 + pdf.js-dist + Ant Design X + Zustand + Slate
- **测试框架**: Vitest + @testing-library/react (jsdom)
- **当前测试基线**: 19 文件 / 66 测试全部通过

## 任务概述

实现"拖拽引用"功能：用户从左侧面板（PDF 阅读器或文本阅读器）选中文本后，可以直接拖拽到右侧 AI Chat 输入框，自动插入带页码来源的引用格式。

**已有测试文件**: `src/dragInject.test.js` 已存在，包含 3 个测试用例。你的任务是：
1. 先运行测试，确认它们因功能未实现而失败（RED）
2. 编写/修改实现代码使测试通过（GREEN）
3. 确保现有 66 个测试继续通过

---

## 已有测试分析（src/dragInject.test.js）

### 测试 1: `makes selected reader text draggable with source metadata`
- 渲染 `DocumentReader` 组件
- 选中文本内容
- 触发 `dragStart` 事件
- **期望**:
  - `dataTransfer.effectAllowed === 'copy'`
  - `dataTransfer.getData('text/plain')` 为选中文本
  - `dataTransfer.getData('application/x-vibereader-drag-inject')` 为 JSON，包含 `{ text, page }`

### 测试 2: `drops a reader quote on the AI pane without sending it`
- 在 `DocumentReader` 中选中文本
- 构造拖拽数据 `application/x-vibereader-drag-inject`
- 在 `.workspace-ai-pane` 上触发 `dragOver` + `drop`
- **期望**:
  - Slate 编辑器（`[data-slate-editor="true"]`）中出现 `> Important claim [P3]`
  - `messages` 数组保持为空（不自动发送）

### 测试 3: `cancels when the quote is dropped outside the AI pane`
- 在 `ChatInput` 外（document.body）触发 drop
- **期望**:
  - 编辑器内容不包含引用文本
  - `onSubmit` 未被调用

### 测试中的常量
```javascript
const DRAG_INJECT_MIME = 'application/x-vibereader-drag-inject';
```

---

## 需要读取的文件（按优先级）

### 核心文件（必须读）
1. **`src/dragInject.test.js`** — 已有测试，理解期望行为
2. **`src/DocumentReader.jsx`** — 文本阅读器，需要添加 `dragstart`
3. **`src/PdfViewer.jsx`** — PDF 阅读器，需要添加 `dragstart`
4. **`src/ChatInput.jsx`** — AI 输入框（Slate 编辑器），需要添加 `drop` 处理
5. **`src/App.jsx`** — 工作台布局，AI pane 需要 `dragover`/`drop`
6. **`src/styles.css`** — 添加拖拽视觉反馈样式

### 辅助文件（按需读取）
- **`src/store/documentStore.js`** — 文档状态（了解 `currentDocument` 结构）
- **`src/store/pdfStore.js`** — PDF 状态（了解 `currentPage`）
- **`src/i18n.js`** — 如需添加翻译键

---

## 需要创建的文件

### `src/dragInject.js` — 拖拽逻辑封装

这是一个纯工具模块，应该导出：

```javascript
// MIME 类型常量
export const DRAG_INJECT_MIME = 'application/x-vibereader-drag-inject';

/**
 * 构造拖拽数据
 * @param {string} text - 选中的文本
 * @param {number} page - 页码（PDF）或 1（文本）
 * @returns {string} JSON 字符串
 */
export function createDragPayload(text, page);

/**
 * 从 DataTransfer 解析拖拽数据
 * @param {DataTransfer} dataTransfer
 * @returns {{text: string, page: number} | null}
 */
export function parseDragPayload(dataTransfer);

/**
 * 格式化引用文本
 * @param {string} text
 * @param {number} page
 * @returns {string} 如 "> 引用文本 [P3]"
 */
export function formatQuote(text, page);

/**
 * 检查拖拽事件是否包含有效的引用数据
 * @param {DataTransfer} dataTransfer
 * @returns {boolean}
 */
export function hasDragInjectData(dataTransfer);
```

---

## 需要修改的文件

### 1. `src/DocumentReader.jsx` — 添加 dragstart

当前 `DocumentReader` 已有一个悬浮的"注入 AI"按钮（`.document-reader-inject`）。需要在选中文本时，让内容区域支持拖拽。

**修改点**:
- 给内容容器（`.document-reader-scroll` 或其内部元素）添加 `draggable="true"`
- 在 `dragstart` 事件中：
  - 获取当前选中文本
  - `dataTransfer.setData('text/plain', text)`
  - `dataTransfer.setData(DRAG_INJECT_MIME, createDragPayload(text, 1))`
  - `dataTransfer.effectAllowed = 'copy'`

**注意**: DocumentReader 没有真实页码概念，page 固定为 1。

### 2. `src/PdfViewer.jsx` — 添加 dragstart

PDF 阅读器的文本选区逻辑更复杂。当前在 `selection` state 中已包含 `{ text, x, y, rect }`。

**修改点**:
- 给 `textLayerRef` 或选中文本添加拖拽支持
- 在 `dragstart` 事件中：
  - 获取当前选中文本
  - `dataTransfer.setData('text/plain', text)`
  - `dataTransfer.setData(DRAG_INJECT_MIME, createDragPayload(text, currentPage))`
  - `dataTransfer.effectAllowed = 'copy'`

**注意**: PDF 的 `currentPage` 在 state 中可用。

### 3. `src/ChatInput.jsx` — 添加 drop 处理

ChatInput 使用 Slate 编辑器（`slate-react`）。需要在最外层容器（`.slate-sender-container`）添加 `onDrop` 和 `onDragOver` 处理。

**修改点**:
- 添加 `onDragOver` handler：
  - 检查 `hasDragInjectData(dataTransfer)`
  - 如果是，调用 `e.preventDefault()` 并设置 `e.dataTransfer.dropEffect = 'copy'`
- 添加 `onDrop` handler：
  - 调用 `e.preventDefault()`
  - 解析拖拽数据：`parseDragPayload(e.dataTransfer)`
  - 如果有有效数据：
    - 用 `formatQuote(text, page)` 生成格式化文本
    - 用 Slate API `Transforms.insertText(editor, formattedQuote)` 插入到编辑器
    - **不要**调用 `onSubmit`
  - 如果拖拽数据无效，不做任何事

**Slate API 参考**:
```javascript
import { Transforms } from 'slate';
// 在当前光标位置插入文本
Transforms.insertText(editor, '> 引用文本 [P3]\n\n');
```

### 4. `src/App.jsx` — AI pane 添加 dragover/drop

测试 2 期望在 `.workspace-ai-pane` 上 drop。但 `ChatInput` 本身就在 AI pane 内。需要确保整个 AI pane 都能接收 drop，而不只是 ChatInput。

**方案 A**（推荐）: 在 `ChatInput` 上处理即可，因为 drop 事件会冒泡。但测试中明确在 `.workspace-ai-pane` 上触发 drop，所以 `ChatInput` 需要接收并正确处理。

**方案 B**: 在 `.workspace-ai-pane` 容器上也添加 `onDragOver`/`onDrop`，转发到 ChatInput 的编辑器。

考虑到测试是在 `.workspace-ai-pane` 上触发事件，可能需要在 `App.jsx` 中给 `workspace-ai-pane` 添加事件处理，或者确保事件冒泡到 ChatInput。

### 5. `src/styles.css` — 拖拽视觉反馈

添加以下样式：

```css
/* 拖拽时给 AI pane 添加视觉反馈 */
.workspace-ai-pane.drag-over {
  background: rgba(24, 144, 255, 0.05);
  border: 2px dashed var(--accent-blue);
  border-radius: 8px;
}

/* 拖拽过程中的半透明遮罩 */
.workspace-ai-pane.drag-over::after {
  content: 'Drop here to inject';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 12px 24px;
  background: rgba(24, 144, 255, 0.9);
  color: white;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  pointer-events: none;
  z-index: 100;
}
```

---

## 约束条件

### 功能约束
1. **使用 HTML5 Drag and Drop API** — 不引入第三方拖拽库
2. **拖拽数据格式**:
   - `text/plain`: 纯文本内容（浏览器默认行为）
   - `application/x-vibereader-drag-inject`: JSON `{ text, page }`
3. **注入格式**: `> 引用文本 [P{页码}]`
   - 如果文本超过 200 字符，截断为前 200 字符 + "..."
4. **视觉反馈**: 拖拽到 AI pane 时显示半透明遮罩 + "Drop here to inject" 提示
5. **不自动发送**: drop 后只插入输入框，不触发 `onSubmit`

### 代码约束
1. **不可变数据** — 使用 spread，不 mutate
2. **函数 < 50 行** — 大函数拆分为小函数
3. **不硬编码** — 用常量（如 `DRAG_INJECT_MIME`, `MAX_QUOTE_LENGTH`）
4. **现有测试必须继续通过** — `npm run test` 全部通过
5. **不修改已有测试** — 除非测试本身有 bug

### 实现顺序（TDD）
1. **RED**: 运行 `npm run test -- src/dragInject.test.js`，确认 3 个测试失败
2. **GREEN**: 实现 `src/dragInject.js`，修改相关组件
3. **VERIFY**: 运行 `npm run test` 确认全部通过（含新增 + 原有）
4. **BUILD**: 运行 `npm run build` 确认构建通过

---

## 关键代码参考

### DocumentReader 当前结构
```jsx
<div className="document-reader" style={style}>
  <div ref={containerRef} className="document-reader-scroll">
    {/* markdown / html / text 内容 */}
  </div>
  {selection && (
    <Button className="document-reader-inject" onClick={handleInject}>
      注入 AI
    </Button>
  )}
</div>
```

### PdfViewer 当前结构
```jsx
<div ref={containerRef} style={{ ... }}>
  {/* Toolbar */}
  {/* Page canvas with textLayerRef and highlightLayerRef */}
  <PdfAnnotationToolbar selection={...} onInject={...} />
</div>
```

### ChatInput Slate 结构
```jsx
<div className="slate-sender-container">
  <Slate editor={editor} initialValue={value} onChange={handleChange}>
    <Editable
      renderLeaf={renderLeaf}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      placeholder={...}
    />
  </Slate>
</div>
```

---

## 验证步骤

### 1. 测试验证
```bash
# 只跑新增测试
npm run test -- src/dragInject.test.js

# 跑全部测试
npm run test

# 详细输出
npm run test -- --reporter=verbose
```

**期望结果**:
- `src/dragInject.test.js`: 3/3 通过
- 全部测试: 原有 66 个 + 新增 3 个 = 69 个全部通过

### 2. 构建验证
```bash
npm run build
```

**期望结果**: 构建成功，无错误

### 3. 手动验证（可选，在浏览器中）
1. 打开应用，加载一个文本文件
2. 选中文本，按住拖拽到右侧 AI 面板
3. 释放后，输入框中出现 `> 引用文本 [P1]`
4. 可以继续打字追加问题
5. 在非 AI 面板区域释放，无任何效果

---

## 提交格式

完成后提交：
```bash
git add src/dragInject.js src/dragInject.test.js src/DocumentReader.jsx src/PdfViewer.jsx src/ChatInput.jsx src/App.jsx src/styles.css
git commit -m "feat: 拖拽引用交互（Drag-to-Inject）

- 支持从 PDF/Text 阅读器拖拽选中文本到 AI Chat
- 拖拽数据格式: text/plain + application/x-vibereader-drag-inject
- 注入格式: '> 引用文本 [P{页码}]'
- 视觉反馈: 半透明遮罩 + 'Drop here to inject' 提示
- 3 个单元测试全部通过"
```

---

## 常见问题

### Q: 测试报 `window.matchMedia is not a function`?
A: 已在 `vitest.setup.js` 中 mock，无需处理。

### Q: Slate 编辑器在测试中如何操作？
A: 测试中使用了 `@testing-library/react` 的 `render`。Slate 编辑器渲染后会有 `[data-slate-editor="true"]` 属性，用 `document.querySelector` 获取即可。

### Q: `dataTransfer` 在 jsdom 中如何 mock？
A: 测试中已有 `createDataTransfer` 辅助函数，参考其实现。

### Q: PDF 的 dragstart 在 TextLayer 的 span 元素上触发？
A: 可以在 `textLayerRef` 上监听 `dragstart` 事件（事件委托），或者给选中的文本添加 `draggable` 属性。注意 TextLayer 的 span 是动态生成的。

---

## 联系 Claude Code

如果遇到以下情况，停下来并告知用户：
1. 测试文件本身有 bug（非功能缺失导致的失败）
2. 需要修改已有测试才能通过
3. 与现有代码风格产生严重冲突
4. 实现复杂度超出预期（>2小时）

**不要**: 猜测需求、添加未要求的功能、修改已有测试来适应实现。
