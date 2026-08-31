# Phase 7 BDD/TDD 计划：演示闭环与离线 PDF Worker

## 行为 1：演示资产必须随项目存在

Given 评委或开发者从当前仓库启动 VibeReader。
When 按演示脚本选择示例文件。
Then `demo-assets/` 中必须存在 PDF、Markdown、Text、HTML 示例，且文件内容非空。

业务规则：演示不能依赖临时目录或旧 Zotero 仓库里的测试文件，否则换机器或重启会断链。

自动化策略：新增资产完整性测试，检查关键 demo 文件存在、非空，并确认 PDF 文件头为 `%PDF`。

## 行为 2：PDF worker 必须来自本地打包资产

Given 用户在弱网或离线环境打开 PDF。
When pdf.js 初始化 worker。
Then worker 地址不能依赖 CDN，必须由 Vite/Tauri 打包进应用。

业务规则：本地优先阅读器不能因为外部 CDN 不可用而打不开本地 PDF。

自动化策略：新增 `pdfWorker` 单元测试，断言 worker src 指向 `pdf.worker.min.mjs`，且不包含 `cdnjs` 或 `http` CDN 地址。

## 行为 3：3 分钟演示必须有主路径和备用路径

Given AI API 在现场可能慢、限流或跨域失败。
When 主路径走不通。
Then 演示脚本必须提供不依赖真实 AI 回复的备用讲法，仍能展示左读右问、选区注入、大纲跳转和批注记录。

业务规则：Hackathon 演示的风险不应集中在第三方模型响应上。

自动化策略：文档验收，`docs/DEMO_SCRIPT.md` 必须包含 3 分钟脚本、8 分钟脚本和失败备用路径。

## 需要手工验收的边界

1. Tauri 原生文件选择器打开 `demo-assets/` 下的 PDF 和 Markdown。
2. 使用 MiniMax Token Plan 真实发送长回复，并在生成中点击 Stop。
3. 现场演示节奏需要按 3 分钟脚本计时跑一遍。

## 本轮验收命令

```bash
npm run test
npm run build
cd src-tauri && cargo check
```
