# CLAUDE.md

This file exists because LLMs make predictable mistakes when writing code. Not random mistakes. The same ones, over and over. I've watched it happen enough times to write them down.

These are not suggestions. These are rules. Follow them and you'll produce code that doesn't need to be rewritten. Ignore them and you'll produce code that looks impressive and breaks in production.

## 1. Read Before You Write

The single biggest source of bad LLM code is not reading the existing codebase before writing new code. You see a task, you pattern-match to something in your training data, and you start generating. This is almost always wrong.

Before writing anything:
- Read the files you're about to modify. Not skim. Read.
- Look at how similar things are done elsewhere in the project. If there's a pattern for AI routes, follow that pattern. If there's a utility function that does half of what you need, use it.
- Check the imports at the top of the file. They tell you what libraries this project actually uses. Don't introduce axios if the project uses fetch everywhere.
- Look at the test files. They tell you what the expected behavior actually is, not what you think it should be.

The failure mode here is obvious: you generate "correct" code that's completely alien to the codebase it lives in. It works but it looks like a different person wrote it (because a different entity did). The human then has to either rewrite it to match the project style or live with inconsistency forever. Both are bad.

If you're not sure how something is done in this project, say so. "I don't see a pattern for X in the codebase, should I follow the approach in Y or do something different?" is always better than guessing.

## 2. Think Before You Code

Don't start writing code until you've figured out what you're actually doing. This sounds obvious but it's the most common failure mode.

What this looks like in practice:

**State your assumptions.** If the user says "add a feature" that could mean many things. Don't pick one silently. Say what you're assuming. If you're wrong, you've lost 10 seconds. If you silently guess wrong, you've lost an hour.

**Name the tradeoffs.** Almost every implementation choice has a tradeoff. If you're adding something, say what it costs. The user might say "actually I don't want that complexity." Better to know before you write 200 lines.

**If multiple approaches exist, present them briefly.** Not five. Two, maybe three. With a recommendation. "Option A is simpler but doesn't handle edge case X. Option B handles everything but adds a dependency. I'd go with A unless you expect X to actually happen."

**If something is confusing, stop.** Don't fill confusion with plausible-sounding code. The result of generating code when you don't understand the requirements is code that passes a casual review but fails when it matters. Just say what's confusing and ask.

## 3. Simplicity

Write the minimum amount of code that solves the problem. Not the minimum amount of code you can imagine theoretically solving the problem. The minimum amount that actually solves this specific problem right now.

The instinct to over-engineer is strong. Resist it.

```js
// bad: you wrote this
class EmailService {
  constructor(provider, templateEngine) {
    this.provider = provider
    this.templateEngine = templateEngine
  }
  async send(template, context, recipient, **kwargs) {
    const rendered = this.templateEngine.render(template, context)
    await this.provider.send(recipient, rendered, **kwargs)
  }
}

// good: you should have written this
async function sendWelcomeEmail(user) {
  await sendEmail(user.email, 'Welcome', `Welcome ${user.name}!`)
}
```

**Premature abstraction.** You need one thing. You write a system that supports five. Write the one thing. If they need more later, they'll ask.

**Speculative error handling.** You wrap everything in try/catch for errors that can't happen. You validate inputs that come from your own code and are already validated upstream. Every line of error handling is a line someone has to read and understand. Only handle errors that can actually occur.

**Unnecessary configurability.** You make the batch size a parameter. You make the retry count configurable. You add environment variables for things that will never change. Configuration is not free. Every config option is a decision someone has to make. Hardcode things until there's a real reason not to.

**Dead flexibility.** Interfaces with one implementation. Abstract base classes with one child. Generic type parameters only ever instantiated with one type. These things have a cost (cognitive overhead, indirection, more files to navigate) and zero benefit until a second implementation actually exists.

The test for simplicity: show your code to someone unfamiliar with the project. If they have to ask "why is this abstracted like this?" and the answer is "in case we need to..." then you've over-engineered it. "In case we need to" is not a requirement. It's a guess about the future, and guesses about the future are usually wrong.

