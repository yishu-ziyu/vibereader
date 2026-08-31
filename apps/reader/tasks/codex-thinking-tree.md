# Codex 任务：段落级非线性思维树（True Thinking Tree）

> 任务 ID: `thinking-tree`
> 类型: `new_feature`
> BDD 来源: `tasks/bdd-tdd-nonlinear-reading.md` 用例 2.1-2.3
> 优先级: P0

---

## 项目上下文

- **项目路径**: `/Users/mahaoxuan/Desktop/ai-chat-standalone`
- **技术栈**: Tauri v2 + React 18 + Vite 5 + pdf.js-dist + Ant Design X + Zustand + Slate
- **测试框架**: Vitest + @testing-library/react (jsdom)
- **当前测试基线**: 19 文件 / 66 测试全部通过

---

## 任务概述

当前 `MindMap` 组件只是"章节标题树"，没有内容解构。真正的思维树需要对**每个段落**生成一句话摘要，形成可展开/折叠的层级结构。

### 当前状态
- `MindMap.jsx`（~350行）：基于 `extractSections()` 生成章节标题树，节点是 `root → level1(section标题) → level2(假节点)`，没有真实内容
- `vibeParser.js`：`parseVibe()` 提取章节 + keyPoints（每章3句），但没有段落级粒度
- `SummaryPanel.jsx` + `SummaryCard.jsx`：手动点击"Generate Summary"逐章生成 AI 摘要

### 目标状态
- 新增 `ThinkingTreePanel.jsx` 替换/扩展 MindMap Tab
- 从 PDF 提取**段落级**文本（按 y 坐标 + hasEOL + 字体变化分组）
- 对每个段落生成 ≤50 字的一句话核心摘要
- 树状结构：论文标题 → 章节 → 段落摘要 → 要点
- 支持展开/折叠、点击跳转原文、进度指示器
- 大文件（>50页）按章节分批生成

---

## BDD 行为用例

### 用例 2.1: 生成段落级思维树
- **Given** 用户打开了一篇 PDF 论文
- **When** 用户点击"生成思维树"按钮
- **Then** AI 对论文每个段落生成一句话摘要
- **And** 树状结构展示：论文标题 → 章节 → 段落摘要 → 要点

### 用例 2.2: 展开/折叠节点
- **Given** 思维树已生成
- **When** 用户点击某个章节节点的展开/折叠按钮
- **Then** 该章节下的段落摘要展开或折叠

### 用例 2.3: 点击节点跳转原文
- **Given** 思维树已生成
- **When** 用户点击某个段落摘要节点
- **Then** PDF 阅读器滚动到该段落所在位置
- **And** 该段落文本被临时高亮（3 秒后消失）

---

## 需要读取的文件（按优先级）

### 核心文件（必须读）
1. **`src/pdfService.js`** — PDF 文本提取服务，当前使用 `page.getTextContent()` 提取文本块
2. **`src/PdfViewer.jsx`** — PDF 渲染器，有 `textLayerRef`、`currentPage`、TextLayer span 生成逻辑
3. **`src/vibeParser.js`** — 当前 VIBE 解析器，了解 `parseVibe()`、`parseSections()` 输出格式
4. **`src/store/vibeStore.js`** — VIBE 状态管理，了解 `vibeData` 结构
5. **`src/store/documentStore.js`** — 文档状态，了解 `currentDocument` 结构
6. **`src/MindMap.jsx`** — 当前思维导图实现，了解 SVG 树布局逻辑
7. **`src/App.jsx`** — 了解 Tab 集成方式（`rightToolTab='mindmap'`）

### 辅助文件
8. **`src/SummaryPanel.jsx`** — 了解 Summary Card 的列表/展开模式
9. **`src/SummaryCard.jsx`** — 了解 AI 流式生成摘要的调用模式
10. **`src/pdfOutline.js`** — 了解 PDF 大纲结构（如有用）
11. **`src/styles.css`** — 添加思维树样式

---

## 需要创建的文件

### 1. `src/paragraphExtractor.js` — 段落级文本提取

**职责**: 从 pdf.js 的 `textContent.items` 中提取段落。

**核心算法**（pdf.js textContent.items 结构）：
```typescript
interface TextItem {
  str: string;
  dir: string;
  width: number;
  height: number;
  transform: number[]; // [a,b,c,d,e,f] - e=x, f=y
  fontName: string;
  hasEOL: boolean; // 行尾标记
}
```

