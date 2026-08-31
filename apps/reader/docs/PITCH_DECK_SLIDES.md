---
marp: true
theme: default
class: invert
paginate: true
backgroundColor: #0d1117
color: #e6edf3
style: |
  section {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 28px;
    padding: 40px 60px;
  }
  h1 {
    font-size: 52px;
    color: #58a6ff;
    margin-bottom: 0.3em;
  }
  h2 {
    font-size: 38px;
    color: #79c0ff;
    margin-top: 0;
  }
  h3 {
    font-size: 32px;
    color: #ffa657;
  }
  ul {
    line-height: 1.6;
  }
  li {
    margin-bottom: 0.4em;
  }
  table {
    font-size: 22px;
    width: 100%;
  }
  th {
    background: #161b22;
    color: #58a6ff;
  }
  td {
    border-bottom: 1px solid #30363d;
  }
  .highlight {
    color: #3fb950;
    font-weight: bold;
  }
  .accent {
    color: #f0883e;
    font-weight: bold;
  }
  .dim {
    color: #8b949e;
  }
  blockquote {
    border-left: 4px solid #58a6ff;
    padding-left: 1em;
    color: #c9d1d9;
    font-style: italic;
  }
---

<!-- _class: lead -->

# VibeReader

## 你的 AI 阅读实验室

**从"读完即忘"到"读有所成"**

本地优先的学术阅读 Agent，让每一篇论文都变成你的知识资产

---

## Slide 2: 痛点故事

**场景：研一学生小林，周五导师丢了 10 篇论文，下周一要汇报**

### 5 大崩溃时刻

1. 满屏公式，看了 3 遍不懂在推什么
2. 专业术语堆积，每段查 10 个词
3. 方法部分读了 N 遍，实验设计还是云里雾里
4. 读完一篇忘一篇，笔记散落在 5 个软件里
5. 想对比多篇观点，在 10 个标签页切到崩溃

### 数据支撑

- 全球 **2000 万+** 科研人员
- 年均阅读 **200+** 篇论文
- <span class="accent">80%</span> 的阅读时间浪费在"理解"而非"思考"

---

## Slide 3: 现有方案为什么不行

| 产品 | 模式 | 问题 |
|------|------|------|
| ChatPDF | 上传 → 问 → 得到答案 | 一次性消费，看完即走 |
| SciSpace | 在线阅读 + AI 辅助 | 论文上传云端，隐私风险 |
| Zotero | 文献管理 + 阅读 | 没有 AI，阅读体验停留在 2010 |

### 核心矛盾

> 现有工具帮你"读完"论文，但没有帮你"读懂"和"记住"论文。

---

## Slide 4: 解决方案

### 核心理念：从"论文消费者"到"知识生产者"

### 三层架构

1. **阅读层**：PDF + Markdown + HTML + Text 通用阅读器
   - <span class="highlight">本地渲染，零上传</span>

2. **AI 层**：多模型路由（Kimi / MiniMax / Claude / OpenAI）
   - 选中文本即问即答

3. **学习层**：结构化摘要 → 闪卡 → 思维导图
   - <span class="highlight">读完带走一套学习资料</span>

### 差异化关键词

<span class="accent">本地优先 · 多格式 · 学习闭环</span>

---

<!-- _class: lead -->

## Slide 5: 产品演示 —— 黄金 30 秒

| 时间 | 动作 | 台词 |
|------|------|------|
| 0-5s | 打开 VibeReader | "打开应用，零配置，零等待" |
| 5-10s | 自动加载示例论文 | "示例论文已就绪，左侧阅读，右侧 AI" |
| 10-15s | 划选 Introduction | "看到不懂的地方，直接划选" |
| 15-20s | 点击"注入 AI" | "一键注入上下文" |
| 20-25s | AI 秒回解释 | "AI 基于论文内容给出精准解释" |
| 25-30s | 生成结构化摘要 | "不只是聊天，AI 主动帮你分析论文结构" |

---

## Slide 6: 核心功能矩阵

| 功能 | 演示点 | 价值 |
|------|--------|------|
| 通用阅读器 | PDF / Markdown / HTML / Text | 一个工具读所有 |
| 悬浮批注 | 选中文本 → 高亮 / 笔记 | 阅读痕迹可视化 |
| 大纲导航 | 点击 Methods 跳转第 2 页 | 长论文不再迷路 |
| 多模型 AI | MiniMax M3 真实配置 | 自有模型服务可控 |
| 结构化摘要 | AI 自动提取 IMRAD 结构 | 3 分钟把握全文 |
| 闪卡系统 | 一键生成 Q&A 卡片 | 读完还能记住 |
| 思维导图 | 可视化论文结构 | 知识结构化 |

---

## Slide 7: 技术亮点

### 技术栈

- **Tauri v2 + React 18 + Vite 5** → 桌面应用 5MB 体积
- **pdf.js 本地渲染** → 零上传，隐私保护
- **多模型流式路由** → 兼容 OpenAI / Anthropic / 国产模型
- **Zustand 状态管理** → 8 个独立 Store，状态完全隔离

### 技术效率

- 首屏加载 <span class="highlight">458KB</span>（代码分割优化，从 2.29MB 降至 458KB）
- Tauri 原生 HTTP → 生产环境<span class="highlight">零 CORS 问题</span>
- 66 个单元测试 + 20 个 E2E 测试 → <span class="highlight">全自动化 QA</span>

---

## Slide 8: 竞品对比

| 维度 | ChatPDF | SciSpace | <span class="highlight">VibeReader</span> |
|------|---------|----------|------------|
| 本地渲染 | ❌ | ❌ | ✅ |
| 多格式支持 | ❌ PDF only | ❌ PDF only | ✅ PDF+MD+HTML+TXT |
| 隐私保护 | ❌ 上传云端 | ❌ 上传云端 | ✅ 本地优先 |
| 学习工具 | ❌ | ⚠️ 基础 | ✅ 闪卡+导图+摘要 |
| 离线可用 | ❌ | ❌ | ✅ |
| 批注系统 | ❌ | ❌ | ✅ |

### 一句话总结

> VibeReader 是唯一能"读完还能带走"的本地 AI 阅读器。

---

## Slide 9: 商业模式与规划

### 短期（Hackathon 阶段）

- 完善核心阅读体验
- 增加导出功能（Anki 闪卡、PNG 导图、Markdown 笔记）

### 中期（3 个月）

- **Reading Agent Runtime**：AI 主动分析、工具调用、源引用
- 支持 EPUB、Word 等更多格式
- 协作批注（团队论文讨论）

### 长期（6 个月）

- 个人知识库：论文 → 笔记 → 知识图谱
- 插件生态：连接 Zotero、Notion、Obsidian

---

## Slide 10: 团队与结语

### 团队

- **1 人全栈开发**
- **7 天**完成 Phase 0-8 完整迭代
- 48 个单元测试 + 20 个 E2E 测试全绿

### 开发数据

| 指标 | 数值 |
|------|------|
| 代码行数 | ~15,000 |
| 测试覆盖率 | 80%+ |
| 首屏体积 | 458KB |
| 构建产物 | 5MB |

### 结语

> <span class="accent">让每一篇论文，都变成你的知识资产</span>

---

<!-- _class: lead -->

# 谢谢

## VibeReader —— 你的 AI 阅读实验室

**GitHub**: `github.com/yourname/vibereader`

**Demo**: `vibereader.dev`
