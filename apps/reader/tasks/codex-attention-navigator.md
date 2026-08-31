# Codex 任务：AI 注意力导航仪（Attention Navigator）

> 任务 ID: `attention-navigator`
> 类型: `new_feature`
> BDD 来源: `tasks/bdd-tdd-nonlinear-reading.md` 用例 4.1-4.3
> 优先级: P1
> **依赖**: 任务 2 `thinking-tree` 已完成（paragraphExtractor + 段落级文本）

---

## 项目上下文

- **项目路径**: `/Users/mahaoxuan/Desktop/ai-chat-standalone`
- **技术栈**: Tauri v2 + React 18 + Vite 5 + pdf.js-dist + Ant Design X + Zustand
- **测试框架**: Vitest + @testing-library/react (jsdom)
- **当前测试基线**: 19 文件 / 66 测试全部通过

---

## 任务概述

Vibro 声称 AI 是"注意力导航仪"，但源码中没有实现。VibeReader 可以率先实现：**AI 主动分析论文，标记关键位置**，让用户把注意力分配到真正重要的内容上。

### 核心概念
AI 预分析论文后，输出 3-5 个"关键洞察点"，每个包含：
- **类型**: innovation(创新点) / method(方法亮点) / anomaly(实验反常) / comparison(关键对比)
- **位置**: 页码 + 段落
- **说明**: 一句话解释为什么这个位置重要

在 PDF 阅读器侧边栏显示彩色旗帜标记，点击展开浮动卡片。

---

## BDD 行为用例

### 用例 4.1: AI 预分析标记关键位置
- **Given** 用户打开了一篇 PDF
- **When** 用户点击"AI 分析"按钮
- **Then** AI 输出 3-5 个"关键洞察点"
- **And** 每个洞察点包含：类型、位置（页码+段落）、一句话说明

### 用例 4.2: 阅读器中显示导航标记
- **Given** AI 分析已完成
- **When** 用户查看 PDF 阅读器
- **Then** 关键位置旁边出现小旗帜图标
- **And** 不同类型用不同颜色：
  - 创新点 = 绿色 🟢
  - 方法亮点 = 蓝色 🔵
  - 实验反常 = 橙色 🟠
  - 关键对比 = 紫色 🟣

### 用例 4.3: 点击标记展开解释
- **Given** 阅读器中显示了导航标记
- **When** 用户点击某个标记
- **Then** 弹出浮动卡片显示 AI 的解释
- **And** 提供"深入阅读"和"跳过"两个按钮

---

## 需要读取的文件（按优先级）

### 核心文件（必须读）
1. **`src/pdfService.js`** — PDF 文本提取
2. **`src/PdfViewer.jsx`** — PDF 渲染器，了解 canvas/TextLayer 结构、页码跳转
3. **`src/paragraphExtractor.js`** — 任务 2 产出，了解段落 ID 和位置
4. **`src/store/documentStore.js`** — 文档状态存储
5. **`src/App.jsx`** — 了解面板布局、AI 服务调用

### 辅助文件
6. **`src/aiService.js`** — AI 流式调用接口
7. **`src/SummaryCard.jsx`** — 参考 AI 调用模式
8. **`src/styles.css`** — 添加导航标记样式

---

## 需要创建的文件

### 1. `src/attentionNavigator.js` — 导航仪逻辑

**导出函数**:

```javascript
/**
 * AI 分析关键洞察点
 * @param {string} pdfText - 论文全文
 * @param {Array} paragraphs - 段落列表（任务 2 产出）
 * @param {Function} onProgress - 进度回调
 * @returns {Promise<Array<Insight>>}
 */
export async function analyzeKeyInsights(pdfText, paragraphs, onProgress);

/**
 * 洞察点类型定义
 */
export const INSIGHT_TYPES = {
  INNOVATION: { key: 'innovation', label: '创新点', color: '#52c41a' },
  METHOD:     { key: 'method',     label: '方法亮点', color: '#1890ff' },
  ANOMALY:    { key: 'anomaly',    label: '实验反常', color: '#fa8c16' },
  COMPARISON: { key: 'comparison', label: '关键对比', color: '#722ed1' },
};

/**
 * 根据页码和段落查找段落 ID
 * @param {number} page
 * @param {number} paragraphIndex
 * @param {Array} paragraphs
 * @returns {string | null}
 */
export function findParagraphIdByLocation(page, paragraphIndex, paragraphs);

/**
 * 按页码分组洞察点
 * @param {Array} insights
 * @returns {Map<number, Array<Insight>>}
 */
export function groupInsightsByPage(insights);
```

**AI Prompt 设计**:

```
你是学术阅读助手。请分析以下论文，找出最值得读者关注的位置。

要求：
1. 找出 3-5 个关键洞察点
2. 每个洞察点包含：
   - type: "innovation" | "method" | "anomaly" | "comparison"
   - location: {"page": 1, "paragraph": 2}
   - description: "一句话说明为什么这个位置重要"
3. 输出 JSON 数组，严格格式：
   [
     {"type": "innovation", "location": {"page": 1, "paragraph": 0}, "description": "..."}
   ]

论文内容：
{text}
```

