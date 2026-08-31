# VibeReader GStack Alignment

Source folder: `/Users/mahaoxuan/gstack`
Date: 2026-05-23

This document translates the local gstack norms into project-local operating rules for VibeReader Standalone Dev. It is not a wholesale import of gstack. The goal is to adopt the parts that improve release quality without adding Claude-specific or gstack-runtime-specific machinery to this repo.

## Adopted Norms

### Boil the Lake

For bounded VibeReader release work, finish the complete local loop instead of leaving an 80 percent version:

- write the behavior in BDD form;
- add or update automated tests first when practical;
- implement the smallest production change;
- run the relevant tests and build checks;
- record the result in `tasks/todo.md` and `DEVLOG.md`.

For large "ocean" work, such as full PDF write-back annotations, mobile release, or a full sync backend, do not hide the scope. Track it as backlog with explicit priority and dependencies.

### Search Before Building

Before adding a new dependency or new platform bridge, inspect the current repo and prefer existing surfaces:

- React/Vite UI code in `src/`;
- Tauri bridge code in `src-tauri/`;
- local document services in `src/services/`;
- QA and demo acceptance in `docs/ACCEPTANCE_AND_QA.md`;
- task state in `tasks/todo.md`.

If the task depends on unfamiliar Tauri, Vite, pdf.js, or provider API behavior, check official documentation before implementation.

### User Sovereignty

The product direction is now VibeReader Standalone Dev, not the old Zotero fork and not the old Vibero app bundle. Agent recommendations may challenge a plan, but implementation should preserve the confirmed direction:

- standalone reader first;
- Tauri desktop shell;
- local-first reading and annotations;
- left-reader/right-AI workbench;
- hackathon demo readiness before broad platform expansion.

### Structured Backlog

New work that is not part of the current active implementation should be tracked in `tasks/gstack-backlog.md` using the gstack TODO fields:

- What
- Why
- Context
- Effort
- Priority
- Depends on

Priority meanings:

- P0: blocks demo, release, data safety, or core app launch;
- P1: critical for credible product quality;
- P2: important but not demo-blocking;
- P3: nice improvement;
- P4: someday or research track.

### Two-Pass Pre-Landing Review

Before declaring a phase complete, run a two-pass review:

1. Critical pass:
   - local file/data safety;
   - API key and provider boundary safety;
   - request cancellation and loading state races;
   - LLM output trust boundaries;
   - enum/type coverage for document kinds and model protocols;
   - shell or URL injection risks.
2. Informational pass:
   - async/sync mixing;
   - field naming drift, especially `pdfText` versus generic document text;
   - prompt quality and context leakage;
   - timeouts and failure states;
   - frontend performance and bundle warnings;
   - distribution and CI gaps.

Findings should be written under `docs/reviews/` when the phase is large enough to matter.

### QA Taxonomy

Use this severity model for QA reports:

- Critical: data loss, launch failure, secret leakage, impossible core path;
- High: major user path broken, severe layout failure, provider path unusable;
- Medium: workaround exists but quality suffers;
- Low: polish, copy, small visual defect.

Use these categories:

- Visual/UI
- Functional
- UX
- Content
- Performance
- Console/Errors
- Accessibility

### Release Gate

VibeReader is not "release ready" until this evidence is current:

- `npm run test`
- `npm run build`
- `cd src-tauri && cargo check`
- Tauri dev or packaged app launch check
- Playwright smoke path covering PDF, Markdown/Text, annotation, AI send, and Stop
- provider path verified for both success and readable failure
- no API key committed to git or copied into docs
- release notes or DEVLOG entry updated

## Not Adopted

The following gstack surfaces are intentionally not imported:

- generated `SKILL.md` replacement machinery;
- Claude Desktop specific install and hook assumptions;
- gstack binary state directories;
- telemetry/proactive prompt behavior;
- automatic ship/push/deploy behavior.

Those can be revisited later, but they are unnecessary for the current hackathon release track.

## VibeReader Gates

### Product Gate

Every feature should map to one of these product outcomes:

- read local documents;
- ask AI about selected content;
- synthesize summaries, flashcards, or mind maps;
- preserve user work locally;
- make the live demo more reliable.

### Engineering Gate

Every non-trivial code change should include:

- BDD behavior notes in `tasks/`;
- red/green tests where practical;
- minimal implementation scope;
- documented validation command output.

### Design Gate

The workbench must remain:

- left reader and right AI simultaneously visible on desktop;
- responsive on narrower windows;
- usable without overlapping controls;
- free of decorative UI that reduces scanability.

### DevEx Gate

A new developer should know:

- which project is current: `/Users/mahaoxuan/Desktop/ai-chat-standalone`;
- which older surfaces are not current;
- how to run web dev, Tauri dev, tests, and build;
- where acceptance evidence lives.

### QA Gate

Use quick, standard, or exhaustive QA depending on risk:

- Quick: targeted test plus build for docs or isolated logic;
- Standard: unit tests, build, cargo check, browser smoke;
- Exhaustive: full standard pass plus visual matrix, provider failure modes, and release review.

### Release Gate

Before packaging, resolve the Phase 8 P0 items in `tasks/gstack-backlog.md` or explicitly defer them with a documented risk.

