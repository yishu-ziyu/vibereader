const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const DEMO_PDF = path.join(__dirname, '..', 'demo-assets', 'outline-demo.pdf');
const SCREENSHOT_DIR = path.join(__dirname, '..', 'test-results', 'visual-qa');

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'narrow', width: 1024, height: 768 },
  { name: 'tablet', width: 820, height: 1180 },
];

test.describe('Visual QA screenshots', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  for (const viewport of VIEWPORTS) {
    test(`captures ${viewport.name} homepage after PDF render`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      await page.goto('/');
      await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(DEMO_PDF);

      await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 });
      await expect(page.locator('.workspace-pane-header')).toContainText('outline-demo.pdf');

      const screenshotPath = path.join(
        SCREENSHOT_DIR,
        `${viewport.name}-${viewport.width}x${viewport.height}.png`
      );

      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
      });

      expect(fs.existsSync(screenshotPath)).toBe(true);
      expect(fs.statSync(screenshotPath).size).toBeGreaterThan(0);
    });
  }
});