**段落分组规则**:
1. 按 `transform[5]`（y 坐标）排序
2. 同一行内的 items 按 `transform[4]`（x 坐标）排序合并
3. 段落边界判定（满足任一即分段）：
   - `hasEOL === true` 且下一行 y 坐标差 > `lineHeight * 1.5`（空行）
   - 字体变化（`fontName` 改变且字号差异 > 2pt）
   - 缩进变化（x 坐标突然增大 > `emWidth * 2`）
4. 每个段落生成唯一 ID: `page-{pageNum}-para-{index}`

**导出函数**:
```javascript
/**
 * 从单页 textContent 提取段落
 * @param {object} textContent - pdf.js getTextContent() 结果
 * @param {number} pageNum - 页码
 * @returns {Array<{id, text, page, y, fontName, fontSize}>}
 */
export function extractParagraphsFromPage(textContent, pageNum);

/**
 * 从完整 PDF 提取所有段落
 * @param {PDFDocumentProxy} pdfDoc - pdf.js 文档对象
 * @param {Function} onProgress - (current, total) => void
 * @returns {Promise<Array<{id, text, page, y}>>}
 */
export async function extractAllParagraphs(pdfDoc, onProgress);

/**
 * 按章节分组段落（复用 vibeParser 的章节检测）
 * @param {Array} paragraphs - 段落列表
 * @param {Array} sections - vibeParser 解析的章节列表
 * @returns {Array<{sectionId, title, paragraphs: [...]}>}
 */
export function groupParagraphsBySection(paragraphs, sections);
```

### 2. `src/paragraphExtractor.test.js` — TDD 测试

至少覆盖：
- `extractParagraphsFromPage`: 简单文本、多段落、hasEOL 分段
- `groupParagraphsBySection`: 段落分配到正确章节
- 空内容/边界情况

### 3. `src/ThinkingTreePanel.jsx` — 思维树面板组件

**Props**:
```typescript
interface ThinkingTreePanelProps {
  onAskAI?: (question: string) => void;
  onNavigateToParagraph?: (paragraphId: string) => void;
  style?: React.CSSProperties;
}
```

**功能**:
- 从 `usePdfStore` 获取 `pdfText`, `pdfPages`, `pdfFile`
- 从 `useVibeStore` 获取 `vibeData`
- 如果思维树未生成，显示"生成思维树"按钮
- 生成中显示进度条/Spin
- 生成后显示树状结构

**树节点类型**:
```typescript
interface TreeNode {
  id: string;
  type: 'root' | 'section' | 'paragraph' | 'point';
  label: string;
  page?: number;
  paragraphId?: string;
  expanded?: boolean;
  children?: TreeNode[];
}
```

### 4. `src/ThinkingTreePanel.test.jsx` — TDD 测试

覆盖：
- 未生成状态显示按钮
- 点击按钮触发生成
- 生成后显示树结构
- 点击节点触发 `onNavigateToParagraph`
- 展开/折叠切换

---

## 需要修改的文件

### 1. `src/pdfService.js` — 添加段落级提取

**修改点**:
- 在 `extractTextFromPDF` 中，除了提取全文，同时提取段落信息
- 或在 `PdfViewer.jsx` 渲染时提取段落并存储

**方案**（推荐）:
- 在 `PdfViewer.jsx` 的渲染 effect 中，当获取 `textContent` 后，调用 `extractParagraphsFromPage(textContent, currentPage)`
- 将段落数据存入新的 `paragraphStore` 或 `documentStore`

### 2. `src/PdfViewer.jsx` — TextLayer 添加 data-paragraph-id

**修改点**:
- 渲染 TextLayer span 时，根据段落归属给每个 span 添加 `data-paragraph-id` 属性
- 这样点击 TextLayer 可以定位到段落

```javascript
// 在 textItems.forEach 循环中
textItems.forEach((item) => {
  const paragraphId = findParagraphForItem(item, paragraphs);
  el.setAttribute('data-paragraph-id', paragraphId);
  // ... 原有样式设置
});
```

### 3. `src/App.jsx` — 集成 ThinkingTreePanel

**修改点**:
- 新增 Tab: `thinkingtree`，替换或并存于 `mindmap`
- 如果替换：`mindmap` Tab 改为 `thinkingtree`
- 如果并存：添加新 Tab

```jsx
// 推荐：替换 mindmap Tab（因为 MindMap 是假实现）
{ key: 'thinkingtree', label: <span><BranchesOutlined /> 思维树</span> },
```

- 在 Tab 内容区渲染 `ThinkingTreePanel`
- 传递 `onNavigateToParagraph` 回调

### 4. `src/store/documentStore.js` — 存储思维树数据

