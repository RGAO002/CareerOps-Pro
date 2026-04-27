import { test, expect } from '@playwright/test';

const RESUME_ID = '__e2e_test__';

test.describe('v2 visual equivalence', () => {
  test('editor renders with paginated flag', async ({ page }) => {
    await page.goto(`/resume/${RESUME_ID}?hideInteractionLayer=1`);
    await page.waitForSelector('body[data-paginated="true"]', { timeout: 30_000 });
    const v = await page.evaluate(() => document.body.dataset.paginated);
    expect(v).toBe('true');
    // Verify at least one page card rendered
    const pageCards = await page.locator('.page-card').count();
    expect(pageCards).toBeGreaterThanOrEqual(1);
  });

  test('print route renders with paginated flag', async ({ page }) => {
    await page.goto(`/resume/${RESUME_ID}/print`);
    await page.waitForSelector('body[data-paginated="true"]', { timeout: 30_000 });
    const v = await page.evaluate(() => document.body.dataset.paginated);
    expect(v).toBe('true');
    const pageCards = await page.locator('.page-card').count();
    expect(pageCards).toBeGreaterThanOrEqual(1);
  });

  test('editor and print render same number of pages', async ({ page }) => {
    await page.goto(`/resume/${RESUME_ID}?hideInteractionLayer=1`);
    await page.waitForSelector('body[data-paginated="true"]', { timeout: 30_000 });
    const editPageCount = await page.locator('.page-card').count();

    await page.goto(`/resume/${RESUME_ID}/print`);
    await page.waitForSelector('body[data-paginated="true"]', { timeout: 30_000 });
    const printPageCount = await page.locator('.page-card').count();

    expect(printPageCount).toBe(editPageCount);
  });

  test('each page contains the test resume name', async ({ page }) => {
    await page.goto(`/resume/${RESUME_ID}/print`);
    await page.waitForSelector('body[data-paginated="true"]', { timeout: 30_000 });
    const text = await page.locator('[data-canvas-root]').textContent();
    expect(text).toContain('E2E Test');
    expect(text).toContain('Engineer @ Test Co');
  });
});