## 4. Surgical Changes

When you edit existing code, your diff should be as small as possible. Every line you change is a line that could introduce a bug, a line someone has to review, and a line that shows up in git blame forever.

**Don't touch what you weren't asked to touch.** If you're fixing a bug in function A and you notice function B has a weird variable name, leave it. If function C has a comment with a typo, leave it. If the import order doesn't match your preference, leave it. Your job is to fix the bug in function A.

**Match the existing style.** If the file uses single quotes, use single quotes. If the file uses `snake_case`, use `snake_case`. If the file has no semicolons, don't add semicolons. If the file uses `var` (yes, even in 2025), use `var` in your additions unless the user asked you to modernize. Consistency within a file beats your personal preference.

**Clean up after yourself, not after others.** If your change makes an import unused, remove that import. If your change makes a variable unused, remove that variable. If your change makes a function unused, remove that function. But only if YOUR change caused it. Pre-existing dead code is not your problem unless someone asked you to clean it up.

**Don't reformat.** Don't run prettier on a file that wasn't formatted with prettier. Don't change indentation from 4 spaces to 2. Don't reorder imports alphabetically if they weren't alphabetical before. Reformatting creates massive diffs that hide your actual changes and make code review painful.

The test: look at your diff. Can you justify every single changed line with a direct connection to what was asked? If any line is there because "while I was in there I thought I'd..." then revert it.

## 5. Verification

The difference between code that works and code you think works is testing. You should be paranoid about this distinction.

**Write the test first when fixing bugs.** Before you fix anything, write a test that reproduces the bug. Run it. Watch it fail. Then fix the bug. Run the test. Watch it pass. This is not optional and not TDD dogma. It's the only way to prove you actually fixed the thing and didn't just make the symptoms go away.

**Run existing tests before and after your changes.** If tests passed before your change and fail after, you broke something. This is obvious. What's less obvious: if tests were already failing before your change, say so. Don't silently ignore pre-existing failures and let your changes get blamed for them.

**Don't write tests for the sake of writing tests.** A test that checks whether a constructor sets properties is worthless. A test that checks whether your validation actually rejects bad input is valuable. Test behavior, not implementation. Test the interesting cases, not the trivial ones.

**If you can't write a test, say why.** Sometimes the architecture makes testing hard. That's useful information. "I can't easily test this because the database calls are tightly coupled to the business logic" is a signal that something might need to be restructured. Don't just skip testing and hope.

## 6. AI Service Rules

Vibero is an AI-powered reading tool. The AI service layer is the most sensitive part of the codebase. These rules are not suggestions.

**All AI calls go through `aiService.js`.** No exceptions.

```js
// WRONG: importing the adapter directly
import customOpenAIService from './customOpenAIService'
await customOpenAIService.sendMessage(...)

// RIGHT: going through the unified entry
import { sendMessage } from './aiService'
await sendMessage(messages, modelConfig)
```

`customOpenAIService.js` and `customAnthropicService.js` are internal adapters. They are not public API. Components should never import them directly.

**Never hardcode API keys.** Not in source, not in comments, not in test fixtures that get committed. Keys come from `modelStore` (user-configured) or environment variables.

**Streaming must handle disconnection.** When a stream drops, the user should see a clear error state, not a half-written message hanging in the chat. This is not optional — it's the #1 source of "the app froze" bug reports.

**Errors must be user-facing.** Don't throw raw error objects to the UI. Use `chatHardFailureContent.js` to build messages a human can understand. "API returned 401" is not a user message. "Your API key appears to be invalid. Please check your settings." is.

**Cost awareness for summaries.** Document-level summarization calls the AI on the entire paper. This is expensive. Always process in chunks for documents over 10 pages. Flag the cost in the UI so the user knows what they're triggering.

## 7. Visual System (DESIGN.md)

DESIGN.md is not a suggestion box. It is the source of truth for every pixel on screen.

Before writing any new UI component:

1. Read DESIGN.md. Not skim. Read the relevant section.
2. Use the design tokens defined there (`--bg-base`, `--text-primary`, `#2B7FD8`, etc.)
3. Follow the component patterns (card, button, tab bar) exactly as specified.
4. Check the Forbidden List. If your idea is on it, don't do it.

```css
/* WRONG: inventing your own colors */
.chat-bubble {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
}

/* RIGHT: using design tokens */
.chat-bubble {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
}
```

If DESIGN.md doesn't cover your component, add it to DESIGN.md first, then write the component. Don't write the component and hope it looks right.

## 8. Zustand Store Rules

```js
// WRONG: putting UI logic in the store
const useChatStore = create((set) => ({
  messages: [],
  isInputFocused: false,      // ← this is UI state, not data
  activeTab: 'chat',           // ← this is UI state, not data
  scrollToBottom: () => { ... } // ← this is a side effect, not data
}))

// RIGHT: store holds data and data operations only
const useChatStore = create((set, get) => ({
  messages: [],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  clear: () => set({ messages: [] }),
}))
```

- Each store owns exactly one domain. If a store starts handling two unrelated things, split it.
- No async logic inside stores. Fetch in the component, call the store action with the result.
- No component references in stores. Stores don't know that React exists.
- Selectors belong in the component or a separate `*Selectors.js` file, not inside the store creator.

## 9. PDF Reader Rules

`pdfService.js` extracts text. `PdfViewer.jsx` renders. These are the only two files that touch PDF logic.

- Don't modify pdf.js source code. Ever.
- Don't extract text in the renderer component. Call `pdfService`.
- Files over 50MB must show a warning before loading. Silent freezing is not acceptable.
- Text extraction failures must produce a user-facing message, not a console error. Use `NO_PAPER_CONTEXT_MSG` pattern.

## 10. Tauri Rules

When you need to do something that touches the OS, you're writing Rust code or calling Tauri APIs. Don't reach for Node.js equivalents.

```js
// WRONG: Node.js fs in a Tauri app
import fs from 'fs'
fs.readFileSync(path)

// RIGHT: Tauri filesystem plugin
import { readTextFile } from '@tauri-apps/plugin-fs'
const content = await readTextFile(path)
```

- File dialogs: `@tauri-apps/plugin-dialog`
- File I/O: `@tauri-apps/plugin-fs`
- HTTP requests: `@tauri-apps/plugin-http`
- Notifications: Tauri notification API, not `new Notification()`

The Rust layer (`src-tauri/src/`) is where you wrap OS operations. Don't expose raw Rust commands to the frontend. Wrap them with meaningful names and validation in the Rust layer first.

## 11. Package Manager

**pnpm only.** The project already has `node_modules`. Running `npm install` anywhere in this project will create `package-lock.json` conflicts and break things.

```bash
# install
pnpm install

# never
npm install     # ← don't
npm i           # ← don't
yarn add        # ← don't
```

If a command doesn't work with pnpm, that's a bug to fix, not a reason to switch package managers.

## 12. Commit Messages

```
<type>: <description under 50 chars>

<optional body — explain WHY, not what>
```

Types:
- `feat` — new functionality
- `fix` — bug fix
- `refactor` — code change that neither fixes a bug nor adds a feature
- `docs` — documentation only
- `style` — formatting, missing semicolons, etc. (no logic change)
- `test` — adding or updating tests
- `chore` — build process, dependencies, tooling
- `perf` — performance improvement

```
feat(chat): add image upload support to chat input
fix(pdf): handle empty text layer without crashing
refactor(ai): extract error formatting to shared util
docs: add Tauri setup instructions to README
chore: upgrade antd to 5.22
```

Scope prefixes (use these):
- `(chat)` — AI chat functionality
- `(pdf)` — PDF reader
- `(ai)` — AI service layer
- `(store)` — Zustand stores
- `(ui)` — interface / styles
- `(tauri)` — desktop shell

Bad commit messages: "fix stuff", "update", "wip", "changes". These tell the next person nothing.

## 13. Never Do These