**修改点**:
- 添加 `thinkingTree` 字段到 document 对象
- 添加 actions: `setThinkingTree`, `getThinkingTree`
- 按 `documentId` 隔离数据

```javascript
// document 结构扩展
{
  id: 'doc-id',
  name: 'paper.pdf',
  kind: 'pdf',
  pdfText: '...',
  pdfPages: 10,
  vibeData: {...},
  thinkingTree: {
    generatedAt: Date,
    sections: [...],
    paragraphs: [...],
  },
}
```

### 5. `src/styles.css` — 思维树样式

添加：
```css
/* Thinking Tree Panel */
.thinking-tree-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--material-sidepane);
}

.thinking-tree-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--fill-quinary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.thinking-tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

/* Tree Node */
.thinking-tree-node {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.thinking-tree-node:hover {
  background: var(--fill-quinary);
}

.thinking-tree-node.active {
  background: rgba(24, 144, 255, 0.1);
  border-left: 2px solid var(--accent-blue);
}

.thinking-tree-node-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--fill-tertiary);
}

.thinking-tree-node-content {
  flex: 1;
  min-width: 0;
}

.thinking-tree-node-label {
  font-size: 13px;
  line-height: 1.5;
  color: var(--fill-primary);
}

.thinking-tree-node-meta {
  font-size: 11px;
  color: var(--fill-tertiary);
  margin-top: 2px;
}

/* Paragraph summary node */
.thinking-tree-node-paragraph .thinking-tree-node-label {
  font-size: 12px;
  color: var(--fill-secondary);
}

/* Section node */
.thinking-tree-node-section .thinking-tree-node-label {
  font-weight: 600;
  font-size: 14px;
}

/* Children container */
.thinking-tree-children {
  margin-left: 20px;
  border-left: 1px solid var(--fill-quinary);
  padding-left: 8px;
}

/* Pulse highlight on PDF text */
@keyframes paragraph-pulse {
  0%, 100% { background-color: rgba(255, 235, 59, 0); }
  50% { background-color: rgba(255, 235, 59, 0.4); }
}

.paragraph-pulse-highlight {
  animation: paragraph-pulse 1s ease-in-out 3;
  border-radius: 2px;
}

/* Progress bar */
.thinking-tree-progress {
  padding: 16px;
  text-align: center;
}

.thinking-tree-progress-bar {
  height: 4px;
  background: var(--fill-quinary);
  border-radius: 2px;
  overflow: hidden;
  margin: 12px 0;
}

.thinking-tree-progress-fill {
  height: 100%;
  background: var(--accent-blue);
  border-radius: 2px;
  transition: width 0.3s ease;
}
```

---

## AI 提示词设计

### 段落摘要生成提示词

```
你是学术阅读助手。请对以下论文段落生成结构化摘要。

要求：
1. 对每个段落生成一句话核心摘要（≤50字）
2. 识别段落类型：background/method/experiment/result/discussion/other
3. 提取3-5个关键要点（每点≤20字）
4. 输出 JSON 格式：
   {
     "paragraphs": [
       {
         "id": "page-1-para-0",
         "summary": "摘要",
         "type": "method",
         "points": ["要点1", "要点2"]
       }
     ]
   }
```

### 分批生成策略

- 每批最多 5 个段落（避免 prompt 过长）
- 按章节分批：先生成第一章所有段落，再下一章
- 每批之间延迟 500ms（避免触发速率限制）
- 使用 `aiService.chatStream()` 流式调用

---

## 约束条件

### 功能约束
1. **段落 ID 格式**: `page-{pageNum}-para-{index}`（从0开始）
2. **摘要长度**: ≤50 字/段落
3. **要点数量**: 3-5 个/段落
4. **段落分组算法**: 按 y 坐标 + hasEOL + 字体变化（不硬编码）
5. **进度显示**: 章节级进度（如"正在生成 Methods 章节... 3/5"）
6. **大文件处理**: >50页按章节分批，每批间隔 500ms
7. **数据持久化**: 思维树数据存入 `documentStore`，切换文档不丢失

### 代码约束
1. **不可变数据** — 使用 spread，不 mutate
2. **函数 < 50 行** — 大函数拆分
3. **不硬编码** — 用常量（如 `BATCH_SIZE = 5`, `PARAGRAPH_SUMMARY_MAX_LEN = 50`）
4. **现有测试必须继续通过** — `npm run test` 全部通过
5. **文件 < 800 行** — 超出则提取为独立模块

---

## 实现顺序（TDD）

