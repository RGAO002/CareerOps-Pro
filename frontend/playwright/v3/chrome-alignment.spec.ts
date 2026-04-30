import { test, expect } from '@playwright/test';

test.describe('PoC C — PageChromeLayer alignment with plugin output', () => {
  test('page card geometry matches plugin pageGeometries (single-SoT contract)', async ({ page }) => {
    await page.goto('/v3-poc');
    await page.waitForSelector('.page-card');
    await page.waitForSelector('.pagination-break');

    // PageChromeLayerMin (Task 5) writes the plugin-source geometry onto each
    // card as data attributes: data-plugin-top, data-plugin-height. The test
    // verifies the rendered card's actual layout MATCHES those values — i.e.
    // PageChromeLayer is a pure pass-through of plugin state, not its own
    // recomputation. This directly enforces C3 (single SoT).
    const cardCount = await page.locator('.page-card').count();
    expect(cardCount).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < cardCount; i++) {
      const card = page.locator('.page-card').nth(i);
      const pluginTop = await card.getAttribute('data-plugin-top');
      const pluginHeight = await card.getAttribute('data-plugin-height');
      expect(pluginTop).not.toBeNull();
      expect(pluginHeight).not.toBeNull();

      const box = await card.boundingBox();
      expect(box).not.toBeNull();

      // Card must be positioned exactly where the plugin said it should be.
      // The card's offsetTop within the canvas root + canvas root's offsetTop
      // adds up to bounding-box .y. We compare against pluginTop directly.
      const cardOffsetTop = await card.evaluate(el => (el as HTMLElement).offsetTop);
      const cardOffsetHeight = await card.evaluate(el => (el as HTMLElement).offsetHeight);

      expect(Math.abs(cardOffsetTop - parseFloat(pluginTop!))).toBeLessThan(1);
      expect(Math.abs(cardOffsetHeight - parseFloat(pluginHeight!))).toBeLessThan(1);
    }
  });

  test('row content renders within page card (not crossing chrome boundaries visually)', async ({ page }) => {
    await page.goto('/v3-poc');
    await page.waitForSelector('.page-card');

    const card1 = await page.locator('.page-card').nth(0).boundingBox();
    expect(card1).not.toBeNull();

    const allRows = await page.locator('.row').all();
    let lastRowTopOnPage1 = 0;
    for (const row of allRows) {
      const rb = await row.boundingBox();
      if (!rb) continue;
      // Row should be either fully inside page 1 or fully past it.
      const isOnPage1 = rb.y >= card1!.y && rb.y + rb.height <= card1!.y + card1!.height;
      const isFullyPast = rb.y >= card1!.y + card1!.height;
      expect(isOnPage1 || isFullyPast).toBe(true);
      if (isOnPage1) lastRowTopOnPage1 = rb.y + rb.height;
    }
    // The last row on page 1 should be reasonably close to the bottom of the content area
    // (i.e., we don't have huge dead space at the bottom of pages).
    expect(card1!.y + card1!.height - lastRowTopOnPage1).toBeLessThan(200);  // < 2in dead space
  });

  test('chrome layer is display:none on print', async ({ page }) => {
    await page.goto('/v3-poc/print');
    await expect(page.locator('body[data-paginated="true"]')).toBeVisible();

    // Emulate print media.
    await page.emulateMedia({ media: 'print' });
    const chromeDisplay = await page.locator('.page-chrome-layer').evaluate(el =>
      window.getComputedStyle(el).display);
    expect(chromeDisplay).toBe('none');
  });
});
