# uni-rag 项目开发守则

## 默认行为：所有开发从 yishuship 出发

收到任何改动请求，先调 `/yishuship:use-yishuship` 让 yishuship 自动选择最小可用路由。

新 agent 接入请先读 `AGENT_ONBOARDING.md`。

## yishuship 路由规则

| 请求类型 | 路由 |
|----------|------|
| "我想做个功能" / "加个特性" | `/yishuship:pm-intake` → `/yishuship:design`（先调研再设计） |
| "帮我规划一下" | `/yishuship:design`（对抗式设计） |
| "实现这个功能" | `/yishuship:design` → `/yishuship:dev` |
| "检查这段代码" | `/yishuship:review` |
| "测试一下能不能跑" | `/yishuship:qa` |
| "发布" | `/yishuship:handoff` |
| "全量交付" | `/yishuship:auto`（完整流程） |
| 不确定 | `/yishuship:use-yishuship`（让 yishuship 判断） |

## yishuship 核心机制

**需求在磁盘上，不在聊天里**：`.ship/tasks/<task_id>/` 存放所有产物。

**阶段隔离**：reviewer 没看过实现代码，QA 只看 spec + diff + 运行中的应用。

**对抗式设计**：host + peer 并行调查，各写 spec，diff 辩论，合并为最终 spec。

**证据分级**：
- L1（截图、curl 响应、console log）= 有效
- L2（HTTP 200、"tests passed"）= 不够
- L3（"应该能跑"）= 自动 FAIL

**fix loop**：handoff 不停在 PR 创建，CI 失败自动修最多 3 轮。

## 跳过规则（以下情况不走 yishuship）

- Typo、1 行 bug 修复、配置文件修正
- 改完能立刻验证，且不需要记录"为什么"

## 必须走 yishuship 的情况

- 涉及 UI 改动
- 涉及 2+ 文件
- 新功能或新组件
- 改动原因需要下周的你还记得

## Ponytail 集成（代码密度控制）

Ponytail 插件已安装，自动在每个 turn 注入"懒梯子"规则。

| yishuship 阶段 | Ponytail 动作 |
|----------------|---------------|
| `/yishuship:dev` | 自动生效（always-on） |
| `/yishuship:review` | `/ponytail-review` 审查 diff |
| `/yishuship:handoff` 前 | `/ponytail-audit` 全仓库扫描 |
| `/yishuship:handoff` 后 | `/ponytail-debt` 记录延迟项 |

保持 `full` 模式，不切 `ultra`。
