const { test, expect } = require('@playwright/test');
const path = require('path');

const DEMO_ASSETS = path.join(__dirname, '..', 'demo-assets');

/**
 * P0: Markdown rendering
 * Behavior: When user uploads a Markdown file, it should be rendered with proper formatting via MarkdownRenderer.
 */
test.describe('Markdown Rendering', () => {
  test('should upload and render markdown file', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(path.join(DEMO_ASSETS, 'sample.md'));

    // Wait for document to load
    await expect(page.locator('.document-reader-markdown')).toBeVisible({ timeout: 10000 });

    // Document name should appear in header
    await expect(page.locator('.workspace-pane-header')).toContainText('sample.md');

    // Markdown content should be rendered (check for common markdown elements)
    const markdownContent = page.locator('.document-reader-markdown');
    await expect(markdownContent).not.toBeEmpty();
  });

  test('should render markdown with proper HTML structure', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(path.join(DEMO_ASSETS, 'sample.md'));

    await expect(page.locator('.document-reader-markdown')).toBeVisible({ timeout: 10000 });

    // Should have some rendered HTML content (paragraphs, headings, etc.)
    const markdownContent = page.locator('.document-reader-markdown');
    const html = await markdownContent.innerHTML();
    expect(html.length).toBeGreaterThan(0);

    // Should contain markdown-rendered elements
    const hasElements = await markdownContent.locator('p, h1, h2, h3, ul, ol, code').count();
    expect(hasElements).toBeGreaterThan(0);
  });
});

/**
 * P0: Text document rendering
 * Behavior: When user uploads a text file, it should be displayed with pre-wrap formatting.
 */
test.describe('Text Document Rendering', () => {
  test('should upload and render text file', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(path.join(DEMO_ASSETS, 'sample.txt'));

    // Wait for document to load
    await expect(page.locator('[data-testid="text-document-content"]')).toBeVisible({ timeout: 10000 });

    // Document name should appear in header
    await expect(page.locator('.workspace-pane-header')).toContainText('sample.txt');

    // Content should not be empty
    const content = page.locator('[data-testid="text-document-content"]');
    await expect(content).not.toBeEmpty();
  });
});

/**
 * P0: HTML document rendering
 * Behavior: When user uploads an HTML file, sanitized text content should be displayed.
 */
test.describe('HTML Document Rendering', () => {
  test('should upload and render HTML file with sanitized content', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.workspace-body')).toBeVisible({ timeout: 10000 });

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(path.join(DEMO_ASSETS, 'sample.html'));

    // Wait for document to load
    await expect(page.locator('[data-testid="html-document-content"]')).toBeVisible({ timeout: 10000 });

    // Document name should appear in header
    await expect(page.locator('.workspace-pane-header')).toContainText('sample.html');

    // Content should not be empty
    const content = page.locator('[data-testid="html-document-content"]');
    await expect(content).not.toBeEmpty();
  });
});
