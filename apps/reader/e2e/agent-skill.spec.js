const { test, expect } = require('@playwright/test');
const path = require('path');

const DEMO_ASSETS = path.join(__dirname, '..', 'demo-assets');

/**
 * Minimal reading-agent skill smoke (web Playwright).
 *
 * Product task UI reads Tauri persistent storage only. On plain Vite web there is
 * no SQLite bridge, so this suite installs a tiny in-memory Tauri invoke mock
 * for task + harmless no-op storage commands. The agent itself is the offline
 * local paper_overview model (no cloud LLM).
 */
test.describe('Reading agent skill entry', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('vibereader.onboarding.dismissed', '1');
      } catch (_) {
        /* ignore */
      }

      const tasks = new Map();

      function hydrateTask(record = {}) {
        let result = record.result;
        if (!result && record.resultJson) {
          try {
            result = JSON.parse(record.resultJson);
          } catch (_) {
            result = null;
          }
        }
        return result && typeof result === 'object' ? { ...record, result } : { ...record };
      }

      async function invoke(cmd, args = {}) {
        if (cmd === 'storage_init') {
          return { initialized: true, engine: 'e2e-memory' };
        }
        if (cmd === 'storage_upsert_task') {
          const input = { ...(args.input || {}) };
          if (!input.id) input.id = `task-e2e-${Date.now()}`;
          tasks.set(input.id, input);
          return hydrateTask(input);
        }
        if (cmd === 'storage_list_tasks') {
          const documentId = args.documentId || null;
          return [...tasks.values()]
            .filter((task) => !documentId || task.documentId === documentId)
            .map(hydrateTask);
        }
        if (cmd === 'storage_load_task') {
          const record = tasks.get(args.id);
          return record ? hydrateTask(record) : null;
        }
        if (cmd.startsWith('storage_list_') || cmd.startsWith('storage_replace_')) {
          return [];
        }
        if (cmd.startsWith('storage_load_') || cmd.startsWith('storage_search_')) {
          return null;
        }
        if (
          cmd.startsWith('storage_upsert_')
          || cmd.startsWith('storage_create_')
          || cmd.startsWith('storage_export_')
          || cmd.startsWith('storage_import_')
        ) {
          return args.input || args || { ok: true };
        }
        if (cmd.startsWith('storage_delete_')) {
          return true;
        }
        return null;
      }

      // Make isPersistentStorageAvailable() true and satisfy @tauri-apps/api/core invoke.
      window.__TAURI__ = { mock: true };
      window.__TAURI_INTERNALS__ = {
        invoke,
        transformCallback: (callback) => callback,
        unregisterCallback: () => {},
        convertFileSrc: (filePath) => filePath,
      };
    });

    // Fail closed if the app accidentally hits external model APIs.
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      const isExternal =
        /^https?:\/\//i.test(url)
        && !url.includes('127.0.0.1')
        && !url.includes('localhost');
      const looksLikeLlm =
        /api\.|openai|anthropic|minimaxi|minimax|x\.ai|grok|openrouter|together|fireworks/i.test(
          url,
        );
      if (isExternal && looksLikeLlm) {
        await route.abort('failed');
        return;
      }
      await route.continue();
    });
  });

  test('clicks 论文总览 and shows a succeeded local agent task', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(path.join(DEMO_ASSETS, 'sample.md'));
    await expect(page.locator('.document-reader-markdown')).toBeVisible({ timeout: 10000 });

    // Document open switches right pane to 阅读路线 (TaskStatusPanel lives here).
    const navigatorTab = page.locator(
      '.workspace-ai-tabs .ant-tabs-tab[data-node-key="navigator"]',
    );
    if (!(await navigatorTab.evaluate((el) => el.classList.contains('ant-tabs-tab-active')))) {
      await navigatorTab.locator('.ant-tabs-tab-btn').click({ force: true });
    }
    await expect(navigatorTab).toHaveClass(/ant-tabs-tab-active/, { timeout: 5000 });

    const taskPanel = page.locator('.task-status-panel');
    await expect(taskPanel).toBeVisible({ timeout: 5000 });

    const overviewButton = taskPanel.getByRole('button', { name: '论文总览' });
    await expect(overviewButton).toBeVisible({ timeout: 5000 });
    await overviewButton.click();

    const taskItem = taskPanel.locator('.task-status-item').filter({
      hasText: '论文总览',
    }).first();
    await expect(taskItem).toBeVisible({ timeout: 15000 });
    await expect(taskItem.getByText('已完成')).toBeVisible({ timeout: 15000 });
    await expect(taskItem).toContainText(/Paper overview|sample\.md|Initial source scan/i, {
      timeout: 5000,
    });
  });
});
