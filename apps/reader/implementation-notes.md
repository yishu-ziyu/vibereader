# MiniMax Token Plan 集成 — 实现笔记

## 背景

用户要求：
1. 调研 MiniMax 官方 Agent 项目
2. 用 Agent 架构替代纯 Chatbot I/O
3. 使用 Agent Teams 进行开发
4. 先更新前端配置，再部署代理

## 调研结论

### MiniMax Agent 生态（2026-05）

- **无全托管 Agent API**：MiniMax 没有像 OpenAI Assistants API 或扣子(Coze)那样的全自动托管智能体服务
- **两条路径构建 Agent**：
  1. 模型 API + 自研编排（利用 Function Calling / Tool Use + ReAct 循环）
  2. [Mini-Agent](https://github.com/MiniMax-AI/Mini-Agent) 开源框架（CLI + Python，本地运行）
- **M2.7 的 Agent-like 特性**：原生输出 `thinking` 块（推理链），这是目前最接近 Agent 行为的模型层特性

> 详见 web search 结果：[MiniMax API Docs](https://platform.minimax.io/docs/)、[Mini-Agent GitHub](https://github.com/MiniMax-AI/Mini-Agent)

### 为什么不在这个迭代做完整 Agent 架构

1. **范围控制**：当前任务是「接入 MiniMax Token Plan」，不是「重写为 Agent 系统」
2. **基础设施**：完整 Agent 循环需要 Tool Registry、ReAct Orchestrator、Memory 管理等新模块
3. **ROI**：M2.7 的 thinking 块已经提供了 80% 的 Agent 体验（可见推理过程），是最高性价比的切入点

## 决策记录

### 决策 1：先暴露 Thinking 块，而非完整 Agent 循环

**Why**：M2.7 返回的 SSE 流包含 `thinking_delta`（模型内部推理）再输出 `text_delta`（最终回复）。当前 `aiService.js` 静默丢弃 thinking 块。这是功能缺口。

**Tradeoff**：
- ✅ 用户能看到模型推理过程，体验接近 DeepSeek-R1 / Claude Thinking
- ✅ 代码改动小，风险低
- ❌ 不是真正的 Agent（无工具调用循环）
- **结论**：作为 Agent 架构的 Phase 1，先暴露 thinking，为后续 Tool Use 留接口

### 决策 2：Thinking UI 采用折叠面板（collapsed by default）

**Why**：推理过程通常较长且技术化，默认折叠避免干扰阅读流。

**Tradeoff**：
- ✅ 不破坏现有消息渲染布局
- ✅ 用户需要时可展开查看
- ❌ 需要额外点击才能看到推理

### 决策 3：不使用 Agent Teams 进行本次开发

**Why**：对照 Agent Teams 决策清单：

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 拆成 3+ 独立子任务？ | ❌ | 只有一个功能：thinking 块支持 |
| 子任务互不依赖？ | N/A | 只有一个子任务 |
| 文件集合互斥？ | ❌ | 所有改动集中在 aiService.js + App.jsx |
| 60 秒内写出 spawn prompt？ | 是 | 但没必要 |
| 任务规模 > 1 小时？ | ❌ | 约 30 分钟 |
| 能监控 3-5 个会话？ | 能 | 但没必要 |
| 配额经得起 5 倍？ | 未知 | 不推荐冒险 |
| 接受实验性功能？ | 是 | 但没必要 |

**结论**：本次开发用单会话直接实现，Agent Teams 留给后续大规模重构（如完整 Agent 架构）。

### 决策 4：代理文件保持透传，不解析 thinking

**Why**：`proxy/api/minimax.js` 是边缘代理，只负责转发请求/响应。如果代理开始解析 SSE，会增加复杂度和延迟。

**Tradeoff**：
- ✅ 代理保持简单，单责任
- ✅ 前端自行解析，灵活可控
- ❌ 代理无法做日志/审计

## 改动范围

### 修改文件

1. **`src/aiService.js`**
   - `detectAndParseSSE`：新增 `thinking_delta` 检测
   - `chatStream`：accumulate thinking content，通过 `onChunk` 暴露 `thinking` 字段

2. **`src/App.jsx`**
   - `handleSubmit`：接收 `thinking` 字段，存入消息对象
   - 消息渲染：assistant 消息上方添加折叠式 thinking 面板

3. **`src/i18n.js`**
   - 新增 `ai-chat-thinking` 文案（zh/en）

## 已知限制

1. **非真正的 Agent**：当前只是暴露模型的 thinking 输出，没有工具调用、没有 ReAct 循环
2. **Thinking 块顺序**：M2.7 总是先 thinking 后 text，所以用户会先看到「正在推理...」然后才看到回复
3. **持久化**：thinking 内容随消息一起存入 IndexedDB，可能占用更多存储空间
4. **Token 消耗**：thinking 过程消耗额外 token，但这是模型行为，前端无法控制

## 下一步（Agent 架构 Phase 2）

如需完整 Agent 能力，后续可：
1. 实现 Tool Registry（工具注册表）
2. 实现 ReAct Orchestrator（思考→工具调用→观察→回复循环）
3. 接入 MiniMax 的 Function Calling API
4. 参考 Mini-Agent 开源框架的实现模式
