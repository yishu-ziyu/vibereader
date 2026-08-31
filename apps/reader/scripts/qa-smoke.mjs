#!/usr/bin/env node

import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const {
  assertSafeModelSeedTarget,
  buildSeedModelConfig,
  seedModelConfigInPage,
} = require('./modelConfigSeed.cjs');

const DEFAULT_URL = 'http://127.0.0.1:3217/';
const targetUrl = process.env.QA_SMOKE_URL || DEFAULT_URL;
const demoAssetName = 'sample.md';
const demoAssetPath = resolve(process.cwd(), 'demo-assets', demoAssetName);

const localKeyEnvNames = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'DEEPSEEK_API_KEY',
  'MOONSHOT_API_KEY',
  'KIMI_API_KEY',
  'STEPFUN_API_KEY',
  'STEP_API_KEY',
  'MIMO_API_KEY',
  'MIMO_TOKEN_PLAN_KEY',
  'MINIMAX_API_KEY',
  'MINIMAX_TOKEN_PLAN_KEY',
  'QWEN_API_KEY',
  'DOUBAO_API_KEY',
  'ZHIPU_API_KEY',
  'VITE_OPENAI_API_KEY',
  'VITE_ANTHROPIC_API_KEY',
  'VITE_AI_API_KEY',
  'QA_SMOKE_HAS_LOCAL_AI',
];

async function loadPlaywright() {
  for (const packageName of ['@playwright/test', 'playwright']) {
    try {
      const mod = await import(packageName);
      if (mod.chromium) return mod;
    } catch (error) {
      if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    }
  }

  console.error(
    'QA smoke requires Playwright. Install a project Playwright dependency before running scripts/qa-smoke.mjs.'
  );
  process.exit(1);
}

function reportLiveAiStatus() {
  const hasLocalKey = localKeyEnvNames.some((name) => Boolean(process.env[name]));
  if (!hasLocalKey) {
    console.log('SKIPPED_LIVE_AI no local key env/config provided');
    return;
  }

  console.log('LIVE_AI_CONFIG_PRESENT live AI checks intentionally not run');
}

function assertDemoAssetOnDisk() {
  if (!existsSync(demoAssetPath)) {
    throw new Error(`Missing demo asset on disk: demo-assets/${demoAssetName}`);
  }

  const size = statSync(demoAssetPath).size;
  if (size <= 0) {
    throw new Error(`Demo asset is empty: demo-assets/${demoAssetName}`);
  }
}

async function runSmoke() {
  assertSafeModelSeedTarget(targetUrl, process.env);
  reportLiveAiStatus();
  assertDemoAssetOnDisk();

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    if (!response || !response.ok()) {
      throw new Error(`App did not load successfully at ${targetUrl}: HTTP ${response?.status() ?? 'unknown'}`);
    }

    const seededConfig = await seedModelConfigInPage(page, buildSeedModelConfig(process.env));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('body').waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByText('VibeReader Dev').first().waitFor({ timeout: 10_000 });
    await page.getByText(/模型服务|配置模型服务|Model service/).first().waitFor({ timeout: 10_000 });

    const assetUrl = new URL(`demo-assets/${demoAssetName}`, targetUrl).toString();
    const assetResponse = await page.request.get(assetUrl);
    if (!assetResponse.ok()) {
      throw new Error(`Demo asset path failed: ${assetUrl} returned HTTP ${assetResponse.status()}`);
    }

    console.log(`QA_SMOKE_MODEL_CONFIG ${seededConfig.id} ${seededConfig.modelName}`);
    console.log(`QA_SMOKE_OK ${targetUrl}`);
  } finally {
    await browser.close();
  }
}

runSmoke().catch((error) => {
  console.error(`QA_SMOKE_FAILED ${error?.message || error}`);
  process.exit(1);
});
