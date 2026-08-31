# uni-rag 质量提升 — 三路并行计划

## 目标
同时提升 UniRag 在三个维度的表现：
1. 回答质量（回答正确率高）
2. 回答风格（风格适配场景）
3. 引用可信度（引用内容可验证）

## 执行原则
Ship: Explore → Plan → Implement → Verify → Iterate
Looper: 多模型独立评审 → 合成 → 改进 → 再评审

## 三路并行的边界

### P1：回答质量（数据层）
- 范围：ingest 质量过滤层
- 不碰：prompt、检索、前端

### P2：回答风格（prompt 层）
- 范围：SYSTEM_PROMPT 适配机制
- 不碰：ingest、检索逻辑

### P3：引用验证（引用层）
- 范围：_extract_citations 回检逻辑
- 不碰：prompt、ingest

## 当前基线
- 测试：100 passed, 6 skipped（v0.3 数据）
- 回答风格：硬编码学术腔
- 引用：仅 chunk_id 存在性检查
- 无 eval 体系

## 每路流程
1. Explore — 读相关源码 + 调研方案
2. Plan — 写出具体改动计划
3. Implement — 写代码 + 测试
4. Verify — Looper 多模型评测
5. Iterate — 根据评测结果改进

## Looper 角色
每路实现完成后，用 Looper 多模型评审：
- 3 个独立 LLM 评分同一组回答
- 评分维度：准确性、完整性、风格匹配度、引用正确性
- 取中位数，低于阈值 → 回 Step 2 改进