These are the patterns I see most often. If you catch yourself doing any of them, stop.

**The Kitchen Sink.** Asked to add one feature, you restructure half the codebase "while you're at it." Don't. Do the one thing.

**The Wrong Abstraction.** You build a beautiful generic solution to a problem that only exists in one place. Duplication is far cheaper than the wrong abstraction. Copy-paste twice before you abstract.

**The Invisible Decision.** You make an architectural choice (database schema, API shape, auth strategy) without flagging it as a decision. These choices are hard to reverse and the user should be aware you made them.

**The Optimistic Path.** You write code that handles the happy path perfectly and ignores or crashes on everything else. Think about what happens when the API returns 500. When the file doesn't exist. When the user submits an empty form.

**The Knowledge Hallucination.** You confidently use an API that doesn't exist, a parameter that was removed two versions ago, or a library feature you're imagining. If you're not 100% sure a method exists with this exact signature, say so. Check the docs. Look at the actual source code in the project.

**The Style Drift.** You write code in your "preferred" style instead of matching the project. Functional patterns in a codebase that uses classes. TypeScript patterns in a JavaScript project. Match the codebase, not your preferences.

**The Runaway Refactor.** You start fixing one thing. It touches another thing. That touches another. Twenty minutes later you've changed 15 files and you're not sure what you originally set out to do. If a fix is cascading, stop. Tell the user what's happening. Get buy-in before continuing.

## 14. yishuship — Project State Machine

yishuship is the project's persistent state machine. It tracks phase across sessions, decides when to enter `/loop` and when to exit, and prevents context drift between conversations.

### 14.1 The state file

Before doing any work, read `.ship/state.yaml`:

```yaml
phase: design        # idle | intake | design | loop | qa | handoff
activeTask: null     # task ID or null
blocked: []          # list of blocking reasons
completedMilestones: []
lastSync: "2026-06-27"
```

If `.ship/` does not exist, initialize it:

```
mkdir -p .ship/tasks
```

This is not optional. Without it, every new session starts blind.

### 14.2 Phase state machine

```
┌─────────┐
│  idle    │ ← 新会话启动，读 state.yaml
└────┬────┘
     │ 有新任务？
     ▼
┌─────────┐    No    ┌─────────┐
│  intake  │ ──────── │  idle   │
│  (PM)    │          └─────────┘
└────┬────┘
     │ 决策：做 / 不做 / 待定
     ▼
┌─────────┐   设计完成   ┌─────────┐
│  design  │ ──────────► │   loop   │ ← 自动进入
│          │             │ (build) │
└─────────┘             └────┬────┘
                            │ 全绿
                            ▼
                       ┌─────────┐
                       │   qa     │ ← 自动进入
                       └────┬────┘
                            │ 通过
                            ▼
                       ┌─────────┐
                       │ handoff  │ ← PR + merge
                       └────┬────┘
                            │ 完成
                            ▼
                       ┌─────────┐
                       │  idle    │ ← 回到等待状态
                       └─────────┘
```

- **idle → intake**: New task arrives
- **intake → design**: PM decision is "build it"
- **design → loop**: Plan is ready. Auto-enter `/loop` — no prompt needed
- **loop → qa**: ALL GREEN. Auto-run E2E verification
- **qa → handoff**: QA passes. Generate PR
- **handoff → idle**: PR merged. Wait for next task

### 14.3 When to auto-enter /loop (no user prompt needed)

满足以下任一条件时，中枢自动进入 `/loop`：

1. `design` 阶段产出了 `plan.md`，且 `run_state.yaml` status 是 `pending` 或 `failed`
2. 上一轮 loop 因停止条件退出（非成功），有明确失败项
3. 用户说"继续"、"接着做"、"修一下" → 默认指继续当前活跃任务

### 14.4 When NOT to enter /loop

以下情况不进 loop：

1. 用户说"看看"、"了解一下" → 调研，不是执行
2. 用户说"帮我看看这段代码" → review，不是 build
3. 没有 `plan.md`，用户说"做个功能" → 先走 PM intake
4. loop 已连续失败 2 次同一问题 → 停止升级

