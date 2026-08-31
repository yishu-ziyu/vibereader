# DEC-0008: PDF 阅读体验借鉴 PageFlow，不更换渲染技术栈

Date: 2026-08-31

## Context

架构审计（`docs/design/workbench-architecture-0/DESIGN.md`）确认 Reader 的 PDF 场景存在核心体验缺口：

- PDF 提取文本不持久化（债务 D8），「最近文档」重开即丢，本地与 UniRAG 知识状态不对称；
- 无阅读位置记忆，任何文档重开都回到起点；
- 多标签、书签、视图模式等阅读器基础体验缺位。

参考对象：[pinchen147/PageFlow](https://github.com/pinchen147/PageFlow)（原生 macOS SwiftUI + PDFKit 阅读器），其已验证的特性清单：阅读位置记忆（页码/滚动/缩放跨重开恢复）、多标签/多窗口、标注/书签、单页/连续/双页视图、长会话缓存治理。

## Decision

**借鉴 PageFlow 的产品体验，在现有 Tauri + pdf.js 技术栈内分期落地，不更换渲染层。**

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P0 | PDF 提取文本持久化（消 D8 数据不对称）+ 阅读位置记忆（页码/滚动缩放，SQLite `documents.reading_position`，跨重开恢复） | 已完成（2026-08-31） |
| P1 | 多标签 + 书签（复用 annotations 表）；借鉴 PageFlow 的 tab 切换缓存清理治理长会话卡顿 | 待启动 |
| P2 | 视图模式（单页/连续/双页）+ 阅读位置与 UniRAG 入库状态联动展示 | 规划中 |

## Not Chosen

- **原生 SwiftUI + PDFKit 壳（PageFlow 同款技术路线）**：grounding 链路（选区 ↔ chunk ↔ citation 跳转）会被拆到两个进程/两套 UI 框架，直接伤害「带引用问答」这一核心卖点；单人团队维护 Swift + Rust + TS 三套栈成本不可控。
- **外挂集成（把 PageFlow 当独立阅读器，经协议接入 UniRAG）**：标注数据结构无法回流记忆层，UniRAG 沦为孤岛服务，Reader-first 叙事被稀释；且无法控制第三方产品演进。

## Consequences

- D8 关闭：PDF 恢复后提取文本可用于问答/检索，渲染仍需重开原文件（二进制持久化不在本期）。
- documents 表新增 `reading_position` 列，沿用 DEC-0004 确立的渐进 schema 迁移模式（PRAGMA + ALTER 幂等）。
- P1 多标签需与 Phase 45「多文档工作区」合并设计，避免两套标签实现。
