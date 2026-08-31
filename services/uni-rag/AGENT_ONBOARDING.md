# uni-rag 开发指南（yishuship 框架）

> 本文档是给下一个 agent 的完整接入指南。读完后你应该能直接开始用 yishuship 开发 uni-rag。

## 你是谁

你是 uni-rag 项目的开发 agent。uni-rag 是一个本地文档问答工具（上传文档→问问题→得到带引用的答案）。项目地址：https://github.com/yishu-ziyu/uni-rag

你使用 yishuship 框架进行开发。yishuship 是 Ship 增强版：PM 层 + 对抗式工程一体化。

## yishuship 是什么

```
PM 层（先调研再动手）
  发现 → 定义 → 设计 → 验证
                          ↓
工程层（对抗式执行）
  对抗式设计 → 实现 → 测试 → QA → 发布
```

**核心原则**：
- 没有调研就没有判断，没有判断就不进执行
- 需求在磁盘上（`.ship/tasks/<id>/`），不在聊天里
- 每个阶段必须写文件才算完成
- hooks 会强制执行流程，你不能跳步

## 可用命令

| 命令 | 什么时候用 |
|------|-----------|
| `/yishuship:pm-intake` | 新功能、产品方向（先调研再做） |
| `/yishuship:use-yishuship` | 不确定走哪条路时 |
| `/yishuship:design` | 对抗式设计（host + peer 并行调查） |
| `/yishuship:dev` | 写代码（host 实现 + peer 交叉验证） |
| `/yishuship:review` | 检查代码（只找 bug，不评风格） |
| `/yishuship:qa` | 独立 QA（启动真实应用测试） |
| `/yishuship:e2e` | 写 E2E 测试 |
| `/yishuship:handoff` | 发布（PR + CI fix loop） |
| `/yishuship:refactor` | 重构（四镜头扫描） |
| `/yishuship:auto` | 全流程状态机 |

## 路由规则

**新功能** → `/yishuship:pm-intake` → `/yishuship:design` → `/yishuship:dev`
**Bug** → `/yishuship:review` → `/yishuship:dev`
**重构** → `/yishuship:design`（refactor scope）→ `/yishuship:dev`
**不确定** → `/yishuship:use-yishuship`

## 强制执行机制

你不能跳过这些，hooks 会拦截：

1. **没有 discovery.md 就不能调 design** — pm-gate.sh 拦截
2. **PM 产出没写完就不能退出** — pm-verify.sh 拦截
3. **QA 不能读 review 结论** — phase-guardrail.sh 拦截
4. **Review 不能写源码** — phase-guardrail.sh 拦截

## uni-rag 项目状态

### 已完成

- v1.0.0 发布（2026-06-25）：核心功能 + 安全修复 + 产品文档
- v1.0.1（2026-06-25）：26 个新测试 + 定位表达重做
- 测试：198 passed / 6 skipped / 0 failed
- 安全：BM25 pickle→JSON、SSRF 防护、路径遍历防护

### 产品定位

**一句话**：问你自己的文档，数据永远不离开你的电脑。
**差异化**：NotebookLM 把文件传到 Google 服务器，uni-rag 在本地完成一切。
**三条卖点**：本地处理 / 按需选模型 / PDF+网页+视频混合来源

### 技术栈

- 后端：Python 3.13 + FastAPI + ChromaDB + SQLite
- 前端：React + TypeScript + Vite
- LLM：MiniMax / StepFun / 本地 Ollama（多 Provider）
- 测试：pytest（198 个测试）
- 包管理：uv

### 核心功能

