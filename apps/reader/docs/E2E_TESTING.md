# E2E Testing Guide

## Overview

VibeReader uses Playwright for end-to-end (E2E) smoke testing. The test suite covers critical user flows without depending on external APIs.

## Test Scripts

```bash
# Run all E2E tests (headless)
npm run test:e2e

# Run E2E tests with UI mode for debugging
npm run test:e2e:ui

# Run a specific test file
npx playwright test e2e/homepage.spec.js

# Run with headed browser for visual inspection
npx playwright test --headed
```

## Test Structure

```
e2e/
  homepage.spec.js        # P0: Homepage layout verification
  pdf-viewer.spec.js      # P0: PDF upload, render, outline, highlight
  document-reader.spec.js # P0: Markdown, text, HTML rendering
  ai-chat.spec.js         # P0: AI text injection, no-API-key prompt
  multi-document.spec.js  # P1: Multi-document switching
```

## Test Coverage

### P0 (Critical)

| Scenario | File | Description |
|----------|------|-------------|
| Homepage layout | `homepage.spec.js` | Verifies sidebar, reader pane, AI pane, divider, collapse button |
| Empty state | `homepage.spec.js` | Confirms empty state shown when no document loaded |
| PDF upload & render | `pdf-viewer.spec.js` | Uploads PDF, verifies canvas render and page navigation |
| PDF outline navigation | `pdf-viewer.spec.js` | Tests outline strip display and page jumping |
| Text selection & highlight | `pdf-viewer.spec.js` | Selects text, verifies annotation toolbar and highlight creation |
| Markdown rendering | `document-reader.spec.js` | Uploads MD file, verifies MarkdownRenderer output |
| Text document rendering | `document-reader.spec.js` | Uploads TXT file, verifies pre-wrap display |
| HTML document rendering | `document-reader.spec.js` | Uploads HTML file, verifies sanitized content |
| AI text injection | `ai-chat.spec.js` | Selects text from document, clicks inject, verifies chat bubble |
| No API key prompt | `ai-chat.spec.js` | Sends message without config, verifies error prompt |

### P1 (Bonus)

| Scenario | File | Description |
|----------|------|-------------|
| Multi-document switching | `multi-document.spec.js` | Switches between PDF, MD, TXT, HTML documents |
| Rapid document switching | `multi-document.spec.js` | Tests sequential uploads without crashes |
| Stop generating button | `ai-chat.spec.js` | Verifies Send/Stop button toggle exists |

## Demo Assets

Test files in `demo-assets/`:

- `outline-demo.pdf` - PDF with bookmarks/outline
- `wonderland_short.pdf` - Multi-page PDF
- `sample.md` - Markdown file
- `sample.txt` - Plain text file
- `sample.html` - HTML file

## Configuration

Playwright config: `playwright.config.js`

- Auto-starts dev server on `127.0.0.1:3217`
- Uses Chromium desktop profile
- Screenshots, traces, and videos saved on failure to `test-results/`
- HTML report generated at `test-results/report/`

## Writing New Tests

1. Create a new `.spec.js` file in `e2e/`
2. Import `{ test, expect } from '@playwright/test'`
3. Use `test.describe()` to group related tests
4. Use `page.goto('/')` and wait for `.workspace-body` to be visible
5. Use `page.locator('input[type="file"]')` for file uploads
6. Add demo assets to `demo-assets/` if needed

## CI Integration

Tests run in CI with:
- `workers: 1` (serial execution)
- `retries: 2` (retry flaky tests)
- `forbidOnly: true` (fail on `test.only`)

## Troubleshooting

- **Port already in use**: The dev server reuse is enabled locally; kill existing Vite processes
- **PDF text layer not found**: Text layer rendering is async; add `page.waitForTimeout(2000)` after canvas appears
- **File upload fails**: Ensure the hidden `input[type="file"]` is not disabled
