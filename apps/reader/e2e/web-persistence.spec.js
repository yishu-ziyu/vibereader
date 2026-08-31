const { test, expect } = require('@playwright/test');
const path = require('path');

const DEMO_ASSETS = path.join(__dirname, '..', 'demo-assets');

async function uploadPdfAndWaitForRender(page, filename) {
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(path.join(DEMO_ASSETS, filename));

  await expect(page.locator('.workspace-reader-pane canvas')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.workspace-reader-pane .ant-spin-spinning')).toHaveCount(0, { timeout: 30000 });
}

async function readCurrentDocumentId(page) {
  return page.waitForFunction(() => {
    const raw = window.localStorage.getItem('vibereader.web.documents');
    const documents = raw ? JSON.parse(raw) : [];
    return documents[0]?.id || null;
  }).then((handle) => handle.jsonValue());
}

test.describe('Web persistence refresh loop', () => {
  test('restores document-bound artifacts and annotations after reopening the same file', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

    await uploadPdfAndWaitForRender(page, 'wonderland_short.pdf');
    const documentId = await readCurrentDocumentId(page);
    expect(documentId).toBeTruthy();

    await page.evaluate((id) => {
      window.localStorage.setItem('vibereader.artifacts', JSON.stringify([
        {
          id: 'artifact-persisted',
          documentId: id,
          type: 'lens_card',
          goal: 'Persisted Lens Card',
          verificationStatus: 'grounded',
          createdAt: 200,
          currentContent: {
            selectionText: 'Persisted selected passage.',
            explanation: 'Persisted explanation after reload.',
            claims: [
              { text: 'Persisted claim.', sourceSpanIds: ['span-persisted'], inference: false },
            ],
          },
          originalContent: {
            selectionText: 'Persisted selected passage.',
            explanation: 'Persisted explanation after reload.',
          },
        },
        {
          id: 'artifact-other-doc',
          documentId: 'other-document',
          type: 'lens_card',
          goal: 'Other Document Card',
          verificationStatus: 'grounded',
          createdAt: 300,
          currentContent: {
            selectionText: 'Other document passage must stay hidden.',
            explanation: 'Hidden other document explanation.',
          },
        },
      ]));
      window.localStorage.setItem('vibereader.annotations', JSON.stringify([
        {
          id: 'annotation-persisted',
          documentId: id,
          page: 1,
          selectedText: 'Persisted annotation text.',
          note: 'Persisted note after reload.',
          color: 'blue',
          createdAt: 200,
        },
        {
          id: 'annotation-other-doc',
          documentId: 'other-document',
          page: 1,
          selectedText: 'Other document annotation must stay hidden.',
          color: 'yellow',
          createdAt: 300,
        },
      ]));
    }, documentId);

    await page.reload();
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('wonderland_short.pdf')).toBeVisible({ timeout: 10000 });

    await uploadPdfAndWaitForRender(page, 'wonderland_short.pdf');
    await expect(page.getByText('Persisted selected passage.')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Persisted explanation after reload.')).toBeVisible();
    await expect(page.getByText('Other document passage must stay hidden.')).toHaveCount(0);

    await expect(page.locator('.pdf-annotation-list')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Persisted annotation text.')).toBeVisible();
    await expect(page.getByText(/Persisted note after reload/)).toBeVisible();
    await expect(page.getByText('Other document annotation must stay hidden.')).toHaveCount(0);
  });
});
