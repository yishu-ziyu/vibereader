# Phase 10 Reading Agent Runtime Skeleton BDD/TDD

日期：2026-06-02

目标：把 gstack 指导后的 Reading Agent 收窄成可测试骨架。第一版只做阅读上下文、reading-only 工具、source-grounded artifact 契约，不做通用自治 agent。

## BDD 行为

### 行为 1：选区解释必须保留来源

Given 用户在当前文档中选中一段带 `spanId` 的文本
When Reading Agent 生成 Lens Card
Then artifact 必须包含 `documentId`、`type=lens_card`、`goal`、`sourceSpanIds`
And 原始生成内容和当前可编辑内容必须同时存在

业务规则：Lens Card 不是普通聊天回复，它必须能回到阅读器中的来源段落。

### 行为 2：生成结论不能无来源

Given artifact 中包含模型生成的 claim
When claim 没有 `sourceSpanIds`
Then claim 必须显式标记为 `inference`
And 没有来源也没有推断标记的 claim 应被拒绝

业务规则：用户可见结论要么来自文档来源，要么被标成模型推断，不能伪装成文档事实。

### 行为 3：上下文打包优先当前阅读现场

Given 当前文档有 metadata、outline、annotation、body 和选区
When context packer 打包模型上下文
Then 目标、metadata、selection、outline、annotation 应优先于正文 body
And 即使预算过小，也要保留 source anchor 标签

业务规则：模型先看用户正在读的地方，再看全文背景。

### 行为 4：工具注册表只允许阅读能力

Given Reading Agent 初始化工具 registry
When 默认权限生效
Then 只允许读文档、跳页、列批注
And shell、任意文件、网页搜索、写源文档等工具都不能通过权限检查

业务规则：第一版 Reading Agent 是阅读助手，不是通用电脑代理。

### 行为 5：运行循环必须有边界

Given 模型持续请求工具调用
When 达到最大迭代数或超时
Then runtime 必须停止并返回边界状态

业务规则：agent loop 不能无限执行，也不能在用户不知情时扩大权限。

## 边界条件

- 第一版只接受单文档上下文。
- Page-only citation 只能作为辅助信息；核心来源应尽量使用 `spanId`。
- 生成内容可编辑，但编辑前后的内容都要保留。
- 不在本切片接入 Rust local index。
- 不在本切片加入网页搜索、shell 或任意文件工具。

## TDD 映射

- 行为 1、2：`src/agent/artifact.test.js`
- 行为 1、2 的 PDF 选区生成闭环：`src/agent/lensCard.test.js`、`src/services/artifactService.test.js`
- 右侧 UI 闭环：`src/PdfAnnotationToolbar.test.jsx`、`src/ArtifactPanel.test.jsx`
- 行为 3：`src/agent/contextPacker.test.js`
- 行为 4：`src/agent/permissions.test.js`、`src/agent/tools.test.js`
- 行为 5：`src/agent/runtime.test.js`

## RED/GREEN 结果

1. RED：`src/agent/artifact.test.js` 验证缺少 artifact schema 模块。
2. GREEN：`src/agent/artifact.js` 实现最小 Lens Card 和 claim grounding 校验。
3. RED：`src/agent/lensCard.test.js`、`src/services/artifactService.test.js`、`src/PdfAnnotationToolbar.test.jsx`、`src/ArtifactPanel.test.jsx` 验证缺少生成、保存、入口、展示闭环。
4. GREEN：接入 `generateLensCardArtifact`、`artifactService`、PDF 工具条“生成卡片”、Artifacts 面板和 PDF source 回跳。
5. 验证：定向测试 5 个文件 / 10 个用例通过；`npm run test` 28 个文件 / 111 个用例通过；`npm run build`、`cd src-tauri && cargo check`、`git diff --check` 通过。
