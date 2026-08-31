# Local Model Services

Last updated: 2026-07-01

This file is the local source of truth for model services that VibeReader may use during product development and QA.

## Product Rule

The first users are ourselves. Development, smoke tests, demos, and browser validation should default to model services we actually own or can operate locally.

Do not add a provider as a default, "free trial", or ready-to-run path just because the app technically supports its API shape. A provider becomes runnable only after a real local key, server-side proxy, or local endpoint is confirmed.

## Current Runnable Default

| Provider | Key Type | Model | Protocol | Base URL | Env Var | Status |
| --- | --- | --- | --- | --- | --- | --- |
| MiniMax Token Plan | Token Plan subscription key | `MiniMax-M3` | Anthropic-compatible | `https://api.minimaxi.com/anthropic` | `MINIMAX_TOKEN_PLAN_KEY` | Default development and QA template |
| MiniMax API | Pay-as-you-go API key | `MiniMax-M3` | Anthropic-compatible | `https://api.minimaxi.com/anthropic` | `MINIMAX_API_KEY` | Optional MiniMax API mode |

Request endpoint after normalization:

```text
POST https://api.minimaxi.com/anthropic/v1/messages
```

Headers:

```text
anthropic-version: 2023-06-01
x-api-key: $MINIMAX_TOKEN_PLAN_KEY or $MINIMAX_API_KEY
```

Local source of truth:

```text
/Users/mahaoxuan/Desktop/AI组件工作流库
-> /Users/mahaoxuan/lifeos/sources/ai-component-workflow-library
-> components/minimax-token-plan-real-service/WORKFLOW.md
```

The MiniMax host and credential-mode split in this file were corrected against the current MiniMax Chinese platform docs on 2026-07-01. If the local workflow library still says `api.minimax.io`, treat that as stale for this project.

Important MiniMax details:

- `MiniMax-M3` is the current project standard.
- `MiniMax-M2.7` and `MiniMax-M2.7-highspeed` are legacy options and must not be used as defaults.
- MiniMax has two credential modes: Token Plan subscription key and pay-as-you-go API key. The two key types are independent and must be shown as separate user choices.
- `MINIMAX_TOKEN_PLAN_KEY` is the preferred env var for Token Plan subscription keys.
- `MINIMAX_API_KEY` is the preferred env var for pay-as-you-go API keys.
- Normalize current configs to `https://api.minimaxi.com/anthropic`. Older `https://api.minimax.io/anthropic` records should migrate to the documented Chinese platform host.
- Never store a real MiniMax key in frontend code, localStorage templates, docs, or git.

## Kimi / Moonshot

Kimi is supported as an optional OpenAI-compatible provider, but it is not a default QA path on this machine because no current local Moonshot API key is confirmed.

If a real key is provided later:

| Provider | Model | Protocol | Base URL | Env Var | Status |
| --- | --- | --- | --- | --- | --- |
| Kimi / Moonshot | `kimi-k2.6` by default | OpenAI-compatible | `https://api.moonshot.cn/v1` | `KIMI_API_KEY` or `MOONSHOT_API_KEY` | Optional only |

Rules:

- Do not create or preserve a keyless Kimi runtime config for external Moonshot endpoints.
- Do not use `moonshot-v1-*` as a visible default or import template.
- The path segment `/v1` is part of the official OpenAI-compatible API URL. It is not evidence that `moonshot-v1-*` models are current.
- Before changing Kimi model names, re-check current official Moonshot docs or console.

## Implementation Surfaces

- Presets: `src/modelPresets.js`
- First-use selected model: `src/store/modelStore.js`
- LocalStorage migration: `src/modelConfigMigration.js`
- Test seed helper: `scripts/modelConfigSeed.cjs`
- Vite dev proxy: `vite.config.js`
- Endpoint normalization: `src/aiEndpoint.js`
- Import template: `docs/vibereader-models-template.json`

## Acceptance Criteria

When storage is empty, the app should create only one model template:

```json
{
  "id": "preset-minimax-default",
  "providerKey": "minimax",
  "modelName": "MiniMax-M3",
  "apiFormat": "anthropic",
  "baseUrl": "https://api.minimaxi.com/anthropic",
  "requiresApiKey": true,
  "credentialMode": "token-plan"
}
```

When legacy storage contains a keyless `preset-kimi-free-trial`, migration should drop it from runnable configs.

When legacy storage contains MiniMax M2.7 or `api.minimax.io`, migration should normalize it to `MiniMax-M3` and `https://api.minimaxi.com/anthropic`.