### Phase 1: 段落提取（纯函数，无 UI）
1. 创建 `src/paragraphExtractor.test.js`
2. 写测试：期望 `extractParagraphsFromPage` 返回正确段落
3. 运行测试，确认失败（RED）
4. 实现 `src/paragraphExtractor.js`
5. 运行测试，确认通过（GREEN）

### Phase 2: 思维树面板（UI + 交互）
1. 创建 `src/ThinkingTreePanel.test.jsx`
2. 写测试：渲染、点击、展开/折叠
3. 运行测试，确认失败（RED）
4. 实现 `src/ThinkingTreePanel.jsx`
5. 运行测试，确认通过（GREEN）

### Phase 3: 集成
1. 修改 `App.jsx` 添加 Tab
2. 修改 `PdfViewer.jsx` 添加 `data-paragraph-id`
3. 修改 `documentStore.js` 存储思维树数据
4. 运行全部测试

---

## 关键代码参考

### PdfViewer textContent 结构（已有代码）
```javascript
const textContent = await page.getTextContent();
const textItems = textContent.items;

textItems.forEach((item) => {
  const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
  // tx[4] = x, tx[5] = y
  // item.str = 文本
  // item.hasEOL = 是否行尾
  // item.fontName = 字体名
});
```

### vibeData 结构（已有）
```javascript
{
  title: 'Paper Title',
  abstract: '...',
  sections: [
    {
      id: 'sec_xxx',
      title: 'Introduction',
      level: 1,
      pageStart: 1,
      pageEnd: 2,
      content: '...',
      keyPoints: ['...', '...'],
      entities: [...],
    }
  ],
  figures: [...],
  tables: [...],
}
```

### AI 服务调用模式（参考 SummaryCard.jsx）
```javascript
import aiService from './aiService';

await aiService.chatStream(
  prompt,
  ({ done, content, fullMessage }) => {
    if (!done && content) {
      // 流式更新
    }
  },
  { includeHistory: false, systemPrompt: null }
);
```

---

## 验证步骤

### 1. 测试验证
```bash
# 段落提取测试
npm run test -- src/paragraphExtractor.test.js

# 思维树面板测试
npm run test -- src/ThinkingTreePanel.test.jsx

# 全部测试
npm run test
```

**期望结果**: 原有 66 个 + 新增测试全部通过

### 2. 构建验证
```bash
npm run build
```

### 3. 手动验证
1. 打开 PDF 文件
2. 切换到"思维树"Tab
3. 点击"生成思维树"
4. 观察进度条变化
5. 生成后查看树状结构
6. 点击章节展开/折叠
7. 点击段落节点，PDF 跳转并高亮

---

## 提交格式

```bash
git add src/paragraphExtractor.js src/paragraphExtractor.test.js \
  src/ThinkingTreePanel.jsx src/ThinkingTreePanel.test.jsx \
  src/pdfService.js src/PdfViewer.jsx src/App.jsx \
  src/store/documentStore.js src/styles.css

git commit -m "feat: 段落级非线性思维树

- 段落提取算法：按 y 坐标 + hasEOL + 字体变化分组
- 段落 ID: page-{pageNum}-para-{index}
- AI 对每个段落生成 ≤50 字摘要
- 树状结构：论文标题 → 章节 → 段落摘要 → 要点
- 支持展开/折叠、点击跳转原文
- 大文件分批生成，带进度指示器
- 数据持久化到 documentStore"
```

---

## 常见问题

### Q: 段落提取和 pdf.js textLayer 渲染有冲突？
A: 段落提取在 `pdfService.js` 或 `PdfViewer.jsx` 渲染时进行，TextLayer 渲染时只需给 span 添加 `data-paragraph-id`。提取逻辑和渲染逻辑是独立的。

### Q: AI 生成太慢怎么办？
A: 使用分批生成 + 进度条。每批 5 个段落，间隔 500ms。用户可以看到实时进度。

### Q: 如何确保段落 ID 在 PDF → 思维树 → PDF 之间一致？
A: ID 格式 `page-{pageNum}-para-{index}` 中 `index` 是按 y 坐标排序后的顺序。提取和渲染使用同一算法即可保证一致。

### Q: 段落摘要需要调用多少次 AI？
A: 按段落数量 / 5 向上取整。一篇 20 段论文需要 4 次调用。可在 UI 上显示"预计需要 X 秒"。

---

## 联系 Claude Code

如果遇到以下情况，停下来并告知用户：
1. pdf.js textContent 结构与前述不符
2. AI 调用模式与 SummaryCard.jsx 中的不一致
3. 段落提取算法复杂度超出预期
4. 与现有 vibeData 结构产生严重冲突

**不要**: 添加未要求的可视化效果、修改已有测试、引入新依赖。
