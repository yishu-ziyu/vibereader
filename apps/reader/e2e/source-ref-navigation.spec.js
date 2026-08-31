const { test, expect } = require('@playwright/test');
const path = require('path');

const DEMO_ASSETS = path.join(__dirname, '..', 'demo-assets');

async function uploadPdfAndWaitForTextLayer(page, filename) {
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(path.join(DEMO_ASSETS, filename));

  await expect(page.locator('.workspace-reader-pane canvas')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.workspace-reader-pane .ant-spin-spinning')).toHaveCount(0, { timeout: 30000 });
  await expect(page.locator('.workspace-reader-pane [data-paragraph-id]').first()).toBeVisible({ timeout: 30000 });
}

test.describe('Source reference navigation', () => {
  test('highlights the referenced PDF paragraph after a source-ref navigation event', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

    await uploadPdfAndWaitForTextLayer(page, 'wonderland_short.pdf');

    const pageInput = page.locator('.workspace-reader-pane input[type="text"]').first();
    await expect(pageInput).toHaveValue('1');

    await page.locator('button .anticon-right').click();
    await expect(pageInput).toHaveValue('2', { timeout: 10000 });
    await expect(page.locator('.workspace-reader-pane [data-paragraph-id^="page-2-"]').first()).toBeVisible({
      timeout: 30000,
    });

    const paragraphId = await page
      .locator('.workspace-reader-pane [data-paragraph-id^="page-2-"]')
      .first()
      .getAttribute('data-paragraph-id');

    await page.locator('button .anticon-left').click();
    await expect(pageInput).toHaveValue('1', { timeout: 10000 });

    await page.evaluate((id) => {
      window.dispatchEvent(new CustomEvent('vibereader:navigate-paragraph', {
        detail: { paragraphId: id },
      }));
    }, paragraphId);

    await expect(pageInput).toHaveValue('2', { timeout: 10000 });
    await expect(
      page.locator(`.workspace-reader-pane [data-paragraph-id="${paragraphId}"].paragraph-pulse-highlight`).first()
    ).toHaveClass(/paragraph-pulse-highlight/, { timeout: 10000 });
  });
});
