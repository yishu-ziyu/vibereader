# DEC-0009: 以 PageFlow 为底座开建原生 macOS 版本（VibeReader for Mac）

Date: 2026-08-31

## Context

- 现有 Reader（Tauri + pdf.js）的 PDF 渲染与多标签/窗口等阅读器基础体验存在短板（DEC-0008 P1/P2 未做）。
- 用户决定并行开建一个原生 macOS 版本：以 [pinchen147/PageFlow](https://github.com/pinchen147/PageFlow)（纯 SwiftUI + PDFKit，Apache-2.0）为底座，融入 VibeReader 的 AI 能力。
- 这与 DEC-0008 不冲突：DEC-0008 否决的是「替换现有 Reader 的渲染层」；本决策是**并行新增**一个原生 edition，现有 Reader 继续演进。

## Decision

1. **底座**：克隆 PageFlow 主干（去 git 历史）vendor 进 `apps/vibereader-macos/`，保留 Apache-2.0 LICENSE 与原项目署名（README 注明 fork 来源与修改）。
2. **产品名**：VibeReader for Mac。
3. **v0 目标**：PageFlow 全部阅读能力（多标签、标注、书签、位置记忆、搜索）+ 接入本机 UniRAG（HTTP 127.0.0.1:8766）的带引用问答，复用 `reader-unirag-memory-v1` 契约语义。
4. **仓策略**：遵守 PROJECTS.md「不新增分散远端」——本期只做本地目录，远端 push 时机由后续 DEC 确定。

## Not Chosen

- **从零写 SwiftUI 阅读器**：PageFlow 已验证标签/位置记忆/长会话稳定性等难点，重复造轮子无收益。
- **替换现有 Reader 技术栈**：见 DEC-0008，grounding 链路拆分风险与三栈维护成本。

## Consequences

- workbench 出现第三个代码目录（`apps/vibereader-macos/`），需加入根仓 ignore 名单（与 `apps/reader` 同策略）。
- Apache-2.0 义务：保留 LICENSE、NOTICE 与显著修改声明；不得用原项目名做产品宣传（已改名 VibeReader for Mac）。
- Swift 侧新增 UniRAG HTTP 客户端，需要定义 Swift 侧的 citation→PDFKit 页面/span 跳转映射（对应 Reader 的 grounding jump）。
- 构建依赖 Xcode 16+ / macOS 15+（PageFlow 要求），本机已验证 Xcode 16.4 + macOS 15.5。
