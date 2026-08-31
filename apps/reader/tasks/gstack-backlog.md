# TODOS

This backlog follows the local gstack TODO format from `/Users/mahaoxuan/gstack/review/TODOS-format.md`. `tasks/todo.md` remains the active phase tracker; this file is the structured release-hardening backlog.

## Release Readiness

### Production-safe MiniMax/Tauri HTTP path

**What:** Replace the dev-only Vite `/api/minimax` proxy dependency with a production-safe Tauri-side HTTP/proxy path or a deployed proxy path for packaged builds.

**Why:** Phase 7 solved CORS for local dev and Tauri dev demo, but a packaged app may not have the Vite dev proxy. AI send could regress in the release build.

**Context:** `src/aiEndpoint.js` and `vite.config.js` currently cover local dev. `DEVLOG.md` records that formal packaging still needs Tauri-side HTTP/proxy or deployed proxy.

**Effort:** M

**Priority:** P0

**Depends on:** Confirm final release target: local hackathon demo only, unsigned local package, or shareable installer.

### Commit/checkpoint current demo-ready baseline

**What:** Create a clean checkpoint once Phase 8 documentation and release-hardening decisions are in place.

**Why:** The repo currently contains many valuable Phase 4-7 changes. A clean checkpoint reduces the chance of losing the known-good demo state.

**Context:** Do not commit secrets. Use the Lore Commit Protocol from the workspace AGENTS.md when committing.

**Effort:** S

**Priority:** P0

**Depends on:** `git diff --check`, tests/build status, and user-approved commit timing if external push is involved.

### Package-launch smoke test

**What:** Add a repeatable smoke checklist or script for launching the packaged or release-like Tauri app and opening demo assets.

**Why:** `npm run build` and `cargo check` are not enough to prove the desktop release surface can actually open files and talk to AI.

**Context:** Phase 7 verified `tauri dev`. Release-like packaging remains unverified.

**Effort:** M

**Priority:** P0

**Depends on:** Production-safe provider path.

## AI Connectivity

### No-key and bad-key UX gate

**What:** Add automated and manual checks for missing API key, invalid API key, provider timeout, and user-facing retry guidance.

**Why:** The demo should fail clearly instead of leaving the user with an infinite loading state or a raw network exception.

**Context:** MiniMax works with the local Token Plan key in dev, but Kimi/Moonshot was not recovered as a reusable API config. Failure states must be first-class.

**Effort:** S

**Priority:** P0

**Depends on:** Current model config storage format in localStorage/Zustand.

### Long-response Stop regression

**What:** Keep a reproducible regression for long AI responses where Stop cancels streaming and leaves partial content visible.

**Why:** Stop generating was implemented in Phase 4 and verified again in Phase 7. It is core to trust during live demos.

**Context:** Existing tests cover AbortController behavior. Add a Playwright smoke path if the provider path changes.

**Effort:** S

**Priority:** P1

**Depends on:** Production-safe provider path.

## Reader Experience

### Multi-document state isolation

**What:** Verify opening PDF, Markdown, Text, HTML, and another PDF does not leak page number, selection, annotations, or injected context across documents.

**Why:** VibeReader is now a general reader. State leakage would undermine the "read anything" direction.

**Context:** Phase 5 added non-PDF readers; Phase 6 added PDF annotations; Phase 7 added demo assets. Cross-document transitions now need their own QA.

**Effort:** M

**Priority:** P1

**Depends on:** Stable demo assets.

### Annotation overlay restore

**What:** Restore saved highlights visually on the PDF page, not only in the annotation list.

**Why:** Local persistence is more convincing when users can see highlights reappear after reload.

**Context:** Phase 6 intentionally stored annotations locally without writing back PDF or drawing overlay.

**Effort:** L

**Priority:** P2

**Depends on:** Coordinate model for text selections.

### EPUB support

**What:** Add EPUB reading as a later generic-reader format.

**Why:** EPUB supports the broader "read more than papers" vision.

**Context:** Markdown/Text/HTML already provide a low-cost generic reading demo. EPUB should wait until release hardening is stable.

**Effort:** L

**Priority:** P3

**Depends on:** Dependency review for EPUB renderer.

## QA

### Playwright smoke harness

**What:** Promote the ad hoc Phase 7 Playwright verification into a checked-in script that can run PDF outline, annotation, Markdown selection, AI send, and Stop.

**Why:** Manual browser QA found real issues. A script makes regressions cheaper to catch.

**Context:** Use demo assets in `demo-assets/`. Do not require an API key for the local-only portion; skip live AI with a clear message when no key exists.

**Effort:** M

**Priority:** P1

**Depends on:** Stable dev server port or script-owned server startup.

### Visual QA matrix

**What:** Capture desktop, narrow desktop, and tablet-width screenshots for the dual-pane workbench.

**Why:** The current product value depends on the reader and AI panel being simultaneously usable.

**Context:** Phase 3 screenshots proved the initial layout. Phase 5-7 added more controls and readers.

**Effort:** S

**Priority:** P1

**Depends on:** Playwright smoke harness.

### GStack pre-landing review report

**What:** Write a two-pass pre-landing review report under `docs/reviews/` before calling Phase 8 complete.

**Why:** gstack review norms separate critical correctness issues from informational polish, which prevents hidden release blockers.

**Context:** Use `docs/GSTACK_ALIGNMENT.md` as the local checklist.

**Effort:** S

**Priority:** P1

**Depends on:** Phase 8 P0 implementation status.

## Architecture

### Reading agent runtime skeleton

**What:** Add a conservative VibeReader-specific agent runtime with context packing, reading-only tools, permissions, bounded loop, and source-grounded artifacts.

**Why:** A model connected to chat is not yet an agent. VibeReader becomes meaningfully intelligent when the model can inspect document context, choose reader tools, preserve artifacts, and verify answers against source spans.

**Context:** See `docs/AGENT_RUNTIME_MAPPING.md`. Do not clone a coding agent wholesale; specialize the loop for reading, annotations, summaries, claims, and source grounding.

**Effort:** L

**Priority:** P1

**Depends on:** Phase 8 release hardening, source span model, production-safe AI transport.

### Generic document naming cleanup

**What:** Rename or alias `pdfText` style state to generic document text where it now powers Markdown/Text/HTML too.

**Why:** Naming drift increases future bug risk and confuses agents reading the project.

**Context:** `DEVLOG.md` flags this after Phase 5. It is not a demo blocker while behavior is correct.

**Effort:** M

**Priority:** P2

**Depends on:** Tests around Summary/Flashcard/MindMap text source.

### Bundle splitting

**What:** Split large optional panels or PDF-heavy code so Vite's main bundle warning is reduced.

**Why:** The current build passes but reports a large chunk warning. Release performance and Tauri startup could improve.

**Context:** Existing warning is documented as non-blocking for hackathon demo.

**Effort:** M

**Priority:** P2

**Depends on:** Stable release behavior tests.

## Completed

### GStack norms mapped into VibeReader governance

**What:** Added `docs/GSTACK_ALIGNMENT.md`, this backlog, and a Superpowers implementation plan.

**Why:** The project now has durable local rules for planning, QA, review, and release gating.

**Context:** Created from `/Users/mahaoxuan/gstack` on 2026-05-23.

**Effort:** S

**Priority:** P1

**Depends on:** None.
