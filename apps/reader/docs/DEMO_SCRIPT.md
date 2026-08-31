# VibeReader Web-First Demo Script

## Demo Goal

Show the browser app as the primary product path: open a local document, read in the center workspace, create source-grounded cards, keep artifacts in Notes, and recover the workspace after refresh.

This demo should not depend on Tauri-only features. Desktop/Rust capabilities are follow-up strengtheners, not blockers for the Web product story.

## Before Demo

Run:

```bash
npm run dev -- --port 3217
```

Open:

```text
http://127.0.0.1:3217
```

Use stable assets from:

```text
/Users/mahaoxuan/Desktop/黑客松/ai-chat-standalone/demo-assets/
```

Recommended order:

1. `outline-demo.pdf`
2. `sample.md`
3. `demo-fallback-answer.md` if the live AI provider fails

Optional checks before presenting:

```bash
npx playwright test e2e/visual-qa.spec.js e2e/workspace-viewport.spec.js --project=chromium
```

## 3-Minute Script

### 0:00-0:20 Positioning

Open the browser app.

Say:

> VibeReader is a local-first AI reading workspace. The current product path is Web first: the same React workbench proves the reading loop before Tauri and Rust add stronger local capabilities.

Show:

- Session sidebar on the left.
- Reading surface in the center.
- Notes / cards panel on the right or below on narrow screens.

### 0:20-1:00 PDF Reading Loop

Open `demo-assets/outline-demo.pdf`.

Show:

- PDF appears in the Reader.
- Skim Map stays attached to the reading surface.
- Fit Width, page navigation, and zoom remain usable.
- Narrow-width layout keeps Reader and Notes visible instead of squeezing them.

Say:

> The first acceptance point is not model output. It is a stable reading surface that can carry source positions.

### 1:00-1:45 Source Selection to Lens Card

Select a sentence in the PDF.

Click:

1. `Create Lens Card` or the current Lens Card action.
2. Save the generated card.
3. Open Notes.
4. Click the card source action to return to the original PDF position.

Show:

- The card has source text and page information.
- Notes stores the card as a reusable artifact.
- Source navigation returns to the selected span or paragraph.

### 1:45-2:25 Persistence and Document Isolation

Refresh the browser.

Show:

- Recent documents restore metadata.
- Reopening the same PDF restores document-scoped artifacts and annotations.
- Notes do not leak across another document.

Say:

> Web persistence is intentionally metadata and artifact focused. It does not store raw PDF binary or full document text in localStorage.

### 2:25-3:00 AI Fallback and Close

If a model key is configured, ask:

```text
用中文解释这个来源片段，并生成一个适合复习的概念卡片。
```

If the model fails or no key is configured, show the readable error state and open `demo-assets/demo-fallback-answer.md`.

Say:

> The core product loop is source-grounded reading: open, locate, select, save, revisit, and then ask AI with evidence. Cloud model output is useful, but the reading workspace remains usable without waiting on a provider.

## 8-Minute Script

### 0:00-1:00 Problem

Explain:

- Chat-only PDF tools lose location and reading state.
- Long documents need navigation, evidence, cards, and exportable artifacts.
- VibeReader treats AI output as part of a reading workflow, not the whole product.

### 1:00-2:00 Platform Strategy

Show the browser app and say:

> The Web app is the fastest path to prove the product. Tauri desktop reuses this React workbench later, while Rust takes over persistence, secure keys, parsing, indexing, export, and agent tasks.

Do not present the desktop app as a separate fork.

### 2:00-3:20 PDF Path

Open `outline-demo.pdf`.

Demonstrate:

- Reader / Skim Map / Notes layout.
- Fit Width.
- Page jump.
- Text selection.
- Source-grounded card creation.

### 3:20-4:40 Notes and VibeCards

Show Notes:

- Lens Card from the selection.
- Explain Card if an AI answer was saved.
- Concept Card if a summary point was saved.
- Drag a card into Chat if presenting the longer flow.
- Use source navigation to return to the document.

### 4:40-5:50 Persistence

Refresh the page.

Demonstrate:

- Recent document metadata is still available.
- Reopen the same PDF.
- Document-scoped artifacts and annotations restore.
- Open `sample.md` and show artifacts remain isolated by document.

### 5:50-6:40 Model Error Handling

Open the model config path from Chat or Notes.

Show one of:

- No API key state.
- Bad key / unauthorized state.
- Provider unavailable state.
- Browser proxy or CORS failure state.

Say:

> Provider errors should be readable product states. API keys and token-like values must not appear in logs, error text, or exports.

### 6:40-7:30 OCR Current Page

Use a scanned or no-text PDF page if available.

Show:

- The app explains that the current page has no selectable text.
- User explicitly clicks current-page OCR.
- OCR spans become source candidates with confidence and bounding boxes.

If no scanned file is available, state that this is covered by the current-page OCR smoke tests and skip live OCR.

### 7:30-8:00 Roadmap

Close with:

> Phase 11 proves the Web reading loop. The next acceptance layer is not a UI rewrite: it is Rust-backed local reliability, search, export, secure key storage, and eventually reading agents.

## Fallback Path

If AI API is slow, blocked, or returns a request error:

1. Do not wait on the model.
2. Show selected source text and saved Lens Card.
3. Show the readable model error.
4. Open `demo-assets/demo-fallback-answer.md` only to show intended answer shape.
5. Use source navigation and persistence as the guaranteed offline value path.

## Acceptance Checklist

- [ ] Browser app opens at `http://127.0.0.1:3217`.
- [ ] `outline-demo.pdf` opens through the Web file picker.
- [ ] Reader, Skim Map, and Notes stay usable at desktop and 1024px widths.
- [ ] PDF text selection creates a source-grounded Lens Card.
- [ ] Notes shows the card with source text and page metadata.
- [ ] Card source action returns to the PDF span or paragraph.
- [ ] Refresh plus reopen of the same file restores document-scoped artifacts.
- [ ] Opening `sample.md` does not show the PDF document's artifacts.
- [ ] Model configuration or request failure produces a readable error.
- [ ] Fallback path can be presented without waiting for live AI.
