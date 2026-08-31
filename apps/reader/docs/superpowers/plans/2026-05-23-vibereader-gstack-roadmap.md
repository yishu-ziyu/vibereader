# VibeReader GStack Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the local gstack standards into an executable VibeReader release-hardening roadmap, then implement Phase 8 so the current demo-ready app can become package-ready without losing the BDD/TDD discipline from Phases 4-7.

**Architecture:** Keep VibeReader's product architecture unchanged: React/Vite frontend, Tauri v2 desktop shell, local-first document services, pdf.js rendering, Zustand stores, and model/provider config in local app storage. Add governance docs and release-hardening tasks first; then implement narrowly scoped P0 items with tests before production code.

**Tech Stack:** React 18, Vite 8, Vitest, Testing Library, Playwright, Tauri v2, Rust/Cargo, pdfjs-dist, Zustand, MiniMax Anthropic-compatible API path.

---

## File Structure

```
docs/
  GSTACK_ALIGNMENT.md                  # Localized gstack norms for VibeReader
  ACCEPTANCE_AND_QA.md                 # Existing acceptance surface, update during Phase 8
  reviews/
    2026-05-23-gstack-prelanding.md    # To be created before Phase 8 completion
  superpowers/plans/
    2026-05-23-vibereader-gstack-roadmap.md
tasks/
  todo.md                              # Active phase tracker
  gstack-backlog.md                    # Structured backlog in gstack TODO format
  bdd-tdd-phase8.md                    # Phase 8 behavior spec
src/
  aiEndpoint.js                        # Existing provider endpoint routing
  aiEndpoint.test.js                   # Existing tests; extend for release path
  modelConfigGuard.js                  # Proposed config validation helper
  modelConfigGuard.test.js             # Proposed red/green tests
scripts/
  qa-smoke.mjs                         # Proposed Playwright smoke runner
```

## Phase 8 Success Criteria

- Missing, invalid, or timed-out AI provider config produces a readable user-facing error and does not leave the app stuck in loading state.
- The MiniMax path has an explicit release strategy for packaged Tauri builds: either Tauri-side HTTP/proxy or documented deployed proxy.
- The local-only smoke path can run without secrets and still proves document opening, PDF outline, annotation, Markdown selection, and layout.
- Live AI smoke can run when a key exists, but secrets are never written into git, docs, screenshots, or logs.
- A gstack two-pass pre-landing review exists under `docs/reviews/`.

## Task 1: Lock Phase 8 BDD Behaviors

- [ ] Create `tasks/bdd-tdd-phase8.md`.
- [ ] Add 4-6 Given/When/Then cases:
  - missing model config;
  - invalid API key;
  - long response Stop;
  - production provider endpoint route;
  - multi-document state isolation;
  - smoke test without secrets.
- [ ] For each behavior, explain the business rule in Chinese.
- [ ] List boundary assumptions:
  - release target is Tauri desktop;
  - MiniMax is the current proven provider;
  - Kimi remains unconfigured until a real key is recovered.

Validation:

```bash
rg -n "Given|When|Then|业务规则|边界" tasks/bdd-tdd-phase8.md
```

## Task 2: Add Model Config Guard Tests First

- [ ] Create `src/modelConfigGuard.test.js`.
- [ ] Test that a missing config returns a user-readable error.
- [ ] Test that a missing API key returns a user-readable error.
- [ ] Test that a valid Anthropic-compatible config returns runnable metadata without exposing the key.
- [ ] Run the targeted tests and confirm red for missing helper.

Expected red command:

```bash
npx vitest run src/modelConfigGuard.test.js --environment jsdom --pool=threads --testTimeout=30000
```

## Task 3: Implement Minimal Model Config Guard

- [ ] Create `src/modelConfigGuard.js`.
- [ ] Export `validateRunnableModelConfig(config)`.
- [ ] Return structured results:
  - `{ ok: true, config }`
  - `{ ok: false, message, code }`
