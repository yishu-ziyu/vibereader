# Codex 任务：双向锚定（Bidirectional Anchor）

> 任务 ID: `bidirectional-anchor`
> 类型: `new_feature`
> BDD 来源: `tasks/bdd-tdd-nonlinear-reading.md` 用例 3.1-3.3
> 优先级: P1
> **依赖**: 任务 2 `thinking-tree` 已完成（ThinkingTreePanel + paragraphExtractor）

---

## 项目上下文

- **项目路径**: `/Users/mahaoxuan/Desktop/ai-chat-standalone`
- **技术栈**: Tauri v2 + React 18 + Vite 5 + pdf.js-dist + Ant Design X + Zustand
- **测试框架**: Vitest + @testing-library/react (jsdom)
- **当前测试基线**: 19 文件 / 66 测试全部通过

---

## 任务概述

思维树和原文之间需要双向映射：
1. **思维树 → PDF**: 点击思维树节点，PDF 跳转到对应段落并高亮
2. **PDF → 思维树**: 点击 PDF 段落，思维树自动展开并定位到对应节点
3. **批注联动**: 段落批注在思维树节点上显示徽章，点击可查看

**前置条件**: `ThinkingTreePanel.jsx` 和 `paragraphExtractor.js` 已实现（任务 2）。

---

## BDD 行为用例

### 用例 3.1: 思维树 → 原文锚定
- **Given** 思维树已生成
- **When** 用户点击思维树中的段落节点
- **Then** PDF 跳转到该段落
- **And** 段落文本被脉冲高亮（fade in/out 两次）

### 用例 3.2: 原文 → 思维树锚定
- **Given** 思维树已生成，用户正在阅读 PDF
- **When** 用户点击 PDF 中的某个段落（或该段落的高亮批注）
- **Then** 思维树自动展开到对应节点
- **And** 该节点被滚动到可视区域并高亮

### 用例 3.3: 批注与思维树联动
- **Given** 用户在段落 A 创建了批注
- **When** 用户在思维树中查看段落 A 的节点
- **Then** 节点上显示批注数量徽章
- **And** 点击徽章可以查看批注内容

---

## 需要读取的文件（按优先级）

### 核心文件（必须读）
1. **`src/ThinkingTreePanel.jsx`** — 任务 2 产出，了解树节点结构、点击事件
2. **`src/PdfViewer.jsx`** — PDF 渲染器，了解页面跳转、TextLayer、高亮逻辑
3. **`src/paragraphExtractor.js`** — 任务 2 产出，了解段落 ID 生成规则
4. **`src/store/documentStore.js`** — 了解文档/思维树/批注存储结构
5. **`src/services/annotationService.js`** — 批注 CRUD（已有）

### 辅助文件
6. **`src/App.jsx`** — 了解左右面板通信方式
7. **`src/styles.css`** — 添加脉冲/高亮样式

---

## 需要创建的文件

### 1. `src/bidirectionalAnchor.js` — 双向锚定逻辑封装

**导出函数**:

```javascript
/**
 * 从段落 ID 解析页码和段落索引
 * @param {string} paragraphId - 如 "page-3-para-2"
 * @returns {{page: number, index: number}}
 */
export function parseParagraphId(paragraphId);

/**
 * 构造段落 ID
 * @param {number} page
 * @param {number} index
 * @returns {string}
 */
export function buildParagraphId(page, index);

/**
 * 查找段落对应的所有 DOM 元素（TextLayer 中的 span）
 * @param {string} paragraphId
 * @returns {NodeListOf<Element>}
 */
export function findParagraphElements(paragraphId);

/**
 * 在 PDF 中脉冲高亮段落文本
 * @param {string} paragraphId
 * @param {object} options - { duration: 3000, pulses: 2 }
 */
export function pulseHighlightParagraph(paragraphId, options);

/**
 * 滚动思维树到指定节点并高亮
 * @param {string} paragraphId
 * @param {HTMLElement} treeContainer - ThinkingTreePanel 容器
 */
export function scrollTreeToNode(paragraphId, treeContainer);

/**
 * 展开思维树到指定节点路径
 * @param {string} paragraphId
 * @param {Function} setExpandedIds - React setState 回调
 * @param {Array} sections - 章节列表
 */
export function expandTreeToParagraph(paragraphId, setExpandedIds, sections);
```

