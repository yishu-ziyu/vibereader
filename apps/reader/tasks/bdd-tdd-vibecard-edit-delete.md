# VibeCard Edit/Delete BDD

## Goal

推进 PRD Phase 2 的两个验收点：卡片能编辑，卡片能删除，并且这些操作穿过本地持久化层。

## Behaviors

### Behavior 1: 编辑 VibeCard 用户备注时保留来源

Given 用户已经保存了一张带页码和 paragraph id 的 VibeCard
When 用户在 Notes 面板编辑这张卡的用户备注并保存
Then 卡片内容应更新为新的备注
And 原来的来源页码、paragraph id、verification status 不应丢失

业务规则：编辑是对阅读产物做轻量修订，不应破坏“每张卡必须有来源”的 PRD 约束。

### Behavior 2: 删除 VibeCard 需要用户确认

Given Notes 面板里有一张已保存的 VibeCard
When 用户点击删除并确认
Then 这张卡应从当前 Notes 列表中移除

业务规则：删除阅读产物是有损操作，至少需要一次明确确认。

### Behavior 3: 持久化层用同一个 card id 覆盖更新

Given Rust-backed storage 已经保存了一张 VibeCard
When 前端用同一个 card id 保存编辑后的 VibeCard
Then storage 应返回更新后的记录
And 重新列出文档卡片时只能看到一张同 id 卡片

业务规则：编辑后的卡片必须能在重启后恢复，不能因为 SQLite insert 冲突导致保存失败。

### Behavior 4: 持久化层删除指定 VibeCard

Given Rust-backed storage 已经保存了一张 VibeCard
When 前端请求删除这张 card id
Then storage 应返回删除成功
And 重新列出文档卡片时不再包含这张卡

业务规则：删除不能只改当前内存列表，否则重启后卡片会复活。

## Boundary Conditions

- 只实现用户备注的最小编辑面，不做完整富文本卡片编辑器。
- 删除确认采用浏览器确认框，后续可以替换成统一设计系统弹窗。
- 若卡片无来源，编辑仍可保存，但不会伪造来源；无来源状态继续由 verification status 表达。
