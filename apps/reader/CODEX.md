# Codex Agent Onboarding — VibeReader

> Feed this entire file to Codex before any coding task. It contains the architectural blueprint, design constraints, code conventions, and module map necessary to write code that fits this codebase.

---

## 1. Project Overview

**VibeReader** is a local-first AI-powered PDF reading workspace. It combines a PDF viewer with AI chat panels (summary, flashcards, mind map, thinking tree, attention navigator) to help researchers read papers more efficiently.

- **Repo**: `https://github.com/yishu-ziyu/VibeReader`
- **Type**: Desktop app (Tauri v2) + Web dev server
- **Audience**: Researchers, students, knowledge workers
- **Tone**: Warm-tech — not cold SaaS, not playful toy. Focused, quality, trustworthy.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React 18 + Vite)                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ PDF Viewer  │  │ AI Panels   │  │ Chat Input          │ │
│  │ (pdfjs-dist)│  │ (lazy load) │  │ (Slate + AntD X)    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│         ↑                    ↕                               │
│  CustomEvent: vibereader:select-paragraph                    │
│  CustomEvent: vibereader:navigate-paragraph                  │
├─────────────────────────────────────────────────────────────┤
│  Tauri Bridge (Rust) — minimal, plugin-based                │
│  • tauri_plugin_http  — native HTTP (bypass CORS)          │
│  • tauri_plugin_fs    — file system access                  │
│  • tauri_plugin_dialog — native file picker                 │
└─────────────────────────────────────────────────────────────┘
```

- **Frontend**: React 18, Vite 8, JSX. No TypeScript.
- **State**: Zustand (lightweight, no Redux).
- **UI Kit**: Ant Design 5 + Ant Design X (`@ant-design/x`) for chat components.
- **PDF**: `pdfjs-dist` v4, custom text layer + canvas annotation overlay.
- **Rich Text**: Slate.js for chat input (not contenteditable).
- **Markdown**: `react-markdown` + `remark-gfm` + `rehype-katex` for math.
- **Tests**: Vitest (unit) + Playwright (E2E).

---

## 3. Design System — Hard Constraints

**Read `DESIGN.md` for full specs.** Key constraints Codex MUST follow:

### Color
| Token | Value | Usage |
|-------|-------|-------|
| `--accent-blue` | `#2B7FD8` | Primary buttons, active tabs, links, focus rings |
| `--accent-yellow` | `#F4D758` | Selection highlight, badges, emphasis |
| `--accent-red` | `#E84A5F` | Danger actions, warning tags |
| `--bg-base` | `#fefcf6` | Page background (warm cream) |
| `--bg-elevated` | `#ffffff` | Cards, panels |
| `--bg-sunken` | `#faf6eb` | Sidebars, secondary panels |
| `--text-primary` | `#1a1a2e` | Main text (ink, not pure black) |
| `--border-subtle` | `rgba(26,26,26,0.06)` | All borders/dividers |

**NEVER use**: `#000`, `#fff` as large backgrounds, neon, glassmorphism, gradient text, blue-purple gradients.

### Typography
- **Panel titles / Headings**: `Fraunces` (italic) + `Noto Serif SC` — serif, warm, quality feel.
- **Body / UI**: `-apple-system`, `Noto Sans SC`, `PingFang SC` — system stack.
- **Code**: `Fira Code`, `SFMono-Regular`.
- **NEVER use**: Inter/Roboto as brand/display font (only acceptable as UI auxiliary).

### Component Rules
- **Buttons**: Pill shape (`border-radius: 9999px`), primary has blue glow shadow.
- **Cards**: `border-radius: 12px`, white bg, `box-shadow: 0 2px 12px rgba(0,0,0,0.04)`, hover: translateY(-2px) + deeper shadow.
- **Tabs**: Bottom blue line activation (`border-bottom: 2px solid #2B7FD8`), not filled pills.
- **Inputs**: `border-radius: 10px`, focus: blue border + `0 0 0 3px rgba(43,127,216,0.1)` glow.
- **Insight cards**: Colored left border (3px) by type — 创新点=green, 方法亮点=blue, 关键对比=purple, 实验反常=orange.