### 2. `src/bidirectionalAnchor.test.js` — TDD 测试

覆盖：
- `parseParagraphId` / `buildParagraphId`
- `pulseHighlightParagraph`（mock DOM）
- `expandTreeToParagraph`
- `findParagraphElements`

---

## 需要修改的文件

### 1. `src/ThinkingTreePanel.jsx` — 添加点击跳转 + 接收激活状态

**修改点**:

A. **节点点击事件**: 点击段落节点时：
```javascript
const handleParagraphClick = useCallback((node) => {
  if (node.type === 'paragraph' && node.paragraphId) {
    // 通知外部跳转
    if (onNavigateToParagraph) {
      onNavigateToParagraph(node.paragraphId);
    }
  }
}, [onNavigateToParagraph]);
```

B. **接收激活段落**: 添加 `activeParagraphId` prop
```javascript
interface ThinkingTreePanelProps {
  // ... 原有 props
  activeParagraphId?: string | null;
}
```

C. **节点高亮样式**: 当 `node.paragraphId === activeParagraphId` 时，添加 `.active` 类

D. **滚动到可视区域**: 使用 `useEffect` 监听 `activeParagraphId` 变化，调用 `scrollIntoView({ behavior: 'smooth', block: 'center' })`

### 2. `src/PdfViewer.jsx` — 添加 goToParagraph + 脉冲高亮

**修改点**:

A. **添加 `goToParagraph` 方法**:
```javascript
const goToParagraph = useCallback((paragraphId) => {
  const { page } = parseParagraphId(paragraphId);
  if (!page) return;

  // 1. 跳转到对应页
  goToPage(page);

  // 2. 等待页面渲染完成后高亮
  requestAnimationFrame(() => {
    pulseHighlightParagraph(paragraphId, { duration: 3000, pulses: 2 });
  });
}, [goToPage]);

// 暴露给父组件
useImperativeHandle(ref, () => ({
  goToParagraph,
}));
```

B. **TextLayer 段落点击事件**: 给 TextLayer 添加 click 事件委托
```javascript
useEffect(() => {
  const textLayer = textLayerRef.current;
  if (!textLayer) return;

  const handleClick = (e) => {
    const target = e.target.closest('[data-paragraph-id]');
    if (!target) return;

    const paragraphId = target.getAttribute('data-paragraph-id');
    // 触发外部回调
    if (onParagraphClick) {
      onParagraphClick(paragraphId);
    }
  };

  textLayer.addEventListener('click', handleClick);
  return () => textLayer.removeEventListener('click', handleClick);
}, [onParagraphClick]);
```

C. **脉冲高亮样式**: 在已有 `highlightLayerRef` 旁边添加脉冲高亮层，或使用 CSS animation

```css
/* 添加到 styles.css */
@keyframes pulse-highlight {
  0%, 100% { background-color: rgba(255, 235, 59, 0); }
  25%, 75% { background-color: rgba(255, 235, 59, 0.5); }
  50% { background-color: rgba(255, 235, 59, 0.2); }
}

.pulse-highlight-active {
  animation: pulse-highlight 1.5s ease-in-out 2;
  border-radius: 2px;
  pointer-events: none;
}
```

D. **脉冲实现方式**: 创建临时高亮 div 覆盖段落区域
```javascript
export function pulseHighlightParagraph(paragraphId, options = {}) {
  const { duration = 3000, pulses = 2 } = options;
  const elements = findParagraphElements(paragraphId);
  if (elements.length === 0) return;

  // 计算整体包围盒
  const rects = Array.from(elements).map(el => el.getBoundingClientRect());
  // 在 highlightLayerRef 上创建脉冲 div
  // ... 详见实现
}
```

