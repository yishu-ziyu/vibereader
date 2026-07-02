# VibeReader Knowledge Workbench 运行规范

更新时间：2026-07-02

## 1. 目的

这个项目必须按目标驱动推进，而不是按聊天流、灵感流或临时修补推进。

每一轮重要工作都需要明确：

- Plan：这轮准备做什么。
- Goal：这轮做到什么才算完成。
- Loop：如何执行、验证、回写、进入下一轮。
- Verification Environment：用什么环境验证。
- Acceptance Target：哪些结果能证明目标达成。

这套规范适用于：

- 产品规划。
- 竞品分析。
- 架构决策。
- 功能设计。
- 代码实现。
- 浏览器 E2E 验证。
- 发布与复盘。

## 2. yishuship 作为生命周期事实源

项目生命周期以 `.ship/tasks/<task_id>/` 为事实源。

当前主任务：

```text
.ship/tasks/20260701-vibereader-knowledge-flywheel/
```

长期文档放在 `docs/`，但阶段推进必须能回到 `.ship`：

- 产品判断：`.ship/tasks/<task_id>/product/`
- 工程交接：`.ship/tasks/<task_id>/delivery/`
- 执行计划：`.ship/tasks/<task_id>/plan/`
- E2E 结果：`.ship/tasks/<task_id>/e2e/`
- QA 结果：`.ship/tasks/<task_id>/qa/`
- 运行状态：`.ship/tasks/<task_id>/control/`

## 2.5 多 Agent 协作规范

GLM、Trae、Codex 可以协作，但项目事实不能只来自某个 Agent 的交付总结。

默认分工：

- GLM/Trae 可以承担实现 slice、补测试、写局部交付记录。
- Codex 承担复核、验证、仓库卫生、提交/推送和长期索引更新。
- 用户只负责关键产品判断、仓库迁移确认和体验验收。

接受外部 Agent 交付时必须执行：

1. 核对 `git status` 和改动文件。
2. 阅读关键实现路径和接口契约。
3. 跑相关测试或真实服务 smoke。
4. 排除运行产物、密钥、数据库文件。
5. 把通过验证的结果写入开发日志或项目索引。

外部 Agent 的“已完成”只能视为待复核输入；只有完成验证和记录后，才算进入项目事实源。

## 3. Plan 规范

进入以下任务前必须先有 plan：

- 新功能。
- 架构变更。
- 竞品分析。
- 产品定位变化。
- 涉及两个以上 Module 的改动。
- 会影响用户核心路径的 UI/UX 改动。
- 需要真实浏览器验证的改动。

Plan 必须包含：

```markdown
## Goal

## Scope

## Out of Scope

## Work Breakdown

## Verification Environment

## Acceptance Criteria

## Risks

## User Confirmation Needed
```

小修复可以使用轻量 plan，但仍然要明确验收目标。

## 4. Goal 规范

Goal 不能写成“优化一下”“研究一下”“接一下”。

Goal 必须可验证：

好：

```text
VibeReader 能在 UniRAG 未启动时继续使用本地 retrieval，并在 UniRAG 启动后通过 UniRagHttpAdapter 返回带 citation 的回答。
```

不好：

```text
把 UniRAG 接进来。
```

Goal 必须说明：

- 用户结果：用户能做成什么。
- 系统行为：系统如何表现。
- 验证证据：用什么证明完成。

## 5. Loop 规范

每一轮开发按以下 loop 推进：

```text
Intake
-> Plan
-> Design
-> Implement
-> Verify
-> Record
-> Decide Next
```

### 5.1 Intake

确认任务类型：

- 产品判断。
- 竞品分析。
- 功能设计。
- 工程实现。
- Bug 修复。
- QA/E2E。
- 发布/复盘。

### 5.2 Plan

写入 `.ship/tasks/<task_id>/plan/` 或对应 `product/` 文件。

### 5.3 Design

涉及架构或交互时，先产出设计说明，不直接改代码。

### 5.4 Implement

实现要保持 surgical changes。

跨 Module 改动必须先明确 Interface 与 Adapter。

### 5.5 Verify

不能只说“应该可以”。

验证证据优先级：

1. 真实浏览器行为截图、录屏、Playwright/Kimi WebBridge 结果。
2. E2E 测试日志。
3. 单元/集成测试。
4. 运行命令输出。
5. 静态检查。

### 5.6 Record

结果必须回写：

- 开发日志。
- yishuship delivery/e2e/qa。
- 必要时写 DEC 决策记录。

### 5.7 Decide Next

每轮结束必须给出下一步：

- 继续推进。
- 需要用户确认。
- 进入验证。
- 进入重构。
- 暂停并记录阻塞。

## 6. 验证环境规范

任何声称完成的功能必须说明验证环境。

### 6.1 Reader 验证环境

最低要求：

- VibeReader dev server 可启动。
- 浏览器打开真实页面。
- 使用真实 PDF 或固定测试 PDF。
- 明确模型配置状态。
- 明确 UniRAG 是否启动。

### 6.2 UniRAG 验证环境

最低要求：

- UniRAG FastAPI 可启动。
- `/api/health` 可访问。
- ingest 可执行。
- query 可返回 answer。
- citation 字段可检查。

### 6.3 组合验证环境

最低要求：

- VibeReader + UniRAG 同时运行。
- 打开同一测试 PDF。
- Reader 能触发或调用 UniRAG。
- 问答结果在 Reader UI 中呈现。
- citation 能展示，后续要能跳转。

### 6.4 失败路径验证

必须验证至少一个失败路径：

- UniRAG 未启动。
- 模型 key 缺失或错误。
- ingest 失败。
- citation 无法映射。

失败路径不能让用户误以为功能成功。

## 7. 什么时候必须和用户确认

以下情况必须先和用户确认：

- 产品定位变化。
- 主流程取舍。
- 是否移动仓库或重组目录。
- 是否引入新的重依赖。
- 是否改变隐私/数据出域策略。
- 是否删除现有能力。
- 是否影响用户可见语言、品牌和核心体验。
- 是否从本地优先转向云端优先。

以下情况不需要等待确认，应该主动推进：

- 补文档索引。
- 写开发日志。
- 跑测试。
- 修明显 bug。
- 补缺失验收证据。
- 把已确认方向落成规范。
- 在不破坏现有行为的前提下添加 Adapter、fallback、测试。

## 8. 阶段推进规则

### Phase 0：产品与生命周期

完成标准：

- 产品愿景存在。
- 集成策略存在。
- yishuship 生命周期任务存在。
- Plan/Goal/Loop 规范存在。
- 竞品分析计划存在。

### Phase 1：Adapter Seam

完成标准：

- `RagEngineAdapter` Interface 存在。
- 本地 retrieval 被包装为 Adapter。
- UniRAG HTTP Adapter 至少支持 health。
- fallback 行为可测试。

### Phase 2：RAG 闭环

完成标准：

- Reader 能调用 UniRAG query。
- answer + citations 可渲染。
- ingest 状态清晰。
- 浏览器验证通过。

### Phase 3：Citation 闭环

完成标准：

- page-level jump。
- citation mapping status。
- 失败映射不假装成功。

### Phase 4：知识飞轮

完成标准：

- note/card/highlight 进入 Knowledge Module。
- 后续 query 可引用用户确认内容。

## 9. 每轮结束报告格式

每轮结束用这个格式：

```markdown
## Done

## Verification

## Files Changed

## Risks / Gaps

## Next
```

不要只说“完成了”。必须给出证据和下一步。
