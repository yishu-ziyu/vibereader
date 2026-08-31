# VibeReader for Mac · AI 融合方案

- 日期：2026-08-31
- 决策依据：[DEC-0009](../../decisions/DEC-0009-native-macos-edition-pageflow-base.md)
- 底座：PageFlow v1.5.3（SwiftUI + PDFKit，Apache-2.0），vendor 于 `apps/vibereader-macos/`

## 定位

VibeReader for Mac = **PageFlow 的原生阅读体验 + VibeReader 的知识飞轮**。AI 能力不重建，全部复用本机 UniRAG 服务（HTTP 127.0.0.1:8766）与既有契约（`reader-unirag-memory-v1`）。与 Tauri 版 Reader 共享同一个 UniRAG 实例与数据。

## 里程碑

### M0 · 底座就绪（已完成 2026-08-31）
- [x] 克隆 PageFlow v1.5.3 → `apps/vibereader-macos/`，去 git 历史
- [x] Xcode 16.4 / macOS 15.5 编译通过并成功启动（ad-hoc 签名）
- [x] 旧工具链兼容补丁：上游假设 Xcode 26 的 `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`（本机 16.4 静默忽略该设置），已用 `#if compiler(>=6.2)` 隔离 Liquid Glass / NSGlassEffectView（旧系统走作者自带的 HUD 降级路径）、补齐四处 @MainActor 显式标注、deinit 用 `nonisolated(unsafe)` 内联清理
- 待办：无签名证书，分发前需配置开发者证书（见风险）

### M1 · 品牌与安全治理（下一步，先行）
1. **改品牌**：target 名 / Bundle ID / 显示名 → VibeReader for Mac（PageFlow 名称只留 LICENSE/NOTICE 署名）
2. **必须禁用 Sparkle 自动更新**：PageFlow 会检查原作者的更新服务器，fork 后必须摘除或指向我们自己的 feed——否则用户会被引导安装原作者版本
3. README 顶部加 fork 声明与 Apache-2.0 合规说明

### M2 · UniRAG 接入层（Swift 侧基础设施）
- `UniRAGClient`（URLSession，async/await）：`/api/health`、`/api/query`（includeMemory）、`/api/ingest/jobs`(+轮询)、`/api/memory/jobs`
- 请求侧 camelCase / 响应侧 snake_case，与契约 v1 对齐；复用 fixtures 做对拍测试思路（Swift 测试读 `packages/shared-contracts/`）
- 服务状态 UI：工具栏指示器（对应 Reader 的 health 30s 轮询语义），不可用时 AI 功能显式降级（本地全文搜索仍在）

### M3 · 带引用问答（核心差异化）
- 阅读侧 QA 面板：问当前文档 → 前置 `POST /api/ingest/jobs`（若未入库）→ `POST /api/query`
- **citation → PDFKit 跳转映射**（对应 Reader 的 grounding jump）：`citation.page` → PDFKit 目标页；`citation.text/span` → `PDFDocument.findString` 高亮。注意 D14 教训：UniRAG 的 parsed sidecar 已修复 PDF span 定位，Mac 端直接受益
- 引用卡片 UI：verified/similarity 徽标（对齐 Reader 的语义）

### M4 · 知识飞轮写回
- 标注/书签/选区问答沉淀 → `POST /api/memory/jobs`（artifactType 沿用 Reader 现值：reading_note 等，不收束，透传）
- 入库链接状态本地持久化（SwiftData 或 UserDefaults），避免 Reader 端 D4 的旧坑
- 与 Tauri 版共读同一记忆库：任一端保存，另一端提问可召回

## 风险

| 风险 | 对策 |
| --- | --- |
| 无 Apple 开发者证书，本机只能 ad-hoc 签名 | 开发期用 `CODE_SIGN_IDENTITY="-"`；分发是后置问题，届时用户决策是否入 $99/年 开发者计划 |
| PageFlow 要求 macOS 15+ | 与现有用户群契合度未知，但本机 15.5 达标；不做向下兼容 |
| 上游 PageFlow 演进无法自动跟进 | vendor 模式，按需 cherry-pick；不做 submodule |
| Sparkle 指向原作者服务器 | M1 强制摘除（见上） |
