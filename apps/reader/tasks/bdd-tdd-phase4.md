# Phase 4 BDD/TDD 计划：Stop Generating 与 PDF 选区注入

最后更新：2026-05-23

## 执行原则

- 先用 Given / When / Then 固定行为，再写自动化测试。
- 每次只推进一个可验证行为：红灯测试 -> 最小实现 -> 绿灯验证。
- 自动化测试覆盖稳定的公共接口；PDF 真实选区属于浏览器渲染/鼠标交互，保留手工验收步骤。
- 当前主线项目固定为 `/Users/mahaoxuan/Desktop/ai-chat-standalone`。

## BDD 行为清单

### 行为 1：发送长回复时可以看到停止入口

Given 用户已配置可用的自定义模型，并在 Chat 面板中发送消息。
When AI 回复正在流式生成。
Then 输入区不再显示普通 Send 操作，而显示 Stop 操作，用户可以明确中断当前生成。

业务规则：生成中必须给用户可见的控制权，避免长回复或误发请求无法停止。

自动化策略：组件测试验证 `ChatInput` 在 `loading=true` 时渲染 Stop 按钮并触发 `onStop`。

### 行为 2：停止生成会把 AbortSignal 传到底层请求

Given AI 服务通过 `chatStream` 发起流式请求。
When 上层传入 `AbortSignal`。
Then 底层 `fetch` 必须携带同一个 signal，以便浏览器/Tauri WebView 可以真正取消网络请求。

业务规则：停止按钮不能只是 UI 停止 loading，必须取消底层请求。

自动化策略：服务测试 mock `fetch`，断言 `fetch` options 中包含传入的 signal。

### 行为 3：停止后保留已经生成的部分内容

Given AI 已经返回了部分流式内容。
When 用户点击 Stop，底层读取被 abort。
Then assistant 消息结束 typing 状态，保留已经收到的部分文本，不显示硬失败错误气泡。

业务规则：用户停止不是模型错误，已生成内容仍然有阅读价值。

自动化策略：服务测试模拟 AbortError，断言回调携带 `interrupted=true`、`aborted=true` 和当前 `fullMessage`；App 层保留 partial 内容。

### 行为 4：停止只作用于当前请求

Given 用户停止了当前回复。
When 用户再次发送新消息。
Then 新请求使用新的 AbortController，不会被上一次停止状态污染。

业务规则：停止是一次性操作，不能导致后续会话一直失败。

自动化策略：App/服务边界验证每次 `handleSubmit` 创建新的 controller；可用代码审查 + 手工发送第二条消息验收。

### 行为 5：PDF 选区注入保持双栏工作台不切屏

Given 左侧 PDF 阅读器已加载真实 PDF，右侧显示 Chat 面板。
When 用户选中 PDF 文本并点击注入 AI。
Then 右侧 Chat 面板发送带 PDF 上下文前缀的消息，左侧阅读器仍可见。

业务规则：新双栏模式的核心价值是“左读右问”，选区注入不能回退成旧的互斥 Tab 体验。

自动化策略：真实 PDF 渲染和 selection floating button 依赖 pdf.js text layer 与浏览器 selection，主要做手工验收；辅助用 Playwright/CDP 检查 PDF canvas 非空、文本层存在。

## 需要用户手工验收的边界

1. 真实模型长回复中点击 Stop：需要用户自己的 API Key 或本地可用模型配置。
2. 真实鼠标拖选 PDF 文本并点击注入：自动脚本可辅助，但最终体验需要人眼确认浮层位置和选中手感。
3. Tauri 桌面窗口内的文件选择器：浏览器自动化不能完全替代 macOS 原生弹窗体验。

## 本轮验收命令

```bash
npm run test
npm run build
cd src-tauri && cargo check
```

## 手工验收步骤

1. 启动：`npm run tauri:dev`。
2. 打开真实 PDF，例如 `/Users/mahaoxuan/Desktop/黑客松/Vibero/test/tests/data/wonderland_short.pdf`。
3. 确认左侧 PDF 内容可见，右侧 Chat 面板可见。
4. 在 PDF 正文中拖选一段文本，点击浮层的注入按钮。
5. 确认右侧出现一条用户消息，开头包含 PDF 上下文提示，左侧阅读器没有消失。
6. 发送一条会触发长回复的问题，生成中点击 Stop。
7. 确认 Stop 后 loading 消失，已生成片段保留，控制台没有未捕获错误。
