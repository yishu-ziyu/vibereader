# VibeReader Project Map

Last updated: 2026-05-23

## Current mainline

`/Users/mahaoxuan/Desktop/AI产品经理/vibereader-knowledge-workbench/apps/reader`

This is the active development surface. New work should happen here unless a task explicitly says otherwise.

Runtime identity:

- Product name: `VibeReader`
- Development window title: `VibeReader Standalone Dev`
- Tauri bundle identifier: `cn.yishuziyu.vibereader`
- Rust package and debug binary: `vibereader`
- NPM package name: `vibereader-desktop`
- Dev server URL: `http://127.0.0.1:3217`

## Historical surfaces

Author Vibero (Zotero fork, `_apps/Vibero.app`, `legacy/vibero`) was deleted locally on 2026-08-13.
Do not restore those paths. This standalone app is the implementation mainline.

## Validation target

Use a real PDF file for manual PDF QA:

`demo-assets/wonderland_short.pdf`

## Local model services

Use `docs/LOCAL_MODEL_SERVICES.md` before changing model defaults, QA seed configs, or provider templates.

Current default QA path is MiniMax Token Plan:

- Model: `MiniMax-M3`
- Protocol: Anthropic-compatible
- Base URL: `https://api.minimaxi.com/anthropic`
- Env var: `MINIMAX_TOKEN_PLAN_KEY`

MiniMax API is a separate choice for pay-as-you-go API keys:

- Provider key: `minimax-api`
- Env var: `MINIMAX_API_KEY`

Kimi/Moonshot is optional only when a real key is present. Do not restore keyless Kimi free-trial behavior.
