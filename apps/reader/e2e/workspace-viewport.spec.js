const { test, expect } = require('@playwright/test');

async function waitForWorkspace(page) {
  await page.goto('/');
  await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.workspace-reading-surface')).toBeVisible();
  await expect(page.locator('.workspace-reader-pane')).toBeVisible();
  await expect(page.locator('.workspace-ai-pane')).toBeVisible();
}

async function measureWorkspace(page) {
  return page.evaluate(() => {
    const rectFor = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };

    const reading = rectFor('.workspace-reading-surface');
    const skim = rectFor('.workspace-skim-map-pane');
    const reader = rectFor('.workspace-reader-pane');
    const ai = rectFor('.workspace-ai-pane');

    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      bodyOverflowX: document.documentElement.scrollWidth - window.innerWidth,
      reading,
      skim,
      reader,
      ai,
      stacked: Boolean(reading && ai && reading.bottom <= ai.top + 1),
      row: Boolean(reading && ai && reading.right <= ai.left + 1),
      overlaps: Boolean(reading && ai
        && reading.left < ai.right
        && reading.right > ai.left
        && reading.top < ai.bottom
        && reading.bottom > ai.top),
    };
  });
}

function expectVisiblePaneMetrics(metrics) {
  expect(metrics.bodyOverflowX).toBeLessThanOrEqual(1);
  expect(metrics.overlaps).toBe(false);
  expect(metrics.reader.width).toBeGreaterThanOrEqual(300);
  expect(metrics.reader.height).toBeGreaterThanOrEqual(220);
  expect(metrics.ai.width).toBeGreaterThanOrEqual(300);
  expect(metrics.ai.height).toBeGreaterThanOrEqual(220);
}

test.describe('Workspace viewport layout contract', () => {
  test('keeps reader and Notes usable on a 1024px narrow desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await waitForWorkspace(page);

    const metrics = await measureWorkspace(page);

    expect(metrics.stacked).toBe(true);
    expectVisiblePaneMetrics(metrics);
  });

  test('keeps reader, Skim Map, and Notes visible on tablet width', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await waitForWorkspace(page);

    const metrics = await measureWorkspace(page);

    expect(metrics.stacked).toBe(true);
    expect(metrics.skim.width).toBeGreaterThanOrEqual(260);
    expect(metrics.skim.height).toBeGreaterThanOrEqual(160);
    expectVisiblePaneMetrics(metrics);
  });

  test('preserves a usable workspace when the effective viewport is reduced by zoom', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 720 });
    await waitForWorkspace(page);

    const metrics = await measureWorkspace(page);

    expect(metrics.stacked).toBe(true);
    expectVisiblePaneMetrics(metrics);
  });
});