### Motion
- Hover: `transform 0.2s`, `translateY(-2px)` + shadow deepen.
- Focus: blue glow ring, no outline.
- Active: `scale(0.98)` 0.1s.
- NO bounce, NO elastic, NO scroll-reveal, NO infinite loops.
- Respect `prefers-reduced-motion`.

---

## 4. File Organization

```
src/
├── App.jsx                    # Root component, layout, CustomEvent listeners
├── styles.css                 # Global CSS, CSS variables, Ant Design overrides
├── index.html                 # Entry, Google Fonts preconnect
│
├── aiService.js               # AI service facade — supports both fetch() and Tauri HTTP
├── aiEndpoint.js              # Endpoint URL construction
├── customOpenAIService.js     # OpenAI-compatible API client (incl. streaming)
├── customAnthropicService.js  # Anthropic API client
├── modelPresets.js            # Provider presets (OpenAI, Anthropic, DeepSeek, MiMo, Stepfun, etc.)
├── modelConfigGuard.js        # Config validation
│
├── attentionNavigator.js      # Keyword-based insight extraction (local fallback)
├── bidirectionalAnchor.js     # CustomEvent protocol: select-paragraph ↔ navigate-paragraph
├── paragraphExtractor.js      # PDF text layer → paragraph ID mapping
├── vibeParser.js              # VIBE parsing prompts and logic
├── vibePrompts.js             # System prompts for different AI tasks
│
├── PdfViewer.jsx              # PDF.js wrapper + text layer + canvas annotations
├── DocumentReader.jsx         # Plain text / Markdown document viewer
├── MarkdownRenderer.jsx       # react-markdown wrapper with KaTeX, code blocks
│
├── ChatInput.jsx              # Main chat input (Slate editor + model selector + send)
├── ChatSubmitControl.jsx      # Send button logic
├── ChatImageLightbox.jsx      # Image viewer modal
├── ImagePreview.jsx           # Inline image preview
├── ImageUploader.jsx          # Drag & drop image upload
│
├── SummaryPanel.jsx           # Lazy-loaded: paper summary
├── SummaryCard.jsx            # Collapsible summary section card
├── FlashcardDeck.jsx          # Lazy-loaded: flashcard deck UI
├── Flashcard.jsx              # Individual flashcard (3D flip)
├── MindMap.jsx                # Lazy-loaded: mind map visualization
├── ThinkingTreePanel.jsx      # Lazy-loaded: hierarchical thinking tree
├── AttentionNavigatorPanel.jsx # Lazy-loaded: insight cards + PDF markers
│
├── FlashcardDeck.jsx          # Lazy-loaded: flashcard deck UI
├── Flashcard.jsx              # Individual flashcard (3D flip)
├── MindMap.jsx                # Lazy-loaded: mind map visualization
├── ThinkingTreePanel.jsx      # Lazy-loaded: hierarchical thinking tree
├── AttentionNavigatorPanel.jsx # Lazy-loaded: insight cards + PDF markers
│
├── browserTool.js             # Browser automation tool (for agent)
├── agent/                     # Agent workflow components
├── store/                     # Zustand stores
├── services/                  # Service utilities
└── i18n.js                    # Localization
```

**Rule**: Many small files > few large files. Target 200–400 lines per file. Extract utilities rather than inline.

---

## 5. Code Conventions

### JSX / React
- Functional components only. No class components.
- Props destructuring at function signature.
- `React.lazy()` + `Suspense` for all AI panels (code splitting).
- State: Zustand for global, `useState`/`useReducer` for local.
- Effects: clean up listeners, intervals, observers.

### CSS
- Use CSS variables from `:root` for ALL colors.
- All Ant Design overrides go in `styles.css`.
- Component-specific styles: use class names in `styles.css` (not CSS-in-JS).
- `!important` is acceptable ONLY for Ant Design theme overrides.

### Naming
- Components: `PascalCase.jsx`
- Utilities: `camelCase.js`
- Tests: `ComponentName.test.jsx` or `utilityName.test.js`
- CSS classes: `kebab-case`, semantic (not `.btn-1`)