### 3. `src/App.jsx` — 桥接双向通信

**修改点**:

A. **ThinkingTreePanel 接收 `onNavigateToParagraph`**:
```javascript
const handleNavigateToParagraph = useCallback((paragraphId) => {
  // 设置 activeParagraphId 供 ThinkingTreePanel 高亮
  setActiveParagraphId(paragraphId);

  // 通知 PdfViewer 跳转
  if (pdfViewerRef.current?.goToParagraph) {
    pdfViewerRef.current.goToParagraph(paragraphId);
  }
}, []);
```

B. **PdfViewer 接收 `onParagraphClick`**:
```javascript
const handleParagraphClick = useCallback((paragraphId) => {
  // 设置 activeParagraphId
  setActiveParagraphId(paragraphId);

  // 如果当前在 thinkingtree tab，滚动到对应节点
  if (rightToolTab === 'thinkingtree') {
    // 通知 ThinkingTreePanel 展开并滚动
    setTreeTargetParagraphId(paragraphId);
  }
}, [rightToolTab]);
```

C. **状态管理**: 在 App 中添加 `activeParagraphId` state
```javascript
const [activeParagraphId, setActiveParagraphId] = useState(null);
```

### 4. `src/ThinkingTreePanel.jsx` — 批注徽章（用例 3.3）

**修改点**:

A. **获取批注数据**: 从 `annotationService` 获取当前文档的批注
```javascript
import { listAnnotationsForDocument } from './services/annotationService';

// 在组件内
const [annotations, setAnnotations] = useState([]);

useEffect(() => {
  if (!documentId) return;
  listAnnotationsForDocument(documentId).then(setAnnotations);
}, [documentId]);
```

B. **段落-批注映射**: 将批注按段落分组（通过 `selectedText` 匹配段落内容）
```javascript
const annotationsByParagraph = useMemo(() => {
  const map = new Map();
  paragraphs.forEach(para => {
    const paraAnnotations = annotations.filter(a =>
      para.text.includes(a.selectedText) ||
      a.selectedText.includes(para.text.slice(0, 50))
    );
    if (paraAnnotations.length > 0) {
      map.set(para.id, paraAnnotations);
    }
  });
  return map;
}, [paragraphs, annotations]);
```

C. **节点徽章**: 在段落节点上显示批注数量
```jsx
{annotationCount > 0 && (
  <span className="thinking-tree-badge">
    {annotationCount}
  </span>
)}
```

D. **点击徽章**: 弹出批注列表
```jsx
<Popover content={<AnnotationList annotations={paraAnnotations} />}>
  <span className="thinking-tree-badge">{annotationCount}</span>
</Popover>
```

### 5. `src/styles.css` — 脉冲 + 徽章样式

```css
/* 脉冲高亮 */
@keyframes pulse-highlight {
  0%, 100% {
    background-color: rgba(255, 235, 59, 0);
    box-shadow: 0 0 0 0 rgba(255, 235, 59, 0.4);
  }
  25%, 75% {
    background-color: rgba(255, 235, 59, 0.5);
    box-shadow: 0 0 0 4px rgba(255, 235, 59, 0.2);
  }
  50% {
    background-color: rgba(255, 235, 59, 0.2);
    box-shadow: 0 0 0 8px rgba(255, 235, 59, 0);
  }
}

.pulse-highlight-overlay {
  position: absolute;
  pointer-events: none;
  z-index: 10;
  border-radius: 3px;
  animation: pulse-highlight 1.5s ease-in-out 2;
}

/* 思维树节点徽章 */
.thinking-tree-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: #ff4d4f;
  color: white;
  font-size: 11px;
  font-weight: 600;
  border-radius: 9px;
  margin-left: 6px;
  cursor: pointer;
}

.thinking-tree-badge:hover {
  background: #ff7875;
}
```