### 14.5 When to exit /loop and what's next

| loop 结果 | 下一步 | 中枢动作 |
|-----------|--------|---------|
| ALL GREEN | QA | 自动跑 `pnpm test:e2e` 验证关键流程 |
| QA 通过 | Handoff | 生成 PR，附上 commit message |
| QA 失败 | 回到 loop | QA 失败项作为新的 loop 任务 |
| 停止条件触发 | 升级 | 向用户报告：轮次、失败项、已尝试方法、判断 |
| 5 轮用尽 | 升级 | 同上 |

### 14.6 Autonomy boundaries

**中枢可以自主决定的：**
- 进入哪个 phase（读 state.yaml 判断）
- 执行哪个检查命令（读 package.json scripts）
- 是否进入 loop（根据任务复杂度和是否有 plan）
- 循环轮次的推进

**中枢必须问用户的：**
- 需求模糊（"改善阅读体验" → 先问具体要什么）
- 范围变更（loop 执行中用户加了新需求 → 确认是当前任务还是新任务）
- 停止条件触发（汇报后等用户决定）
- 架构决策（选择 A 还是 B）

### 14.7 Session startup protocol

每次新会话启动时：

```
1. 读 .ship/state.yaml → 知道当前 phase 和活跃任务
2. 如果有活跃任务 → 读 plan.md + run_state.yaml
3. 判断并给用户一句话汇报：
   - 有 plan + pending/failed → "上次有未完成的任务，要继续吗？"
   - 有 plan + done → "任务已完成，要开始新的吗？"
   - 无活跃任务 → "项目空闲，要开始什么？"
4. 等用户确认
```

### 14.8 Task tracking

任务 ID 格式：`vibero-YYYYMMDD-NNN`

每个任务的目录结构：

```
.ship/tasks/vibero-20260627-001/
  input/requirement.md    ← 原始需求（用户原话）
  pm/decision.md          ← PM 决策（做不做、范围、优先级）
  plan/spec.md            ← 设计 spec（架构、API、数据流）
  plan/plan.md            ← 可执行计划（给 loop 的输入）
  control/run_state.yaml  ← 状态机（phase、iteration、stop reason）
  e2e/report.md           ← QA 结果
```

### 14.9 yishuship + /loop integration

yishuship 决定**做不做**和**做完后去哪**。`/loop` 决定**怎么做**和**做到全绿**。两者通过 `.ship/tasks/<id>/control/run_state.yaml` 通信。

### 14.10 Decisions are written down

Every architectural decision gets a record in `docs/decisions/DEC-NNNN.md`:

```markdown
# DEC-001: <title>
## Context
## Options Considered
## Decision
## Consequences
```

### 14.9 DEVLOG.md is the project memory

Every merged PR appends one entry to `DEVLOG.md`:

```markdown
### 2026-06-27 — feat(chat): add drag-to-resize panels
- What: ...
- Files: ...
- Risk: ...
```

### 14.10 Scope vocabulary alignment

yishuship phases and commit scopes share the same vocabulary:

| yishuship phase | Commit scope | Deliverable |
|----------------|-------------|-------------|
| PM Intake | — | `pm/decision.md` |
| Design | — | `plan/spec.md` |
| Dev | `(chat)`, `(pdf)`, `(ai)`, etc. | Code + tests |
| QA | — | `e2e/report.md` |
| Handoff | — | PR merged |

### 14.11 When to invoke yishuship

- "I want to build X" → PM Intake first
- "Can we add Y?" → PM Intake (product decision)
- "How do we implement Z?" → Design phase
- "Ship it" → Handoff phase
- Starting any new session → Read `.ship/state.yaml` first (automatic)

If the request is vague, yishuship asks clarifying questions before routing. This is not failure — it's the system working as designed.

## 15. Loop Engineering — Default Development Rhythm

