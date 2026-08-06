# Reading Agent 验收清单

更新时间：2026-08-07（Wave 17 docs-agent 部分勾选）

用途：人机共用。对 **VibeReader Reading Agent**（`apps/reader/src/agent`）做能力验收。
总计划：[AGENT_BUILD_PLAN.md](./AGENT_BUILD_PLAN.md)。

写法约定：每条都是「做 X → 应看到 Y；若 Z 则失败」。勾选时写日期与执行者（人或 agent 名）。

Live 模型：**Grok 4.5**，优先 `~/.cli-proxy-api/client.env` → `http://127.0.0.1:8317/v1`；备选环境变量 `XAI_API_KEY`。禁止把密钥写入本文件或仓库。

---

## 0. 环境前置

| # | 检查 | 通过标准 | 结果 |
| --- | --- | --- | --- |
| E1 | Reader 可安装依赖并跑测试 | 在 `apps/reader` 执行项目 test 命令，进程退出码 0 或仅有已记录的无关失败 | ☑ 2026-08-07 docs-agent：`npx vitest run src/agent` → **400 passed / 28 files / 0 failed**（仅 agent 包，非整仓 test） |
| E2 | 8317 代理或 XAI 可用 | 最短 chat 返回 200 级成功体，非连接拒绝/401 | ☐ 本会话未测 live |
| E3 | Demo 文档存在 | `apps/reader/demo-assets/` 中至少一份 PDF 或 md 可打开 | ☑ 2026-08-07 docs-agent：见 `sample.md` / `wonderland_short.pdf` 等（文件存在；未开 UI 打开） |
| E4 | （P1）UniRAG 可选 | `http://127.0.0.1:8766/api/health`（或当前默认）在联调时 available；不做 P1 检索可标 N/A | ☐ / N/A 本会话未测 health |

加载代理示例：

```bash
source ~/.cli-proxy-api/client.env
# 确认 OPENAI_BASE_URL 指向 http://127.0.0.1:8317/v1
```

---

## 1. Harness 与循环（书第 1 章）

| # | 操作 | 通过标准 | 失败相 | 结果 |
| --- | --- | --- | --- | --- |
| H1 | 单元：model 只返回 `final` | `status === 'completed'`，`iterations === 1`，trace 含 model | 挂起或无 status | ☑ 2026-08-07 docs-agent：`runtime.test.js` 随包全绿（34） |
| H2 | 单元：tool_call 后 final | trace 含 tool 结果与最终 content/artifact | tool 名不存在却 completed | ☑ 同上 |
| H3 | 单元：超过 `maxIterations` | 明确超限 status，进程结束 | 死循环 | ☑ 同上 |
| H4 | 单元：非法 response 类型 | `invalid_response`（或等价），不写产物 | 当成功 | ☑ 同上 |
| H5 | 单元：无 model 函数 | `invalid_model` | 抛未捕获异常导致测试崩且无断言 | ☑ 同上 |

主文件：`apps/reader/src/agent/runtime.js`、`runtime.test.js`。

---

## 2. 上下文打包（书第 2 章）

| # | 操作 | 通过标准 | 失败相 | 结果 |
| --- | --- | --- | --- | --- |
| C1 | 打包含 goal + 文档元数据 | prompt/chunks 中可见目标与文档名/id | 只有裸全文无结构 | ☑ 2026-08-07 docs-agent：`contextPacker.test.js` 全绿（4） |
| C2 | 有选区时优先选区块 | selection 块存在且可定位页/锚点（若输入提供） | 选区被丢弃 | ☑ 同上（以测试覆盖为准） |
| C3 | 超 token/字符预算 | 截断且 `truncated` 或等价信号；仍保留 goal/metadata | 无界撑爆上下文 | ☑ 同上 + `contextCompression.test.js` |
| C4 | 空文档 | 可返回空块 + 可理解提示，不抛未处理异常 | 崩溃 | ☑ 同上 |

主文件：`contextPacker.js`、`contextPacker.test.js`。

---

## 3. 工具与权限（书第 4 章）

默认 `DEFAULT_READING_PERMISSIONS`：只读工具开，写工具关。

| # | 操作 | 通过标准 | 失败相 | 结果 |
| --- | --- | --- | --- | --- |
| T1 | `get_current_document` | 返回 name/kind/pageCount 等元数据，不含密钥 | 泄露 full raw secrets | ☑ 2026-08-07 docs-agent：`tools.test.js` 全绿（38） |
| T2 | `get_page_text` / `get_document_chunks` | 有界文本；可带 page/paragraphId | 无界全文强制倾倒且无截断 | ☑ 同上 |
| T3 | `search_document` | 按 query 返回有序 matches，含 score 或等价 | 空 query 却全库 dump 无边界 | ☑ 同上 |
| T4 | 默认权限调 `create_vibecard` | `permission_denied` 或 assert 抛错 | 静默写入 | ☑ 同上 + `permissions.test.js`（7） |
| T5 | 默认权限调 `export_note` | 同上拒绝 | 静默导出 | ☑ 同上 |
| T6 | 放开 `canWriteVibeCards` + allowlist 后建卡 | adapter 被调用一次；返回可持久化结构 | 绕过 adapter 直写全局 | ☑ 同上 + `cardGenerationFlow.test.js` |
| T7 | 未知 toolName | `tool_not_found` | 当成功 | ☑ 同上 |
| T8 | `list_attention_insights` | 只列当前文档洞察 | 串文档 | ☑ 同上 |

