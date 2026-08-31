const { test, expect } = require('@playwright/test');
const path = require('path');

const DEMO_ASSETS = path.join(__dirname, '..', 'demo-assets');

/**
 * P1 (Bonus): Multi-document switching
 * Behavior: When multiple documents are loaded, user should be able to switch between them.
 */
test.describe('Multi-Document Switching', () => {
  test('should switch between PDF and markdown documents', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

    // Upload PDF first
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(path.join(DEMO_ASSETS, 'outline-demo.pdf'));
    await expect(page.locator('canvas')).toBeVisible({ timeout: 10000 });

    // PDF should be active
    await expect(page.locator('.workspace-pane-header')).toContainText('outline-demo.pdf');

    // Upload markdown file
    await fileInput.setInputFiles(path.join(DEMO_ASSETS, 'sample.md'));
    await expect(page.locator('.document-reader-markdown')).toBeVisible({ timeout: 10000 });

    // Markdown should now be active
    await expect(page.locator('.workspace-pane-header')).toContainText('sample.md');

    // Verify markdown content is rendered
    await expect(page.locator('.document-reader-markdown')).toBeVisible();
  });

  test('should switch between text and HTML documents', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

    const fileInput = page.locator('input[type="file"]').first();

    // Upload text file
    await fileInput.setInputFiles(path.join(DEMO_ASSETS, 'sample.txt'));
    await expect(page.locator('[data-testid="text-document-content"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.workspace-pane-header')).toContainText('sample.txt');

    // Upload HTML file
    await fileInput.setInputFiles(path.join(DEMO_ASSETS, 'sample.html'));
    await expect(page.locator('[data-testid="html-document-content"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.workspace-pane-header')).toContainText('sample.html');
  });

  test('should handle rapid document switching', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

    const fileInput = page.locator('input[type="file"]').first();

    // Upload multiple documents in sequence
    await fileInput.setInputFiles(path.join(DEMO_ASSETS, 'sample.md'));
    await expect(page.locator('.document-reader-markdown')).toBeVisible({ timeout: 10000 });

    await fileInput.setInputFiles(path.join(DEMO_ASSETS, 'sample.txt'));
    await expect(page.locator('[data-testid="text-document-content"]')).toBeVisible({ timeout: 10000 });

    await fileInput.setInputFiles(path.join(DEMO_ASSETS, 'sample.html'));
    await expect(page.locator('[data-testid="html-document-content"]')).toBeVisible({ timeout: 10000 });

    // Final document should be HTML
    await expect(page.locator('.workspace-pane-header')).toContainText('sample.html');
  });
});
