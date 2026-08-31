const { test, expect } = require('@playwright/test');
const path = require('path');

const DEMO_ASSETS = path.join(__dirname, '..', 'demo-assets');

async function uploadPdfAndWaitForRender(page, filename) {
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(path.join(DEMO_ASSETS, filename));

  await expect(page.locator('.workspace-reader-pane canvas')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.workspace-reader-pane .ant-spin-spinning')).toHaveCount(0, { timeout: 30000 });
}

/**
 * P0: PDF upload and render
 * Behavior: When user uploads a PDF file, it should be parsed and rendered with canvas and text layer.
 */
test.describe('PDF Upload and Render', () => {
  test('should upload and render PDF file', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

    // Upload PDF via hidden file input and wait for rendered page readiness.
    await uploadPdfAndWaitForRender(page, 'outline-demo.pdf');

    // PDF viewer should show canvas
    await expect(page.locator('canvas')).toBeVisible({ timeout: 10000 });

    // PDF toolbar should show page info
    await expect(page.locator('text=/\\/\\s*\\d+/')).toBeVisible();

    // Document name should appear in reader pane header
    await expect(page.locator('.workspace-pane-header')).toContainText('outline-demo.pdf');
  });

  test('should render multi-page PDF with navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

    await uploadPdfAndWaitForRender(page, 'wonderland_short.pdf');

    // Check page navigation controls exist
    await expect(page.locator('button .anticon-left')).toBeVisible();
    await expect(page.locator('button .anticon-right')).toBeVisible();

    // Page input should show "1"
    const pageInput = page.locator('.workspace-reader-pane input[type="text"]').first();
    await expect(pageInput).toHaveValue('1');
  });
});

/**
 * P0: PDF outline navigation
 * Behavior: When a PDF with outline/bookmarks is loaded, clicking outline items should navigate to corresponding pages.
 */
test.describe('PDF Outline Navigation', () => {
  test('should display outline strip for PDF with bookmarks', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

    await uploadPdfAndWaitForRender(page, 'outline-demo.pdf');

    // Outline strip should be visible
    await expect(page.locator('.pdf-outline-strip')).toBeVisible({ timeout: 10000 });

    // Outline items should be present
    const outlineItems = page.locator('.pdf-outline-item');
    await expect(outlineItems.first()).toBeVisible();
    const count = await outlineItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should navigate to page when outline item is clicked', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

    await uploadPdfAndWaitForRender(page, 'outline-demo.pdf');
    await expect(page.locator('.pdf-outline-strip')).toBeVisible({ timeout: 10000 });

    // Get initial page
    const pageInput = page.locator('.workspace-reader-pane input[type="text"]').first();
    await expect(pageInput).toHaveValue('1');

    // Click second outline item if available
    const outlineItems = page.locator('.pdf-outline-item');
    const count = await outlineItems.count();
    if (count > 1) {
      await outlineItems.nth(1).click();
      // Page should change (allow time for navigation)
      await page.waitForTimeout(500);
      const value = await pageInput.inputValue();
      expect(value).not.toBe('1');
    }
  });
});

/**
 * P0: Text selection and highlight
 * Behavior: When user selects text in PDF, annotation toolbar should appear; highlighting should create an annotation.
 */
test.describe('PDF Text Selection and Highlight', () => {
  test('should show annotation toolbar on text selection', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

    await uploadPdfAndWaitForRender(page, 'outline-demo.pdf');

    // Wait for text layer to render
    await page.waitForTimeout(2000);

    // Try to select text in the text layer using a more reliable Playwright API
    const textLayer = page.locator('.workspace-reader-pane div[style*="position: absolute"]').first();
    if (await textLayer.isVisible().catch(() => false)) {
      const box = await textLayer.boundingBox();
      if (box) {
        // Use triple-click to select text (more reliable than drag)
        await page.mouse.click(box.x + 20, box.y + 20, { clickCount: 3 });

        // Annotation toolbar should appear
        await expect(page.locator('.pdf-annotation-toolbar')).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('should create highlight annotation', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

    await uploadPdfAndWaitForRender(page, 'outline-demo.pdf');

    // Wait for text layer
    await page.waitForTimeout(2000);

    // Select text using triple-click
    const textLayer = page.locator('.workspace-reader-pane div[style*="position: absolute"]').first();
    if (await textLayer.isVisible().catch(() => false)) {
      const box = await textLayer.boundingBox();
      if (box) {
        await page.mouse.click(box.x + 20, box.y + 20, { clickCount: 3 });

        // Wait for toolbar
        await expect(page.locator('.pdf-annotation-toolbar')).toBeVisible({ timeout: 3000 });

        // Click highlight button (contains "高亮")
        await page.locator('.pdf-annotation-toolbar button').filter({ hasText: /高亮|Highlight/ }).click();

        // Annotation list should appear
        await expect(page.locator('.pdf-annotation-list')).toBeVisible({ timeout: 3000 });
      }
    }
  });
});
