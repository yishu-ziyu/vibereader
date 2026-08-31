# DEC-0010: 原生优先，Tauri 冻结；UniRAG 采用 Sidecar 打包

Date: 2026-08-31

## Context

- DEC-0009 已开建原生 macOS 版（`apps/vibereader-macos`，PageFlow fork + UniRAG），与 Tauri 版（`apps/reader`）并行。
- 用户决定把战略重心切换到原生版：**在原生底座上重新思考产品**，而非继续双线平均投入。
- 原生版要成为"官网下载即用"的产品，但 UniRAG 目前是需要命令行启动的 Python 服务（`uv run uni-rag serve`），且依赖不轻（PyTorch、嵌入模型），普通用户无法自行运行。这是"下载即用"的硬伤。

## Decision

### 1. 产品主线：原生优先（native-first）

- **主线**：VibeReader for Mac（`apps/vibereader-macos`）为唯一主力产品。
- **Tauri 版（`apps/reader`）冻结**：停止新功能开发，仅作为 AI 功能的参考实现与演示用网页版保留。
- **格式范围**：PDF 优先；Markdown / TXT / HTML 后置。
- **AI 范围（v0/v1）**：只做 UniRAG 带引用问答 + 记忆；Reading Agent 7 技能与 VibeCard 迁移后置。
- **分发渠道**：官网直接下载（不走 Mac App Store，避免沙盒对本地端口 / 文件访问的限制）。

### 2. UniRAG 生命周期：直接上 Sidecar 打包（方案 C）

跳过"引导安装"过渡方案，直接做 sidecar：

- **安装包内**：用 python-build-standalone 独立 CPython 解释器 + 依赖环境打进 `.app/Contents/Resources/unirag/`；App 启动时以子进程拉起，绑定 `127.0.0.1:8766`，退出时回收。
- **首次运行下载**：BGE-M3 + bge-reranker-base 模型（约 3.5GB 权重）下载到 `~/Library/Application Support/VibeReader/models/`；下载完成前应用可正常阅读，问答显示"知识库准备中"。
- **数据目录**：产品化后用户数据迁至 `~/Library/Application Support/VibeReader/`，保证卸载重装不丢知识库。
- **API Key**：从 `.env` 改为 macOS Keychain，App 设置页填写 → 写 Keychain → UniRAG 启动时注入。

### 3. 体积实测（2026-08-31）

| 组成 | 体积 |
| --- | --- |
| Python 依赖环境（含 PyTorch CPU） | 1.2 GB |
| BGE-M3 嵌入模型 | 4.3 GB（缓存） |
| bge-reranker-base | 1.1 GB |
| CLIP ViT-B/32（可选视觉通道） | 579 MB |

结论：全量打进安装包不现实（6GB+），必须"轻安装包 + 首次运行下载"。

## Not Chosen

- **继续双线并行**：DEC-0008 已警示三栈维护成本；平均投入会拖慢飞轮入口（阅读体验）的补齐。
- **方案 A（用户自启服务）/ 方案 B（引导启动）**：仍依赖用户本机 Python 环境，违背"下载即用"。
- **方案 D（要求装 Docker）**：对普通用户不友好。
- **全量打包模型进安装包**：体积 6GB+，不可接受。

## Consequences / 待办决策点

- **ONNX 瘦身（强烈建议列入计划）**：把 torch + sentence-transformers 换成 ONNX Runtime 跑 BGE-M3，依赖环境可从 1.2GB 压到 ~300MB，启动更快；代价是改 embedder/reranker 层 + 一轮精度对齐验证。
- **weasyprint**：依赖 pango 等系统库，是打包麻烦源；若 v0 用不到其导出能力，建议从打包依赖剔除。
- **UniRAG 分叉**：`/Users/mahaoxuan/Desktop/AI产品经理/uni-rag` 已摘为独立实验项目（见 PROJECTS.md），与 `services/uni-rag` 分叉演进；独立项目的好东西回流产品需手动合并。
- 原生版仍需移除 Sparkle 自动更新（DEC-0009 硬约束）。