主文件：`tools.js`、`permissions.js`、对应测试。

工具语义与拟增 UniRAG 业务工具见：[AGENT_BUSINESS_TOOLS_DESIGN.md](./AGENT_BUSINESS_TOOLS_DESIGN.md)。

---

## 4. Skill 任务（产品主路径）

统一前置：打开 demo 文档，任务绑定正确 `documentId`。

### 4.1 `paper_overview_agent`

| # | 操作 | 通过标准 | 失败相 | 结果 |
| --- | --- | --- | --- | --- |
| S1 | mock 跑通 skill 任务 | task `completed`；产物类型兼容 `reading_note` | 无 task 状态变化 | ☑ 2026-08-07 docs-agent：`readingTaskModels` / `taskRunner` / skill 相关单测随包绿 |
| S2 | live（Grok 4.5）概览 | 中文或用户语言短概览；有 sourceRefs 或明确「块不足」 | 捏造章节且无 ref | ☐ 本会话未 live |
| S3 | 无解析文本时 | 文案承认无法基于原文，不编造数据结论 | 假摘要装可信 | ☐ 未单独手测 |

### 4.2 `attention_agent`

| # | 操作 | 通过标准 | 失败相 | 结果 |
| --- | --- | --- | --- | --- |
| S4 | mock + 预置 insights | 路线条目可排序；含源位置 | 空跑当成功却无字段 | ☑ 2026-08-07 docs-agent：attention 相关本地 model / multiAgent 单测绿 |
| S5 | live | 给出少数关键阅读位置；可与页/段落对应 | 纯鸡汤无坐标 | ☐ 本会话未 live |

### 4.3 `card_generation_agent`

| # | 操作 | 通过标准 | 失败相 | 结果 |
| --- | --- | --- | --- | --- |
| S6 | mock：模型触发 `create_vibecard` | 权限开启时 adapter 收到 source 字段 | 无 source 的事实卡被当 grounded | ☑ 2026-08-07 docs-agent：`cardGenerationFlow.test.js` 绿 |
| S7 | live：生成 VibeCard | 卡可编辑；回源字段足够跳转（page/paragraph/sourceRefs） | 无法回原文 | ☐ 本会话未 live |
| S8 | 同 span 重复 | 单次 run 不刷重复卡（或合并） | 同 span 连建多张无去重 | ☐ 未单独断言本条 |

### 4.4 `note_export_agent`

| # | 操作 | 通过标准 | 失败相 | 结果 |
| --- | --- | --- | --- | --- |
| S9 | mock 导出 | 调用 `export_note`；结果含文档元数据与已有 insights/cards 摘要 | 导出密钥或 model internals | ☑ 2026-08-07 docs-agent：`noteExportFlow.test.js` 绿 |
| S10 | live 导出 | 文件名/内容可读；含 source 链接或 refs | 空壳文件当成功 | ☐ 本会话未 live |

主文件：`skills.js`、`readingTaskModels.js`、`taskRunner.js`；说明：`apps/reader/docs/reading-agent-skills/`。

---

## 5. 产物与溯源（书第 5 章思想：可验证产物）

| # | 操作 | 通过标准 | 失败相 | 结果 |
| --- | --- | --- | --- | --- |
| A1 | claim 无 `sourceSpanIds` 且 `inference !== true` | 创建失败或抛错 | 静默入库 | ☑ 2026-08-07 docs-agent：`artifact.test.js` 绿 |
| A2 | 任务结果 `sourceRefs` | UI 或 result 可展示；点击可导航（有 PDF 时） | 死链 | ☐ 单元有 sourceRefs；未做 UI 点击手测 |
| A3 | 刷新后产物仍在（持久化范围） | 本地存储/Tauri 路径下仍可加载 | 仅内存、一刷即没且无说明 | ☐ 未做刷新手测 |

主文件：`artifact.js`、`taskRunner.js`、相关 UI。

---

## 6. 评估纪律（书第 6 章）

| # | 操作 | 通过标准 | 失败相 | 结果 |
| --- | --- | --- | --- | --- |
| V1 | agent 单元测试集 | 相关 `*.test.js` 全绿 | 用「先 skip」冒充绿 | ☑ 2026-08-07 docs-agent：`npx vitest run src/agent` → **400/28 全绿** |
| V2 | live 结果落盘 | 至少保存：时间、模型 id、goal、status、trace 摘要、文档 id | 只靠口头「好像行」 | ☐ 本会话未跑 live；历史见 `AGENT_LIVE_EVAL_RESULTS.md` |
| V3 | 失败可复现 | 同一 demo + 同 prompt 配置可重跑；差异记录模型非确定性 | 无法重跑 | ☐ 未本会话验证 |
| V4 | 对比改动前后 | 修 bug 后同一用例从 fail→pass 有记录 | 无对照 | ☐ 本会话为文档验证波 |

