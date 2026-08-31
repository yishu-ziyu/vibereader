const { test, expect } = require('@playwright/test');

/**
 * P0: Homepage layout verification
 * Behavior: When user opens VibeReader, the workspace layout (sidebar + reader + AI pane) should render correctly.
 */
test.describe('Homepage Layout', () => {
  test('should render workspace with sidebar, reader pane, and AI pane', async ({ page }) => {
    await page.goto('/');

    // Wait for app to load (historyLoaded state)
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

    // Sidebar should be visible
    await expect(page.locator('text=VibeReader Dev')).toBeVisible();

    // Reader pane should be visible
    await expect(page.locator('.workspace-reader-pane')).toBeVisible();

    // AI pane should be visible
    await expect(page.locator('.workspace-ai-pane')).toBeVisible();

    // Divider should be visible
    await expect(page.locator('.workspace-divider')).toBeVisible();

    // Notes tab should be active by default so saved reading artifacts are first-class.
    const activeTab = page.locator('.workspace-ai-tabs .ant-tabs-tab-active');
    await expect(activeTab).toBeVisible();
    await expect(activeTab).toHaveAttribute('data-node-key', 'artifacts');
  });

  test('should show empty state when no document is loaded', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

    // Reader pane should show empty state
    const readerPane = page.locator('.workspace-reader-pane');
    await expect(readerPane.locator('.ant-empty')).toBeVisible();
  });

  test('should have functional sidebar collapse button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

    // Sidebar should be visible initially
    await expect(page.locator('text=VibeReader Dev')).toBeVisible();

    // Click collapse button (MenuFoldOutlined)
    const collapseButton = page.locator('button').filter({ has: page.locator('.anticon-menu-fold, .anticon-menu-unfold') }).first();
    await collapseButton.click();

    // Sidebar should be hidden
    await expect(page.locator('text=VibeReader Dev')).not.toBeVisible();

    // Click expand button
    await collapseButton.click();
    await expect(page.locator('text=VibeReader Dev')).toBeVisible();
  });
});