---

## 约束条件

### 功能约束
1. **跳转延迟 < 300ms**: 点击节点到 PDF 显示段落 < 300ms
2. **脉冲高亮**: fade in/out 两次，总时长 3 秒
3. **思维树滚动**: `scrollIntoView({ behavior: 'smooth', block: 'center' })`
4. **段落映射稳定**: `page-{pageNum}-para-{index}` ID 格式不变
5. **批注匹配**: 通过文本内容模糊匹配（因为批注存储时可能没有 paragraphId）

### 代码约束
1. **不可变数据** — 使用 spread
2. **函数 < 50 行**
3. **不硬编码** — 用常量（如 `PULSE_DURATION = 3000`, `PULSE_COUNT = 2`）
4. **现有测试必须继续通过**

---

## 关键代码参考

### PdfViewer 已有高亮层
```jsx
// highlightLayerRef 已存在，用于显示批注高亮
<div
  ref={highlightLayerRef}
  style={{
    position: 'absolute',
    top: 0, left: 0,
    pointerEvents: 'none',
    zIndex: 1,
  }}
/>
```

### annotationService 已有接口
```javascript
import {
  createAnnotation,
  listAnnotationsForDocument
} from './services/annotationService';

// 返回结构: { id, documentId, page, selectedText, note, color, rect }
```

### App 中左右面板结构
```jsx
<section className="workspace-reader-pane">
  <PdfViewer
    onInject={handleInjectPdfText}
    documentId={currentDocument?.id}
  />
</section>

<section className="workspace-ai-pane">
  <ThinkingTreePanel
    onAskAI={handleAskAI}
    onNavigateToParagraph={handleNavigateToParagraph}
    activeParagraphId={activeParagraphId}
  />
</section>
```

---

## 验证步骤

### 1. 测试验证
```bash
npm run test -- src/bidirectionalAnchor.test.js
npm run test
```

### 2. 手动验证
1. 生成思维树
2. 点击思维树段落节点 → PDF 跳转并脉冲高亮（3 秒内 fade in/out 两次）
3. 点击 PDF 文本段落 → 思维树自动展开并滚动到节点
4. 创建批注 → 思维树节点显示红色徽章
5. 点击徽章 → 弹出批注列表

### 3. 性能验证
- 连续点击 10 个不同节点，跳转延迟均 < 300ms
- 脉冲动画不卡顿

---

## 提交格式

```bash
git add src/bidirectionalAnchor.js src/bidirectionalAnchor.test.js \
  src/ThinkingTreePanel.jsx src/PdfViewer.jsx src/App.jsx src/styles.css

git commit -m "feat: 思维树与原文双向锚定

- 思维树 → PDF: 点击节点跳转并脉冲高亮
- PDF → 思维树: 点击段落自动展开并定位节点
- 批注联动: 节点显示批注数量徽章
- 跳转延迟 < 300ms，脉冲动画 3 秒"
```

---

## 注意事项

1. **不要修改任务 2 的测试** — 如果任务 2 的测试与双向锚定冲突，先沟通
2. **段落 ID 必须一致** — 任务 2 中 `extractParagraphsFromPage` 生成的 ID 格式必须与本任务一致
3. **批注匹配是近似的** — 因为旧批注没有 paragraphId，只能通过文本内容模糊匹配
4. **脉冲 div 需要自动清理** — 动画结束后从 DOM 中移除

---

## 联系 Claude Code

如果遇到以下情况，停下来并告知用户：
1. 任务 2 的 `ThinkingTreePanel.jsx` 结构与预期不符
2. 段落 ID 格式不一致
3. 需要修改任务 2 的代码才能继续
4. `PdfViewer` 的 ref 转发方式与现有代码冲突
