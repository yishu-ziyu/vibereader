# 动态工作流与 Looper 评测集成

## 当前状态
- Looper 评测环已初始化于 `loops/eval/` 目录。
- `loop.yaml` 已配置完成。

## 评测机制
- **执行命令**: 通过 `python -c` 调用 UniRag 的 `query` 接口。
- **评判维度**:
  - 准确性 (40%): 无幻觉、基于事实。
  - 引用验证 (35%): 正确标记 `[doc_id:chunk_id]`。
  - 风格匹配 (25%): 符合学术腔调。
- **分数线**: 单项 ≥7.0 且总分 ≥7.5。
- **最大迭代**: 3次（遇瓶颈自动停机）。

## 调优策略
如果评测失败，Looper 仅被授权修改以下文件（收敛控制）：
- `src/uni_rag/llm/prompts.py` (微调提示词)
- `src/uni_rag/config.py` (调整过滤或相似度阈值)
绝不允许修改核心的 Pipeline 或 VectorStore 逻辑。

## 如何运行
1. 进入目录: `cd loops/eval`
2. 运行脚本: `./run-loop.py`
3. 观察 Looper 输出，并在达到 `max_iterations` 或 `PASS` 后检视代码变更。