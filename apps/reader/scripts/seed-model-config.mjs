#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const {
  assertSafeModelSeedTarget,
  buildSeedModelConfig,
  seedModelConfigInPage,
} = require('./modelConfigSeed.cjs');

const targetUrl = process.env.QA_SEED_URL || process.env.QA_SMOKE_URL || 'http://127.0.0.1:3217/';

function maskKey(apiKey) {
  if (!apiKey) return 'none';
  if (apiKey.length <= 8) return 'present';
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

async function main() {
  assertSafeModelSeedTarget(targetUrl, process.env);
  const config = buildSeedModelConfig(process.env);
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await seedModelConfigInPage(page, config);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('body').waitFor({ state: 'visible', timeout: 10_000 });

    console.log(JSON.stringify({
      ok: true,
      url: targetUrl,
      selectedConfigId: config.id,
      baseUrl: config.baseUrl,
      modelName: config.modelName,
      apiFormat: config.apiFormat,
      requiresApiKey: config.requiresApiKey !== false,
      apiKey: maskKey(config.apiKey),
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`SEED_MODEL_CONFIG_FAILED ${error?.message || error}`);
  process.exit(1);
});
