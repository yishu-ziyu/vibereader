# Research Round 1 — 初始对标调研

> 2026-06-22 · 触发：前端交互优化需求 + 产品方向探索

## 本轮调研对象

### RAG 产品对标
- ChatPDF — 三栏布局、建议问题、Fast/Quality 切换
- Humata — 极简 onboarding、Summary 自动生成、页码引用
- Perplexity AI — 搜索框入口、来源卡片、追问建议
- Dify — 知识库管理、可视化 pipeline、Prompt IDE
- FastGPT — 中国式 UX、调试面板、微信/飞书登录

### 设计参考
- haoqi.design — 暗色 + 玻璃质感 + 终端美学 + 光效

### 产品架构灵感
- Obsidian — 三栏布局、Graph View、双向链接、反向链接面板
- Karpathy LLM Wiki — 三层架构（Raw Sources → Wiki → Schema）、Ingest/Query/Lint 循环
- Side sider — 文件面板 + RAG 对话并排、知识库文件列表

## 关键发现

1. 所有 RAG 产品都有"上传后建议问题"模式
2. 引用 chips 是标配，但位置信息（页码/章节）做得好的不多
3. Obsidian 的 Graph View 是知识发现的核心交互
4. LLM Wiki 的"先编译再检索"思路比传统 RAG 更适合学习场景
5. 暗色 + 玻璃质感是当前高端工具的设计共识

## 研究线索（待下一轮深入）

- [ ] Side sider 的具体 UI 布局截图和交互细节
- [ ] Obsidian Graph View 的实现方案（Cytoscape.js vs D3 vs 自绘）
- [ ] LLAM wiki 的开源实现（nashsu/llm_wiki）代码结构
- [ ] 知识图谱的力导向算法参数调优经验
- [ ] 学生场景下的知识图谱到底展示什么（概念？文件？知识点？）

## 决策记录

DEC-001: 采用暗色 + 玻璃质感作为 uni-rag 默认视觉方向
DEC-002: 采用三栏布局（文件树 / 对话 / 详情）作为核心界面结构
DEC-003: 接受 LLM Wiki 三层架构作为长期技术方向
