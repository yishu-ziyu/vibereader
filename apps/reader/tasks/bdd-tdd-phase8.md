# Phase 8 BDD/TDD：gstack 发布硬化

目标：把 Phase 7 的演示闭环推进到更接近可发布的状态，优先解决生产包 AI 通信、失败态 UX、多文档隔离、smoke 自动化和 pre-landing review。

## 行为 1：缺少模型配置时不发起请求

Given 用户尚未配置任何可用 AI 模型

When 用户在 Chat 输入框发送问题

Then 应用不应发起 AI 请求

And 应用应显示清晰的配置提示

And 发送按钮应恢复可用状态

业务规则：没有模型配置时，用户需要知道下一步是配置模型，而不是看到无限 loading 或底层网络错误。

自动化映射：

- 单元测试：`src/modelConfigGuard.test.js`
- 集成测试：Chat send path 在校验失败时不调用 `chatStream`

## 行为 2：API key 无效或 provider 拒绝时有可读错误

Given 用户选择了一个模型配置

And 该配置的 API key 已失效或 provider 返回鉴权错误

When 用户发送问题

Then 应用应结束 loading 状态

And 保留用户输入上下文

And 显示包含 provider/config 线索的可读错误

业务规则：现场演示或真实使用时，坏 key 是高概率问题；产品必须让用户知道是配置问题，而不是让人以为阅读器坏了。

自动化映射：

- 单元测试：模拟 `401` / provider error normalization
- Playwright smoke：可选地用 mock route 验证错误状态

## 行为 3：生产包不依赖 Vite dev proxy

Given 应用运行在 Tauri 打包或 release-like 环境

When 用户使用 MiniMax Anthropic-compatible 配置发送请求

Then 请求不应依赖本地 Vite dev server 的 `/api/minimax`

And 应用应使用明确的生产路径：Tauri-side HTTP/proxy 或已部署 proxy

业务规则：Phase 7 的 dev proxy 只证明本地演示可用；正式桌面包必须有自己的 AI 通信路径，否则 demo 外发包会失效。

自动化映射：

- 单元测试：`src/aiEndpoint.test.js` 覆盖 dev/browser/Tauri endpoint resolution
- 手工验收：release-like Tauri app 发送一次短请求

## 行为 4：Stop generating 在 provider 路径变化后仍可用

Given AI 正在生成长回复

When 用户点击 Stop

Then 当前请求应被取消

And 已生成内容应保留

And UI 应回到可继续发送状态

业务规则：停止生成是阅读工作台的基础控制能力； provider path 改动不能破坏 AbortController 闭环。

自动化映射：

- 现有 `src/aiService.test.js` 继续覆盖 AbortSignal
- Tauri 桌面路径也必须把同一个 `AbortSignal` 传给 `@tauri-apps/plugin-http`
- Playwright smoke 在 live key 存在时验证真实 Stop；无 key 时跳过 live AI 并报告原因

## 行为 5：多文档切换时状态不串文档

Given 用户先打开 PDF 并创建批注

And 用户随后打开 Markdown/Text/HTML 文档并注入选区

When 用户再次打开另一份 PDF

Then 新文档不应继承旧 PDF 的页码、选区工具栏或错误批注归属

And AI 注入上下文应来自当前文档

业务规则：VibeReader 的核心定位已经从 PDF-only 扩展为通用阅读器，多文档状态隔离是产品可信度的底线。

自动化映射：

- 单元测试：document id / annotation ownership
- Playwright smoke：PDF -> Markdown -> PDF 路径

## 行为 6：smoke 脚本可在无密钥环境运行

Given 当前机器没有可用 AI API key

When 执行 `npm run qa:smoke`

Then 脚本仍应完成本地阅读器 smoke

And 明确输出 live AI 被跳过

And 退出码应反映本地核心路径是否通过

业务规则：QA 自动化不能把秘密配置当作前提；无 key 环境也应该验证 PDF、Markdown、批注和布局这些本地核心能力。

自动化映射：

- `scripts/qa-smoke.mjs`
- 输出标记：`SKIPPED_LIVE_AI`

## 边界条件

- MiniMax 是当前已验证可用的 provider；Kimi/Moonshot 暂不作为 Phase 8 必过项，除非找回真实 API key。
- Phase 8 不实现 EPUB、PDF 写回、移动端或云同步。
- Phase 8 可以决定 Tauri-side HTTP 与部署 proxy 二选一，但不能继续隐式依赖 Vite dev proxy。
- 所有 API key 只能来自本机安全位置或用户手工配置，不能写入 git、文档、截图或日志。
- 如果 production streaming 难度过大，可以第一版保留 dev streaming，release path 先降级为非 streaming，但必须在 UI 中保持可理解的 loading/stop 行为并记录限制。

## 测试计划

1. 红灯：新增 `src/modelConfigGuard.test.js`，证明当前缺少统一配置校验。
2. 绿灯：实现 `src/modelConfigGuard.js` 并接入发送路径。
3. 红灯：扩展 `src/aiEndpoint.test.js`，证明 production/Tauri endpoint 策略未明确。
4. 绿灯：实现最小 endpoint 决策或明确的 Tauri/proxy release strategy。
5. 自动化：新增 `scripts/qa-smoke.mjs` 和 `npm run qa:smoke`。
6. 验收：运行 `npm run test`、`npm run build`、`cd src-tauri && cargo check`、`npm run qa:smoke`。