### 2. `src/AttentionNavigatorPanel.jsx` — 导航仪面板

**Props**:
```typescript
interface AttentionNavigatorPanelProps {
  onAskAI?: (question: string) => void;
  onNavigateToParagraph?: (paragraphId: string) => void;
  style?: React.CSSProperties;
}
```

**功能**:
- 显示"AI 分析"按钮
- 分析中显示进度（Spin + 文字）
- 分析后显示洞察点列表
- 每个洞察点显示：类型徽章 + 页码 + 描述摘要
- 点击洞察点 → 跳转到 PDF 对应位置

### 3. `src/AttentionMarkers.jsx` — PDF 标记组件

**Props**:
```typescript
interface AttentionMarkersProps {
  insights: Array<Insight>;
  currentPage: number;
  onMarkerClick: (insight: Insight) => void;
}
```

**功能**:
- 在 PDF 页面侧边栏（右侧）显示旗帜标记
- 按页码过滤：只显示当前页的标记
- 标记位置：根据段落 y 坐标计算，贴在页边
- 不同类型不同颜色

### 4. `src/attentionNavigator.test.js` — TDD 测试

覆盖：
- `analyzeKeyInsights` 返回正确结构
- `findParagraphIdByLocation`
- `groupInsightsByPage`
- 无效输入处理

---

## 需要修改的文件

### 1. `src/PdfViewer.jsx` — 集成标记显示

**修改点**:

A. **添加 AttentionMarkers 组件**:
```jsx
import { AttentionMarkers } from './AttentionMarkers';

// 在页面 canvas 区域内添加标记层
<div style={{ position: 'relative', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
  <canvas ref={canvasRef} />
  <div ref={textLayerRef} />
  <div ref={highlightLayerRef} />
  {/* 新增：注意力导航标记层 */}
  <AttentionMarkers
    insights={insights}
    currentPage={currentPage}
    onMarkerClick={handleInsightClick}
  />
</div>
```

B. **处理标记点击**: 跳转到对应段落
```javascript
const handleInsightClick = useCallback((insight) => {
  // 1. 如果有段落 ID，跳转到段落
  if (insight.paragraphId) {
    goToParagraph(insight.paragraphId);
  } else {
    // 2. 否则只跳转到页
    goToPage(insight.location.page);
  }

  // 3. 触发外部回调（通知 AttentionNavigatorPanel 高亮）
  if (onInsightClick) {
    onInsightClick(insight);
  }
}, [goToParagraph, goToPage, onInsightClick]);
```

### 2. `src/App.jsx` — 添加导航仪 Tab

**修改点**:

A. **新增 Tab**:
```jsx
{ key: 'navigator', label: <span><FlagOutlined /> 导航仪</span> },
```

B. **Tab 内容**:
```jsx
{rightToolTab === 'navigator' && (
  <Suspense fallback={<PanelFallback />}>
    <AttentionNavigatorPanel
      onAskAI={handleAskAI}
      onNavigateToParagraph={handleNavigateToParagraph}
      style={{ flex: 1 }}
    />
  </Suspense>
)}
```

C. **传递洞察点到 PdfViewer**:
```jsx
<PdfViewer
  onInject={handleInjectPdfText}
  documentId={currentDocument?.id}
  insights={documentInsights} // 从 documentStore 获取
  style={{ flex: 1, minHeight: 0 }}
/>
```

### 3. `src/store/documentStore.js` — 存储分析结果

**修改点**:

在 document 结构中添加 `insights`:
```javascript
// document 结构扩展
{
  id: 'doc-id',
  name: 'paper.pdf',
  kind: 'pdf',
  pdfText: '...',
  pdfPages: 10,
  vibeData: {...},
  thinkingTree: {...},
  insights: {
    generatedAt: Date,
    items: [
      {
        id: 'insight-1',
        type: 'innovation',
        location: { page: 3, paragraph: 2 },
        paragraphId: 'page-3-para-2',
        description: '提出了新的注意力机制...',
      }
    ],
  },
}
```

### 4. `src/styles.css` — 导航标记样式

