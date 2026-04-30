// T42 — M7 edge-case e2e specs.
//
// Covers:
//   1. Empty doc renders without crash; data-paginated flips to true.
//   2. Single-row doc (header.name only) renders; data-paginated true; 1 page.
//   3. 5-page doc renders 5 page geometries; scrolls.
//   4. All 9 SectionRoles render with their heading text.
//
// Uses the /print-v3 route plus named fixtures defined in
// frontend/src/app/print-v3/fixtures.ts (T35 registry, T42 additions).

import { test, expect } from '@playwright/test';

const URL_EMPTY      = '/print-v3?fixture=empty';
const URL_SINGLE_ROW = '/print-v3?fixture=singleRow';
const URL_FIVE_PAGE  = '/print-v3?fixture=fivePage';
const URL_ALL_ROLES  = '/print-v3?fixture=allRoles';

test.describe('T42 — M7 edge cases', () => {
  test('Empty doc renders without crash; data-paginated flips to true with 0 rows', async ({ page }) => {
    await page.goto(URL_EMPTY);
    // Even with zero rows, the pipeline must converge — data-paginated must
    // flip to 'true' (not stuck at 'false' or 'false-timeout').
    await expect(page.locator('body[data-paginated="true"]')).toBeVisible({ timeout: 10_000 });
    // PM schema requires at least one node, so an empty fixture is hydrated
    // with a single placeholder row by the editor. The contract here is
    // "doesn't crash + pipeline converges", not "literally 0 DOM rows".
    const rowCount = await page.locator('[data-row-id]').count();
    expect(rowCount).toBeLessThanOrEqual(1);
    // body data-paginated must be exactly 'true', not 'false-...' bail-out.
    const flag = await page.evaluate(() => document.body.getAttribute('data-paginated'));
    expect(flag).toBe('true');
  });

  test('Single-row doc (header.name only) renders correctly; data-paginated true; 1 page', async ({ page }) => {
    await page.goto(URL_SINGLE_ROW);
    await expect(page.locator('body[data-paginated="true"]')).toBeVisible({ timeout: 10_000 });

    // Exactly one row.
    const rowCount = await page.locator('[data-row-id]').count();
    expect(rowCount).toBe(1);

    // Single page → zero pagination breaks.
    const breakCount = await page.locator('.pagination-break').count();
    expect(breakCount).toBe(0);

    // Header name text appears.
    await expect(page.locator('[data-row-id="r-name"]')).toContainText('Single Row Doc');
  });

  test('5-page doc renders 5 page geometries; scroll through; all visible', async ({ page }) => {
    await page.goto(URL_FIVE_PAGE);
    await expect(page.locator('body[data-paginated="true"]')).toBeVisible({ timeout: 15_000 });

    // Pagination plugin emits one .pagination-break widget between adjacent
    // pages → 5 pages = 4 break widgets. The fixture is engineered to
    // overflow into ≥5 pages; if the layout differs slightly we accept ≥4.
    const breakCount = await page.locator('.pagination-break').count();
    expect(breakCount).toBeGreaterThanOrEqual(4);

    // Confirm via PDF export count as well — most authoritative.
    const pdfBuf = await page.pdf({ preferCSSPageSize: true, printBackground: false });
    // Lightweight PDF page-count parse: count '/Type /Page' occurrences.
    // Avoids pulling pdfjs into this spec when a coarse count is enough.
    const text = pdfBuf.toString('latin1');
    const pageMatches = text.match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pageMatches.length).toBeGreaterThanOrEqual(5);
  });

  test('All 9 SectionRoles render with correct heading text', async ({ page }) => {
    await page.goto(URL_ALL_ROLES);
    await expect(page.locator('body[data-paginated="true"]')).toBeVisible({ timeout: 10_000 });

    const expectedHeadings = [
      'EXPERIENCE', 'EDUCATION', 'SKILLS', 'PROJECTS',
      'AWARDS', 'PUBLICATIONS', 'VOLUNTEER', 'SUMMARY', 'CUSTOM',
    ];

    for (const heading of expectedHeadings) {
      const locator = page.locator('[data-row-id^="r-s"][data-row-id$="-h"]', { hasText: heading });
      await expect(locator.first()).toBeVisible();
    }

    // 9 section.heading rows total.
    const headingRows = await page.locator('[data-row-id$="-h"]').count();
    expect(headingRows).toBe(9);
  });
});
