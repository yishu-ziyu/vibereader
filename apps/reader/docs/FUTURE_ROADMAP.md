# VibeReader 未来规划（2026-06-28 起）

## 当前完成面

| 模块 | 状态 |
|------|------|
| 首次启动引导 | ✅ |
| 使用指南 | ✅ |
| 模型配置独立组件 | ✅ |
| 17+1 provider 预设 | ✅ |
| 模型能力标签 | ✅ |
| 测试连接 / 导入导出 | ✅ |
| Source Index + Retry | ✅ |
| Task Status Panel | ✅ |

## 下一阶段规划（按 yishuship 优先级）

### Phase 44 — 模型配置 UX 深化（P1 收尾）

**目标**：让模型配置从「能用」变成「值得用」

1. **能力探测**
   - 在测试连接成功后，调用 `models` endpoint 自动列出可用模型，写入 preset
   - 模型支持 vision / tool_use / context_length 自动探测（基于首次 response metadata）
   - 探测结果用 chip 显示在配置行

2. **多 Key 轮询**
   - 同一 provider 支持多个 API Key（备用额度）
   - 失败时自动 fallback 到下一个 Key
   - 状态显示当前 active key（不暴露完整 key）

3. **Provider 健康度**
   - 后台定时 ping 配置的 provider，记录延迟和失败率
   - 配置列表旁边显示 🟢🟡🔴 状态
   - 连续失败 N 次自动降级（标记为 unavailable，不影响其他）

### Phase 45 — 阅读体验增强

> **PDF 阅读体验线（DEC-0008，参考 PageFlow）**：P0 已完成——PDF 提取文本持久化（消架构债 D8）+ 阅读位置记忆（页码/滚动/缩放跨重开恢复，`documents.reading_position` 列）。下一批：P1 多标签（与下方「多文档工作区」合并设计，避免两套标签实现）+ 书签（复用 annotations 表）；P2 视图模式（单页/连续/双页）+ 阅读位置与 UniRAG 入库状态联动。

1. **PDF OCR 流水线化**
   - 当前 OCR 只支持单页
   - 升级为「OCR 整本」选项，长 PDF 分批处理
   - 进度可视化（5/82 页）

2. **多文档工作区**
   - 现在一次只能看一个文档
   - 支持同时打开多文档，左右分屏 / Tab 切换
   - 跨文档搜索（基于 Source Index）

3. **笔记双向链**
   - 笔记（Artifacts）和 PDF 段落双向跳转
   - 反向链接面板：当前段落被哪些笔记引用
   - 形成知识网络而不是线性记录

### Phase 46 — 任务系统产品化（最关键）

当前 TaskStatusPanel 只显示状态，不能操作。

1. **任务类型扩展**
   - Source Index（已有）
   - Summary Generation
   - Attention Analysis
   - Card Generation
   - 全文翻译
   - 全文 OCR
   - 多文档聚合分析

2. **任务运行时**
   - 后台 executor（目前是同步触发）
   - 优先级队列 + 取消 token
   - 进度事件流（SSE / Tauri event）
   - 失败自动重试 + 指数退避

3. **任务编排**
   - 用户定义 pipeline：「读完 PDF → 自动跑 OCR → 自动生成摘要 → 自动做闪卡」
   - 可视化 DAG 编辑器
   - 任务间共享 context

### Phase 47 — 桌面能力（Tauri v2 专属）

1. **文件关联**
   - macOS 注册 `.pdf` 文件双击用 VibeReader 打开
   - URL Scheme：`vibereader://doc/{id}`

2. **系统托盘**
   - 快速新建笔记 / 截图 OCR
   - 全局快捷键

3. **离线优先**
   - Service Worker 缓存核心数据
   - Tauri 本地 SQLite 替代 IndexedDB
   - 离线时禁用 AI 但保留阅读功能

### Phase 48 — 协作与分享

1. **导出为可分享网页**
   - PDF + 笔记 → 静态网页（含 Source Index 可点击跳转）
   - 类似 GitBook 的体验

2. **多人批注**
   - 邀请他人对同一 PDF 添加批注
   - 实时同步（CRDT）
   - 讨论线程

3. **知识库聚合**
   - 多 PDF 跨文档搜索
   - 自动发现重复引用
   - 研究主题时间线

## 待修复（技术债）

| 优先级 | 项目 | 影响 |
|--------|------|------|
| 高 | ChatInput 模型选择器点击 vs ChatInput 状态同步 | 用户切换 config 后还需刷新 |
| 高 | `useForm` 警告 | AntD 已知行为，但 modal 频繁开启关闭可能影响其他 form |
| 中 | 18 个 preset 在 import 后变成 UI 混乱 | 已修复（filter）但导入按钮 label 应该更明确 |
| 中 | 暗色模式缺测试 | `prefers-color-scheme: dark` 走通，但没用 Playwright 验证 |
| 低 | i18n 英文版部分字段未翻译 | `t()` fallback 到中文，但部分 label 硬编码 |
| 低 | 配置导出格式没有 schema 版本号 | 未来加新字段会有兼容问题 |

## yishuship 状态机改进

1. **状态持久化**：`.ship/state.yaml` 当前只在本地，跨 session 丢失
2. **任务历史**：`.ship/tasks/` 累积的文件太多，需要索引页
3. **Phase 自动进入**：根据文件改动类型自动判断 `intake / design / loop / qa` 哪个 phase

## 与 yishuship 双 Agent 工作流的衔接

下一步：

1. 完成当前任务 commit + push（已做）
2. yishuship 状态机记录 Cycle 1 结果
3. 用户决定是否启动 Cycle 2 修 P2 bug，还是进入 Phase 44
4. Cycle 2 之前先建立 baseline test suite（当前 8 files / 44 failed 是 jsdom localStorage 问题，与本项目无关）
EOF