- [ ] Update the chat send path in `src/App.jsx` only where model config is read before request dispatch.
- [ ] Ensure the UI clears loading state on validation failure.

Validation:

```bash
npx vitest run src/modelConfigGuard.test.js src/aiService.test.js --environment jsdom --pool=threads --testTimeout=30000
npm run build
```

## Task 4: Decide and Test Production AI Endpoint Routing

- [ ] Extend `src/aiEndpoint.test.js` to describe dev, browser, and Tauri packaged endpoint behavior.
- [ ] If staying with deployed proxy, document the proxy URL configuration and failure mode.
- [ ] If implementing Tauri-side HTTP, add a minimal bridge plan before code:
  - frontend endpoint resolver detects Tauri packaged runtime;
  - Rust command performs provider HTTP request;
  - frontend stream handling remains compatible or explicitly downgrades to non-streaming for the first release.
- [ ] Do not implement broad provider refactors in this task.

Validation:

```bash
npx vitest run src/aiEndpoint.test.js --environment jsdom --pool=threads --testTimeout=30000
npm run build
cd src-tauri && cargo check
```

## Task 5: Promote Playwright Smoke to a Script

- [ ] Create `scripts/qa-smoke.mjs`.
- [ ] Start or attach to the dev server.
- [ ] Use `demo-assets/outline-demo.pdf` for PDF outline and annotation.
- [ ] Use `demo-assets/sample.md` for Markdown selection injection.
- [ ] If no live API key is available, skip live AI and report `SKIPPED_LIVE_AI`.
- [ ] If a key is available through local machine config, run live send and Stop without logging the key.
- [ ] Add package script `qa:smoke`.

Validation:

```bash
npm run qa:smoke
```

## Task 6: Refresh Acceptance Docs

- [ ] Update `docs/ACCEPTANCE_AND_QA.md` with the gstack severity taxonomy.
- [ ] Add the Phase 8 release gate checklist.
- [ ] Keep existing Phase 1-7 evidence intact.
- [ ] Link `docs/GSTACK_ALIGNMENT.md` and `tasks/gstack-backlog.md`.

Validation:

```bash
rg -n "Critical|High|Medium|Low|Phase 8|GSTACK_ALIGNMENT|gstack-backlog" docs/ACCEPTANCE_AND_QA.md
```

## Task 7: Run GStack Pre-Landing Review

- [ ] Create `docs/reviews/2026-05-23-gstack-prelanding.md`.
- [ ] Critical pass:
  - API key handling;
  - production provider route;
  - cancellation races;
  - document state isolation;
  - local file read boundaries.
- [ ] Informational pass:
  - bundle warning;
  - generic document naming drift;
  - annotation overlay limitation;
  - accessibility and visual matrix gaps.
- [ ] Link all unresolved items to `tasks/gstack-backlog.md`.

Validation:

```bash
rg -n "Critical pass|Informational pass|P0|P1|tasks/gstack-backlog.md" docs/reviews/2026-05-23-gstack-prelanding.md
```

## Task 8: Final Verification Loop

- [ ] Run unit tests.
- [ ] Run build.
- [ ] Run cargo check.
- [ ] Run smoke script.
- [ ] Update `tasks/todo.md` Phase 8 checkboxes.
- [ ] Update `DEVLOG.md` with commands and results.
- [ ] If committing, use the Lore Commit Protocol from `/Users/mahaoxuan/Desktop/黑客松/AGENTS.md`.

Validation:

```bash
npm run test
npm run build
cd src-tauri && cargo check
npm run qa:smoke
git diff --check
```

## Execution Notes

- Do not weaken existing tests from Phases 4-7.
- Do not commit API keys or write them into docs.
- Do not re-open the old Zotero/Vibero fork as the mainline.
- Do not implement EPUB, annotation PDF write-back, or mobile support inside Phase 8.
- If a step exposes a larger architecture branch, document it in `tasks/gstack-backlog.md` and finish the bounded release-hardening loop first.