Eval 目录：`apps/reader/src/agent/eval/`。能力矩阵：[AGENT_BOOK_CAPABILITY_MATRIX.md](./AGENT_BOOK_CAPABILITY_MATRIX.md)。

---

## 7. UniRAG / 知识 seam（书第 3 章 × 产品）

P0 可不测；进入 P1 时必测。

| # | 操作 | 通过标准 | 失败相 | 结果 |
| --- | --- | --- | --- | --- |
| U1 | UniRAG down | Reader 仍可阅读；检索标 degraded/local | 白屏或阻断打开文档 | ☐ |
| U2 | UniRAG up + ingest | 测试 PDF 可进索引；状态可观察 | 失败拖垮阅读 | ☐ |
| U3 | query 带 citation | citation 能映射回当前文档页/块（在已实现映射范围内） | 引用无法回跳且无说明 | ☐ |
| U4 | memory jobs | 仅用户确认保存后推送；body 符合 `packages/shared-contracts/reader-unirag-memory/v1` | Agent 后台偷推隐私全文 | ☐ |

主文件：`ragEngineAdapter.js`、契约 fixtures、`docs/UNI_RAG_INTEGRATION_STRATEGY.md`。

---

## 8. 安全与非目标

| # | 检查 | 通过标准 | 结果 |
| --- | --- | --- | --- |
| X1 | 默认 `canUseWeb === false` | 无登记网页工具被调用 | ☑ 2026-08-07 docs-agent：`permissions.js` `DEFAULT_READING_PERMISSIONS.canUseWeb === false` + 权限单测绿 |
| X2 | 轨迹/导出 | 无 API key、Authorization 头、proxy 密钥 | ☐ 未做轨迹扫密钥 |
| X3 | 范围 | 无训练流水线、无 Computer Use 默认入口 | ☑ 2026-08-07 docs-agent：代码范围事实（agent 包无训练/CU 入口） |
| X4 | 权限文案 | 用户能理解「当前是否发送全文到外部模型」（产品已有配置时） | ☐ 未做 UI 文案手测 |

---

## 9. 金路径手测（15 分钟内）

适合发布前人工过一遍。

1. 启动 Reader（web 或 Tauri，以当前主路径为准）。
2. 配置 Grok 4.5（8317 或 `XAI_API_KEY`）。
3. 打开 `demo-assets` 样本文档。
4. 跑 **Paper overview** 任务 → 看完成态与 refs。
5. 跑 **Create VibeCard**（需写权限路径）→ 卡片可回源。
6. 故意断模型（错误 key）→ 可读错误，任务 failed，可重试。
7. （可选）启 UniRAG → 健康检查 → 一次 query。

| 步骤 | 通过 | 备注 |
| --- | --- | --- |
| 1 启动 | ☐ | |
| 2 模型 | ☐ | |
| 3 打开文档 | ☐ | |
| 4 overview | ☐ | |
| 5 vibecard | ☐ | |
| 6 错误与重试 | ☐ | |
| 7 UniRAG | ☐ / N/A | |

---

## 10. 记录区

| 日期 | 执行者 | 模型 / 端点 | P0 是否全过 | 失败项 ID | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-07 | docs-agent (Wave 17) | 单元 only；live 未测 | 单元 P0 相关 H/T/A1/V1 绿；live S2/S5/S7/S10/E2 未测 | 未勾：E2/E4、全部 live、A2/A3、V2–V4、金路径 | 需要时重跑 offline/deep-read/live；产品决定 chat QA 是否默认开 |

已知缺口（验收时填写，勿删历史）：

```text
- Wave 17 未重跑 offline 5/5、deep-read 12/12、live 10/10（仅 unit 400/28）
- Chat document QA 默认 OFF（代码+UI 有 opt-in）
- 完整事实 rubric / 默认 strict 过程门未强制
- span 树需 exportSpans；无 OTel SDK 管线
- skill proposals 不自动改 skill md
```

---

## 11. 关联

- 总计划：[AGENT_BUILD_PLAN.md](./AGENT_BUILD_PLAN.md)
- 能力矩阵：[AGENT_BOOK_CAPABILITY_MATRIX.md](./AGENT_BOOK_CAPABILITY_MATRIX.md)
- 业务工具设计：[AGENT_BUSINESS_TOOLS_DESIGN.md](./AGENT_BUSINESS_TOOLS_DESIGN.md)
- UniRAG：[UNI_RAG_INTEGRATION_STRATEGY.md](./UNI_RAG_INTEGRATION_STRATEGY.md)
- 运行时概念：`apps/reader/docs/AGENT_RUNTIME_MAPPING.md`
- 产品侧 QA：`apps/reader/docs/ACCEPTANCE_AND_QA.md`（应用层；本清单专管 Agent 能力）
- 书：`/Users/mahaoxuan/Desktop/AI产品经理/ai-agent-book`（Agent = LLM + 上下文 + 工具）