```css
/* ========== Attention Navigator ========== */

.attention-navigator-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--material-sidepane);
}

.attention-navigator-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--fill-quinary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.attention-navigator-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

/* Insight Card */
.insight-card {
  margin-bottom: 12px;
  padding: 12px;
  border-radius: 8px;
  background: var(--material-background);
  border: 1px solid var(--fill-quinary);
  cursor: pointer;
  transition: box-shadow 0.2s, border-color 0.2s;
}

.insight-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border-color: var(--fill-quaternary);
}

.insight-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.insight-type-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: white;
}

.insight-type-innovation { background: #52c41a; }
.insight-type-method     { background: #1890ff; }
.insight-type-anomaly    { background: #fa8c16; }
.insight-type-comparison { background: #722ed1; }

.insight-page {
  font-size: 11px;
  color: var(--fill-tertiary);
}

.insight-description {
  font-size: 13px;
  line-height: 1.5;
  color: var(--fill-secondary);
}

/* PDF Page Markers */
.attention-marker {
  position: absolute;
  right: -28px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
  transition: transform 0.15s;
  z-index: 5;
}

.attention-marker:hover {
  transform: scale(1.2);
}

.attention-marker svg {
  width: 16px;
  height: 16px;
}

/* Floating Card */
.attention-floating-card {
  position: absolute;
  z-index: 100;
  width: 280px;
  padding: 16px;
  background: var(--material-background);
  border: 1px solid var(--fill-quinary);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.attention-floating-card h4 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--fill-primary);
}

.attention-floating-card p {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--fill-secondary);
}

.attention-floating-actions {
  display: flex;
  gap: 8px;
}
```

---

## 约束条件

### 功能约束
1. **AI 分析输出结构化 JSON**: 类型、位置、说明
2. **标记在 PDF 侧边栏或页边显示**: 右侧 `right: -28px`
3. **标记类型有颜色区分**: innovation(绿) / method(蓝) / anomaly(橙) / comparison(紫)
4. **点击标记弹出浮动卡片**: 显示完整描述 + "深入阅读" + "跳过" 按钮
5. **"深入阅读"按钮触发 AI 详细解释**: 调用 `onAskAI`
6. **分析结果缓存**: 存入 documentStore，切换文档不丢失
7. **大文件处理**: >50页先分析前 50 页，后续按需

### 代码约束
1. **不可变数据** — 使用 spread
2. **函数 < 50 行**
3. **不硬编码** — 用常量（如 `MAX_INSIGHTS = 5`, `INSIGHT_TYPES`）
4. **现有测试必须继续通过**

---

## 实现顺序（TDD）

### Phase 1: 核心逻辑
1. 创建 `src/attentionNavigator.test.js`
2. 写测试：解析 AI 输出、按页分组
3. 运行测试，确认失败（RED）
4. 实现 `src/attentionNavigator.js`
5. 运行测试，确认通过（GREEN）

### Phase 2: 导航仪面板
1. 创建 `AttentionNavigatorPanel.jsx`
2. 显示洞察点列表 + 跳转按钮

### Phase 3: PDF 标记
1. 创建 `AttentionMarkers.jsx`
2. 在 PdfViewer 中集成
3. 浮动卡片交互

### Phase 4: 集成
1. 修改 App.jsx 添加 Tab
2. 修改 documentStore 存储 insights
3. 运行全部测试

---

## 关键代码参考

### AI 服务调用（参考 SummaryCard.jsx）
```javascript
await aiService.chatStream(
  prompt,
  ({ done, content, fullMessage }) => {
    if (!done && content) {
      // 流式接收
    }
  },
  { includeHistory: false, systemPrompt: null }
);
```

### 段落位置计算（参考 paragraphExtractor.js）
```javascript
// 段落有 { id, page, y } 属性
// 标记 y 位置 = paragraph.y * scale
```

---

## 验证步骤

### 1. 测试验证
```bash
npm run test -- src/attentionNavigator.test.js
npm run test
```

### 2. 手动验证
1. 打开 PDF，切换到"导航仪"Tab
2. 点击"AI 分析"，等待 5-15 秒
3. 查看洞察点列表，确认有类型徽章 + 页码 + 描述
4. 切换到 PDF 阅读器，查看右侧是否有彩色旗帜
5. 点击旗帜，弹出浮动卡片
6. 点击"深入阅读"，AI 给出详细解释

### 3. 缓存验证
1. 切换到其他文档再切回
2. 洞察点数据仍在，无需重新分析

---

## 提交格式

```bash
git add src/attentionNavigator.js src/attentionNavigator.test.js \
  src/AttentionNavigatorPanel.jsx src/AttentionMarkers.jsx \
  src/PdfViewer.jsx src/App.jsx \
  src/store/documentStore.js src/styles.css

git commit -m "feat: AI 注意力导航仪

- AI 预分析论文，标记 3-5 个关键洞察点
- 结构化输出：类型 + 位置 + 说明
- PDF 页边彩色旗帜标记
- 点击标记弹出浮动卡片
- 深入阅读按钮触发 AI 详细解释
- 分析结果缓存，切换文档不丢失"
```

---

## 注意事项

1. **AI 分析可能耗时较长**（10-30 秒），必须显示进度
2. **JSON 解析可能失败**，需要 fallback 处理
3. **标记位置可能重叠**，需要简单碰撞检测（垂直偏移）
4. **浮动卡片需要点击外部关闭**，参考 Ant Design Popover

---

## 联系 Claude Code

如果遇到以下情况，停下来并告知用户：
1. AI 返回的 JSON 格式不稳定，需要多次调整 prompt
2. 标记位置计算与 PdfViewer 的缩放逻辑冲突
3. 需要修改任务 2 的段落提取逻辑
4. 实现复杂度超出预期（>2小时）