| 功能 | 状态 | 说明 |
|------|------|------|
| 文件上传（PDF/MD） | ✅ | 含 LlamaParse 语义解析 |
| URL 入站 | ✅ | 网页/YouTube/Bilibili |
| 多 Provider 问答 | ✅ | MiniMax/StepFun/本地 |
| 引用溯源 | ✅ | 页码+段落定位 |
| 闪卡/测验/图谱 | ✅ | 知识加工模式 |
| 翻译 | ✅ | mode=translate |
| 建议问题 | ✅ | /api/suggest-questions |
| 多轮会话 | ✅ | SQLite 持久化 |
| CLI | ✅ | ingest/ask/serve |
| Docker | ✅ | docker-compose |

### 已知待改进

| 问题 | 优先级 | 说明 |
|------|--------|------|
| App.tsx 1139 行单文件 | P1 | 需要拆分组件 |
| 引用卡片不可折叠 | P1 | 用户反馈最差的体验 |
| 无速率限制 | P2 | API key 可被滥用 |
| SessionStore 并发竞态 | P2 | 高并发下可能主键冲突 |
| 前端测试只检查源码字符串 | P2 | 需要改为行为测试 |

### 产品文档

- `docs/PRODUCT.md` — 产品规格（用户、Golden Journeys、Non-goals）
- `docs/ARCHITECTURE.md` — 系统架构（Mermaid 数据流图）
- `CHANGELOG.md` — 版本变更记录
- `DEVLOG.md` — 开发日志

## 如何开始

### 场景 1：用户说"加个功能"

```
1. /yishuship:pm-intake <功能描述>
   → agent 自动执行发现→定义→设计→验证
   → 产出写入 .ship/tasks/<id>/pm/

2. 确认 PM 产出后：
   /yishuship:design
   → 对抗式设计，产出 spec.md + plan.md

3. 设计确认后：
   /yishuship:dev
   → 实现代码 + 测试

4. 实现完成后：
   /yishuship:review → /yishuship:qa → /yishuship:handoff
```

### 场景 2：用户说"修个 bug"

```
1. /yishuship:review
   → 找到 bug 的根因

2. /yishuship:dev
   → 修复 + 写回归测试

3. 验证测试通过
```

### 场景 3：用户说"看看现在有什么问题"

```
1. /yishuship:review
   → 审查当前代码

2. /yishuship:qa
   → 启动应用，探索性测试

3. 把发现的问题记录到 .ship/tasks/<id>/
```

## 项目结构

```
uni-rag/
├── src/uni_rag/
│   ├── api/          FastAPI 路由 + schema
│   ├── ingest/       文件/URL/视频入站
│   ├── rag/          RAG pipeline
│   ├── llm/          LLM 客户端（多 Provider）
│   ├── retrieve/     检索器（向量+BM25+rerank）
│   ├── cite/         引用定位+验证
│   ├── store/        ChromaDB + SQLite + BM25
│   ├── session/      会话存储
│   ├── export/       MD/PDF 导出
│   └── config.py     配置（pydantic-settings）
├── frontend/
│   └── src/App.tsx   React 前端（单文件，待拆分）
├── tests/
│   ├── unit/         单元测试
│   ├── integration/  集成测试
│   └── bdd/          BDD 验收测试
├── docs/
│   ├── PRODUCT.md    产品规格
│   └── ARCHITECTURE.md 系统架构
├── .ship/            yishuship 工作流状态
├── CLAUDE.md         项目开发守则
├── DEVLOG.md         开发日志
└── CHANGELOG.md      版本变更
```

## 关键约定

1. **环境变量**：`UNI_RAG_DATA_DIR_PATH`（数据目录）、`UNI_RAG_LLM_API_KEY`（API key）
2. **测试 fixture**：必须 `monkeypatch.setenv` + `cfg._settings = None` 重置单例
3. **前端构建**：`cd frontend && npx tsc -b`（TypeScript 检查）
4. **后端测试**：`uv run pytest tests/ --tb=short`（全量测试，~8 分钟）
5. **提交规范**：conventional commits（feat/fix/refactor/docs/test）

## 现在就开始

用户可能会告诉你要做什么。按 yishuship 路由规则选择命令，然后执行。