For any task that takes more than three steps or involves non-trivial decisions, use `/loop` wrapped around `/goal`. Loop engineering is not optional tooling — it is how this project develops.

Loop Engineering 的核心思路：把写代码和查代码拆成两个 Agent，让编排器循环调度，查到全绿为止。

### 15.1 The three files

Loop Engineering 只需要三个文件。

#### File 1: Builder agent (`.claude/agents/builder.md`)

只负责写和修代码。不检查，不验证，不评估自己的输出。

```yaml
---
name: builder
description: 负责编写和修复代码。用于实现任务或修复 checker 发现的失败。
tools: Read, Write, Edit, Glob, Grep, Bash
model: sonnet
---

你只负责构建和修复，不做其他任何事情。

## 接到任务时
1. 先读项目的 CLAUDE.md、README、package.json，理解架构分层和编码约定。
2. 确认任务涉及的文件范围。
3. 写一行任务简报：目标、涉及文件、完成标准。然后开始实现。

## 接到修复请求时
1. 逐条阅读 checker 报告的失败项，每条失败都要读到 file:line。
2. 定位根因。区分症状和病因：测试失败是症状，代码逻辑错误是病因。修病因，不要修症状。
3. 一次只修一个根因。
4. 不要顺手重构不相关的代码。

## 红线
- 绝不弱化测试来让它通过。修代码，不是修测试。
- 绝不通过删除、注释、跳过失败的检查来达到通过。
- 绝不在没有跑过检查的情况下声称已修复。
```

#### File 2: Checker agent (`.claude/agents/checker.md`)

只负责检查，绝不修改代码。tools 字段没有 Write 和 Edit — 这是硬隔离，不是靠提示词约束。

```yaml
---
name: checker
description: 运行所有检查并报告失败项。在 builder 之后调用。绝不修改代码。
tools: Read, Grep, Glob, Bash
model: sonnet
---

你只检查，绝不修复。

## 发现检查命令
先读 package.json 的 scripts 字段，找出项目实际使用的检查命令。
如果项目有聚合检查命令（如 pnpm check = test + lint + tsc + format），优先跑聚合命令。

## 报告格式
- 全部通过：输出 "ALL GREEN"，然后逐项列出每项检查的名称和通过证明。
- 任何失败：输出 "FAILED"，然后逐条列出：file:line - 什么坏了 - 哪个检查抓到的
```

**关键：builder 和 checker 的 tools 字段必须不同。** builder 有 Write 和 Edit，checker 没有。这不是建议，是硬约束。如果 checker 能改代码，它就不是 checker 了。

#### File 3: Loop orchestrator (`.claude/commands/loop.md`)

这是驱动循环的核心。注册为斜杠命令 `/loop`。

```yaml
---
description: 循环运行 builder 和 checker，直到所有检查通过
argument-hint: <task>
allowed-tools: Read, Grep, Glob, Bash, Task
model: sonnet
---

以循环方式执行此任务：$ARGUMENTS

## 第 0 步：对齐目标
写一行任务简报：目标、涉及文件、完成标准。

## 循环
1. 派 builder 实现任务（或修复上一轮的失败）。
2. 派 checker 运行所有检查。
3. 如果 checker 说 ALL GREEN：停止，向我展示 diff 和检查结果。
4. 如果 checker 说 FAILED：把 checker 的完整失败报告原样转发给 builder，
   不要自己解读或过滤。builder 需要原始错误信息来定位根因。
5. 回到第 1 步。

## 轮次管理
- 最多 5 轮。每轮开始时公开声明 "Cycle N/5"。
- 如果同一失败连续出现两次，停止循环。
- 如果修复导致之前通过的检查失败，停止循环。
```

**最关键的一条指令：把 checker 的完整失败报告原样转发给 builder，不要自己解读或过滤。** Agent 在传递信息时倾向于帮忙总结，但总结会丢失行号、堆栈轨迹、中间输出这些 builder 定位根因需要的关键细节。

### 15.2 /goal must define done before coding starts

A goal without done criteria is just wishful thinking. Every `/goal` invocation must specify:

```markdown
## Goal
<What to build, one sentence>

## Done Criteria (must all pass)
1. <Testable criterion>
2. <Testable criterion>
3. <Testable criterion>

## Scope
- In: <what's included>
- Out: <what's explicitly excluded>

## Stop Conditions
- Max iterations: 5
- Same failure 2x → stop and escalate
- Regression → stop and report
```

Vague goals like "improve the chat" or "fix the bugs" are not goals. They are topics for a PM intake conversation.

### 15.3 Builder-Verifier separation

The builder implements. The verifier checks. They are never the same pass.

```js
// Wave 1: Builder implements
const buildResult = await agent('Implement plan.md', { phase: 'Build' })

// Wave 2: Verifier checks (separate agent, no builder context)
const verifyResult = await agent('Verify buildResult against plan.md criteria', {
  phase: 'Verify'
})
```

Why this matters: the builder will always find reasons why its output is correct. A separate verifier with no implementation context catches what the builder can't see.

### 15.4 Stop conditions are not suggestions

The loop MUST stop when any condition is met:

| Condition | Action |
|-----------|--------|
| All verification criteria pass | Done. Report and hand off. |
| Max iterations reached (default 5) | Stop. Report what's still failing and why. |
| Same failure 2 consecutive iterations | Stop. Builder is guessing, not fixing. Escalate. |
| Regression (new failure in previously passing check) | Stop. Report what changed. |
| No progress 2 consecutive iterations | Stop. Scope is too large. Split into smaller tasks. |

Failing to stop is worse than stopping. An infinite loop that "almost works" wastes more time than a stopped loop with a clear problem statement.

### 15.5 When to use loops vs. direct work

| Task complexity | Approach |
|----------------|----------|
| Single file, single concern | Direct edit + verify |
| 2-3 files, clear scope | Direct edit + test |
| 4+ files or architectural decision | `/loop` with `/goal` |
| Bug with unclear root cause | `/loop` (investigate → fix → verify) |
| New feature | `/loop` (design → implement → verify) |
| Refactoring | `/loop` (plan → transform → verify no behavior change) |

The bar for "/loop" is low. If you're hesitating between "just fix it" and "set up a loop," set up a loop.

### 15.6 Loop observability

Every loop run produces traceable state so a resumed session can pick up where the previous one left off:

```
.ship/tasks/<task_id>/
  control/run_state.yaml    ← iteration count, status, stop reason
  plan/plan.md              ← the plan being executed
  e2e/report.md             ← verification results
```

### 15.7 Practical pitfalls (from real loop runs)

These are the three things that waste cycles in practice:

**Builder refactors unrelated code.** Builder 修 A 的时候看到 B 有异味，顺手改了。下一轮 checker 报出 B 相关的 deadcode 警告，多花一轮。提示词写了"不要重构不相关的代码"，但 Agent 读完一圈代码后仍然有冲动把看到的问题一起改了。

**Checker report quality determines loop efficiency.** Checker 报了 FAILED 但只贴了最后一行错误信息，没带上下文。Builder 找不到根因，瞎猜了一个修法，自然没过。Checker 的报告是 Builder 的唯一信息来源，报告模糊一轮，整个循环就白跑一轮。

**Orchestrator summarizes failure info.** 编排器拿到 checker 的失败报告后，会先自己理解一遍再转述给 builder。转述过程中行号丢了、堆栈轨迹丢了。Builder 拿到的不是原始错误而是二手解读，定位效率大幅下降。提示词里必须写好「不要解读或过滤」，否则编排器觉得自己在帮忙，实际在制造信息损耗。

### 15.8 Integration with yishuship

yishuship routes to `/loop` when the task is non-trivial:

```
"Build a new summary panel"
  → PM Intake: is this a new feature or refactor?
  → Design: what does the panel show? What data does it need?
  → /loop /goal "Implement summary panel with X, Y, Z criteria"
  → Handoff: PR + merge
```

yishuship is the PM brain. `/loop` is the execution engine. They run together, not separately.
