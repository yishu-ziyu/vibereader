# Phase 11 Web 端阅读闭环 BDD/TDD

日期：2026-06-02

目标：先把 Web 端做成真实可用的阅读产品面。当前切片只处理工作区布局和旁注/地图分工，不扩大到自动生成、Rust 解析或桌面端能力。

## BDD 行为

### 行为 1：文档地图是阅读纸面的左边注

Given 用户打开 Web 阅读工作区
When 工作区渲染当前文档
Then Session 侧栏之后必须出现一张统一的阅读纸面
And Skim Map 必须内嵌在这张阅读纸面的左边注区域
And PDF 正文必须位于同一张阅读纸面的正文区域

业务规则：Skim Map 是读文章时长在正文旁边的阅读路径，不是独立工具面板，也不是右侧旁注卡片。

### 行为 2：Lens Cards 在右侧 Notes 中沉淀

Given 用户在 PDF 中显式生成 Lens Card
When 卡片保存成功
Then 右侧应切换到 Notes
And Notes 中显示已保存 Lens Card

业务规则：Lens Card 是针对局部原文的旁注资产，不能混同为文档全局地图。

### 行为 3：Skim Map 不默认调用 LLM

Given 用户打开文档
When Skim Map 区域首次显示
Then 只能显示结构容器或本地生成入口
And 不应自动调用模型生成内容

业务规则：生成必须由用户显式触发，避免一打开文档就消耗模型调用。

### 行为 4：右侧不再把 Artifacts 暴露为产品名

Given 用户查看右侧阅读资产
When 看到 Lens Card 列表入口
Then 入口文案应是 Notes
And 空状态应表达“还没有保存的阅读卡片”

业务规则：`artifact` 是工程模型，不是用户需要理解的产品语言。

## 边界条件

- 第一版 Skim Map 可以复用现有段落级思维树能力，但必须作为阅读纸面的内嵌左边注出现。
- 第一版不自动生成全篇 summary map。
- 窄屏下允许阅读纸面内部垂直堆叠，但 Map 和 Reader 仍属于同一个 surface。
- 右侧 Chat、Summary、Flashcards、导航仪仍可保留为辅助工具，但 Lens Notes 是阅读资产入口。

## TDD 映射

- 行为 1、4：`src/WorkspaceLayout.test.jsx`
- 行为 2：沿用 `src/ArtifactPanel.test.jsx` 和 Lens Card 保存闭环测试
- 行为 3：当前切片通过 UI 结构约束验证，不接入自动模型调用