### Error Handling
- ALL async functions must have try/catch.
- User-facing errors: friendly Chinese message.
- Log detailed context to console.
- NEVER swallow errors silently.

### Immutability
- ALWAYS create new objects/arrays. NEVER mutate existing state.
- Use spread operator, `map`, `filter` — not `push`, `splice`, direct assignment.

---

## 6. Key Patterns

### Bidirectional Anchor Protocol
```javascript
// PDF → App: user selects text in PDF
const event = new CustomEvent('vibereader:select-paragraph', {
  detail: { paragraphId, pageNumber, text }
});
window.dispatchEvent(event);

// App → PDF: navigate to a paragraph
const event = new CustomEvent('vibereader:navigate-paragraph', {
  detail: { paragraphId }
});
window.dispatchEvent(event);
```

### AI Service Runtime Switch
```javascript
// aiService.js
if (window.__TAURI__) {
  // Use Tauri native HTTP (bypasses CORS)
  return tauriHttpRequest(config, messages, onChunk);
} else {
  // Use browser fetch()
  return fetchStreamRequest(config, messages, onChunk);
}
```

### Lazy Loading Pattern
```javascript
// App.jsx
const SummaryPanel = React.lazy(() => import('./SummaryPanel'));
const FlashcardDeck = React.lazy(() => import('./FlashcardDeck'));
const ThinkingTreePanel = React.lazy(() => import('./ThinkingTreePanel'));
const AttentionNavigatorPanel = React.lazy(() => import('./AttentionNavigatorPanel'));
```

### Model Preset Structure
```javascript
{
  id: 'mimo',
  name: 'MiMo Token Plan',
  apiType: 'openai-compatible',
  region: 'china',
  baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
  defaultModel: 'mimo-v2.5-pro',
  authType: 'api-key',  // 'bearer' or 'api-key'
  models: ['mimo-v2.5-pro'],
}
```

---

## 7. Development Commands

```bash
# Dev server (web)
npm run dev          # http://127.0.0.1:3217

# Dev with Tauri desktop
npm run tauri:dev    # Launches Rust + Web frontend

# Build
npm run build        # Vite production build
npm run tauri:build  # Build desktop app

# Test
npm test             # Vitest unit tests
npm run test:e2e     # Playwright E2E

# QA
npm run qa:smoke     # Smoke test script
```

---

## 8. Testing Requirements

- **Unit**: Vitest + jsdom + React Testing Library.
- **E2E**: Playwright — critical user flows only.
- **Coverage target**: 80%+.
- **TDD workflow**: Write test first (RED) → implement (GREEN) → refactor.
- Tests must explain WHY the business rule matters, not just check return values.

---

## 9. Security Rules

- NEVER hardcode API keys in source.
- ALWAYS validate user input at boundaries.
- Sanitize HTML from AI responses (react-markdown handles this).
- NEVER trust external data (API responses, file content).
- Before changing model defaults or provider templates, read `docs/LOCAL_MODEL_SERVICES.md`. Defaults and QA seeds must use services we actually own or can operate locally.

---

## 10. What to Avoid

| Don't | Do Instead |
|-------|-----------|
| Add unrequested features | Solve the current problem only |
| Create one-off abstractions | Inline 3 similar lines |
| Mutate existing state | Create new objects/arrays |
| Skip error handling | Wrap async in try/catch |
| Use `alert()` / `console.log` for UX | Use Ant Design Message/Modal |
| Add comments to self-evident code | Explain only non-obvious logic |
| Change unrelated code during a fix | Surgical changes only |

---

## 11. Context Files to Read

Before implementing any feature, read these files in order:

1. **`src/App.jsx`** — Understand the layout and state flow.
2. **`src/styles.css`** — Understand the CSS variable system and existing overrides.
3. **`DESIGN.md`** — Understand the visual constraints.
4. **`src/aiService.js`** — Understand how AI calls work.
5. **`docs/LOCAL_MODEL_SERVICES.md`** — Required before changing model/provider/runtime behavior.
6. Relevant component file(s) — Read before modifying.

---

*Last updated: 2026-05-31. If this doc conflicts with code, trust the code and update this doc.*
