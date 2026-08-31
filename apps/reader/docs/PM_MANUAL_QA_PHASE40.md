# Phase 40 PM Manual QA

目标：让产品经理可以直接测试当前桌面开发版，而不是只看自动化测试结果。

## 当前可测形态

- 主形态：Tauri 桌面 App 开发版。
- 辅助形态：浏览器 Web 开发面，用于快速 UI 和自动化测试。
- 本轮建议测试对象：Tauri 桌面 App。

## 启动方式

在项目根目录运行：

```bash
npm run tauri:dev
```

启动成功后，应看到 `VibeReader Dev` 桌面窗口。

## 推荐测试文件

优先使用：

```text
demo-assets/create-vibecard-sample.md
```

这份文件专门用于验收 `Create VibeCard`，包含 Problem、Method、Evidence、Limitation 四个段落，正常情况下足够生成 3 张 source-grounded VibeCards。

## BDD 验收清单

### 场景 1：桌面应用能启动

Given 我在项目根目录运行 `npm run tauri:dev`
When Tauri 编译完成
Then 我应该看到 VibeReader 桌面窗口

通过标准：

- 窗口打开。
- 左侧能看到文件入口。
- 右侧能看到 Chat / Summary / Cards / Attention / Notes / Tasks 等工作区。

### 场景 2：能打开测试文档

Given VibeReader 桌面窗口已经打开
When 我点击打开文件并选择 `demo-assets/create-vibecard-sample.md`
Then 中间阅读区应该显示 Markdown 文档内容

通过标准：

- 能看到 `Create VibeCard Acceptance Sample` 标题。
- 能看到 Problem、Method、Evidence、Limitation 段落。
- 应用没有崩溃或永久 loading。

### 场景 3：Create VibeCard 有写入确认

Given 测试文档已经打开
When 我进入右侧 `Tasks` 并点击 `Create VibeCard`
Then 系统应该弹出确认框

通过标准：

- 弹窗标题是 `Create VibeCard`。
- 弹窗说明会为当前文档创建至少 3 张带来源的 VibeCard。
- 点击 Cancel 后不应生成卡片。

### 场景 4：确认后生成至少 3 张卡

Given 测试文档已经打开
And 我已经点击 `Create VibeCard`
When 我在确认框里点击 `Create VibeCard`
Then 右侧应该自动切到 Notes / VibeCards 区
And 应该看到至少 3 张新卡片

通过标准：

- 至少 3 张卡片可见。
- 每张卡都有标题。
- 每张卡都有原文摘录。
- 每张卡都有 AI 内容。
- 每张卡都有来源位置，例如页码或 paragraph id。

### 场景 5：卡片内容能被产品经理读懂

Given 右侧已经显示 VibeCards
When 我逐张查看卡片
Then 我应该能判断这张卡来自文档里的哪个观点

通过标准：

- Problem 卡能对应问题段落。
- Method 卡能对应方法段落。
- Evidence 卡能对应证据段落。
- 卡片不是空 JSON，也不是只有类型标签。

## 失败记录模板

如果测试失败，请按这个格式记录：

```text
失败场景：
操作步骤：
实际看到：
期望看到：
截图/录屏：
是否可重复：
```

## 本轮不验收

- 不验收最终安装包。
- 不验收云模型 planner。
- 不验收 Anki / Obsidian 新导出。
- 不验收 spaced repetition。
- 不验收多平台 Windows 打包。
