# VibeReader

这是 VibeReader 与 UniRAG 的统一产品仓库，使用 yishuship 管理产品生命周期。

这个目录现在是 VibeReader 知识飞轮的本地统一入口。只保留自己的 Reader 和 UniRAG。作者 Vibero 的本机拷贝已于 2026-08-13 删除，不再作为参考仓。

1. 统一产品叙事：以阅读为入口，以本地 RAG 为长期知识记忆。
2. 统一开发计划：把 Reader、RAG、共享协议、模型配置、测试验收放到同一张路线图里。
3. 统一项目索引：让下次开发只需要先打开这个目录。

## 当前代码位置（Canonical）

- Reader: `apps/reader`
- UniRAG: `services/uni-rag`

不要再找 `legacy/vibero`、`黑客松/_apps`、`黑客松/_downloads`。那些是作者 Vibero 的本机残留，已经删除。

详细索引见 [PROJECTS.md](PROJECTS.md)。

## 快速进入

```bash
cd /Users/mahaoxuan/Desktop/AI产品经理/vibereader

# Reader
cd apps/reader
npm run dev -- --port 3217

# UniRAG
cd services/uni-rag
uv run uni-rag serve --port 8766
```

## yishuship 生命周期入口

- 当前生命周期任务：`.ship/tasks/20260701-vibereader-knowledge-flywheel/`
- 产品类型：hybrid
- 当前阶段：`phase-1-unirag-memory-backend`
- 工程交接：`.ship/tasks/20260701-vibereader-knowledge-flywheel/delivery/design-spec.md`

## 核心文档

- [项目开发计划](docs/PROJECT_DEVELOPMENT_PLAN.md)
- [产品愿景](docs/PRODUCT_VISION.md)
- [UniRAG 集成策略](docs/UNI_RAG_INTEGRATION_STRATEGY.md)
- [运行规范：Plan / Goal / Loop](docs/OPERATING_MODEL.md)
- [竞品分析与产品规划流程](docs/COMPETITIVE_ANALYSIS_AND_PRODUCT_PLANNING.md)
- [生命周期决策记录](docs/decisions/DEC-0001-use-yishuship-lifecycle.md)
