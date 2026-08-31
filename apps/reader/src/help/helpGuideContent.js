/**
 * Help guide content — embedded Markdown for the in-app guide.
 * Contains: quick-start (3-5 steps) + full feature reference.
 */
export const HELP_GUIDE_MARKDOWN = `# VibeReader 使用指南

> 本地优先的 AI 阅读工作区。上传文档，让 AI 帮你读。

---

## 快速上手

1. **上传文档**：拖拽 PDF / Markdown / 文本文件到左侧上传区。
2. **配置模型**：点击侧边栏「⚙ 配置模型」，添加你的 API Key 和模型名称。
3. **阅读**：文档加载后即可在阅读区浏览。
4. **AI 辅助**：右侧面板切换摘要 / 卡片 / 导航 / 笔记 / 对话，获取 AI 分析结果。
5. **对话提问**：选中 PDF 段落拖入输入框，以选中内容为上下文向 AI 提问。

---

## 功能详解

### 阅读区

| 功能 | 说明 |
|------|------|
| 页面导航 | 顶部翻页按钮或键盘左右箭头 |
| 缩放 | Ctrl + / Ctrl - 或触控板双指 |
| 选中文本 | 直接在 PDF 上拖选，拖入 AI 输入框引用 |
| 拖入输入 | 选中文本拖到右下输入区，自动附带页码引用 |

### AI 面板

#### 摘要（Summary）

点击「生成摘要」，AI 按文档结构逐节生成摘要。摘要持久化存储，切换文档不丢失。

- 每节可单独查看和重生成。
- 支持 Ask AI：对某个章节摘要直接追问。

#### 记忆卡片（Flashcard）

从文档自动生成 3D 翻转闪卡，支持：

- 从摘要或全文生成
- 翻转查看答案
- 标记已掌握 / 未掌握
- 多卡组管理

#### 注意力导航（Attention Navigator）

自动提取文档的关键段落并标记在阅读区：

- 四种洞察类型：创新点（绿）、方法亮点（蓝）、关键对比（紫）、实验反常（橙）
- 点击卡片跳转到 PDF 对应位置
- 结果持久化，下次打开文档自动恢复

#### 笔记（Artifacts）

- 保存 AI 回答为独立笔记条目
- 按文档组织，支持删除和查看
- 自动关联源引用位置

#### 对话（Chat）

- 多会话管理（左侧会话列表）
- 三种上下文模式：Relevant / Current page / Current section / Selected paragraph
- 支持多模态输入（附带图片）
- 流式输出，实时显示
- 网页工具：粘贴 URL 获取正文后提问

### 模型配置

VibeReader 支持 OpenAI 兼容和 Anthropic 兼容两种格式。

- 可保存多个配置，随时切换
- 内置预设：OpenAI、Anthropic、DeepSeek、MiniMax、StepFun、Qwen、Kimi 等
- 支持自定义 Base URL（本地模型 / 中转服务均可）
- 每个配置可单独设置 API Key 和模型名称
- 配置持久化存储，重启不丢失

### Skim Map

左侧阅读区上方的文档结构树：

- 从 PDF 大纲或章节标题自动生成
- 点击节点跳转页面
- 可对任意节点发起 AI 提问

---

## 快捷键

| 按键 | 功能 |
|------|------|
| Ctrl + / Cmd + | 放大 |
| Ctrl - / Cmd - | 缩小 |
| 左箭头 / 右箭头 | 翻页 |

---

## 常见问题

**Q: 上传 PDF 后看不到文字？**

A: 该 PDF 可能是扫描件，文字未嵌入。尝试使用 OCR 功能，或使用文字层可选的 PDF。

**Q: AI 返回空白？**

A: 检查侧边栏「⚙ 配置模型」是否已保存可用配置，且模型名称正确。

**Q: 数据存在哪里？**

A: 浏览器环境使用 localStorage + IndexedDB；Tauri 桌面版使用本地 SQLite。所有数据仅存于本机。

**Q: 支持哪些文件格式？**

A: PDF、Markdown（.md）、纯文本（.txt）、安全 HTML 提取。
`;
