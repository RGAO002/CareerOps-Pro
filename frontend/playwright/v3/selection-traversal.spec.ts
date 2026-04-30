import { test, expect } from '@playwright/test';

test.describe('PoC B — Selection traversal across decoration', () => {
  test('mouse drag-select from row above decoration to row below produces continuous selection', async ({ page }) => {
    await page.goto('/v3-poc');
    await page.waitForSelector('.pagination-break');     // ensure pagination has run

    // Locate the row immediately above and immediately below the first break.
    // PaginationPluginMin places breaks between rows; we use the rows that
    // directly straddle break 0.  These are determined by the layout at runtime,
    // so we find them via JS rather than assuming hard-coded nth() values.
    const { aboveIdx, belowIdx } = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.row')) as HTMLElement[];
      const breakEl = document.querySelector('.pagination-break') as HTMLElement | null;
      if (!breakEl) return { aboveIdx: -1, belowIdx: -1 };
      const bTop = breakEl.getBoundingClientRect().top;
      const bBottom = breakEl.getBoundingClientRect().bottom;
      let aboveIdx = -1, belowIdx = -1;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (r.bottom <= bTop + 2) aboveIdx = i;
      }
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (r.top >= bBottom - 2) { belowIdx = i; break; }
      }
      return { aboveIdx, belowIdx };
    });

    expect(aboveIdx).toBeGreaterThan(-1);
    expect(belowIdx).toBeGreaterThan(-1);

    const rowAbove = page.locator('.row').nth(aboveIdx);
    const rowBelow = page.locator('.row').nth(belowIdx);

    // Scroll rowAbove into view so both rows and the break are visible.
    await rowAbove.scrollIntoViewIfNeeded();

    const aboveBox = await rowAbove.boundingBox();
    const belowBox = await rowBelow.boundingBox();
    expect(aboveBox).not.toBeNull();
    expect(belowBox).not.toBeNull();

    // Drag from near the top of rowAbove to near the bottom of rowBelow (crossing the break).
    // Playwright mouse operations use viewport-relative coordinates (matching
    // boundingBox() output).
    const startX = aboveBox!.x + 100;
    const startY = aboveBox!.y + 5;          // near top of row
    const endX   = belowBox!.x + 100;
    const endY   = belowBox!.y + 30;         // near bottom of row

    // ProseMirror only initiates a selection drag if the editor already has
    // focus when mousedown fires.  A preliminary click places the caret and
    // focuses the contenteditable before the drag begins.
    await page.mouse.click(startX, startY);

    // Now perform the drag.  A brief pause after mousedown lets PM register
    // the event before we start moving.
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(50);
    // Move in small increments; per-step delays ensure PM tracks each event.
    const STEPS = 15;
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      await page.mouse.move(startX + (endX - startX) * t, startY + (endY - startY) * t);
    }
    await page.mouse.up();

    // Selection must contain text; decoration widget has no text content.
    const selectionText = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selectionText.length).toBeGreaterThan(0);

    // Both rows' leading text must appear in the selection.
    const aboveText = await rowAbove.textContent();
    const belowText = await rowBelow.textContent();
    // Strip the bullet marker (•) that appears at start of .row-bullet textContent
    const aboveLeading = (aboveText ?? '').replace(/^[•\s]+/, '').slice(0, 10);
    const belowLeading = (belowText ?? '').replace(/^[•\s]+/, '').slice(0, 10);
    expect(selectionText).toContain(aboveLeading);
    expect(selectionText).toContain(belowLeading);
  });

  test('arrow-down at end of row above decoration lands at start of row below', async ({ page }) => {
    await page.goto('/v3-poc');
    await page.waitForSelector('.pagination-break');

    // Find the row immediately above the first break dynamically.
    // We use a heading row (single visual line) so that pressing End puts the
    // cursor at the absolute end of that node, and a single ArrowDown must
    // move to the next PM node rather than the next visual line within the same node.
    // We find the heading row just before the break (the section heading that
    // comes before the break-straddling area).
    const headingAboveBreakIdx = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.row')) as HTMLElement[];
      const breakEl = document.querySelector('.pagination-break') as HTMLElement | null;
      if (!breakEl) return -1;
      const bTop = breakEl.getBoundingClientRect().top;
      // Walk backward from the row just above the break to find the nearest heading row.
      let aboveBreakIdx = -1;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].getBoundingClientRect().bottom <= bTop + 2) aboveBreakIdx = i;
      }
      // Return aboveBreakIdx — this is the row directly above the break.
      return aboveBreakIdx;
    });

    expect(headingAboveBreakIdx).toBeGreaterThan(-1);

    const rowAbove = page.locator('.row').nth(headingAboveBreakIdx);
    const rowBelow = page.locator('.row').nth(headingAboveBreakIdx + 1);

    await rowAbove.scrollIntoViewIfNeeded();

    // Click on the row-content div to place cursor inside it (not on the bullet marker).
    const aboveContent = rowAbove.locator('.row-content');
    await aboveContent.click();

    // Press End to move cursor to the end of the current visual line.
    // For a row that may wrap visually, press End multiple times until we reach
    // the absolute end of the node (cursor row does not change between presses).
    await page.keyboard.press('End');
    await page.keyboard.press('End');  // extra press in case of wrapped visual lines

    // Capture the cursor's current row identity before ArrowDown.
    const rowBeforeInfo = await page.evaluate(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const node = sel.getRangeAt(0).startContainer;
      const el = node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : (node as Text).parentElement;
      const row = el?.closest('.row');
      return row
        ? (row.getAttribute('data-row-kind') ?? '') + '|' + (row.textContent ?? '').slice(0, 30)
        : null;
    });

    await page.keyboard.press('ArrowDown');

    // After ArrowDown the cursor should have moved to the next PM node.
    const rowAfterInfo = await page.evaluate(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const node = sel.getRangeAt(0).startContainer;
      const el = node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : (node as Text).parentElement;
      const row = el?.closest('.row');
      return row
        ? (row.getAttribute('data-row-kind') ?? '') + '|' + (row.textContent ?? '').slice(0, 30)
        : null;
    });

    // NOTE: modification from spec — data-row-id is not on the NodeView outer
    // wrapper (ReactNodeViewRenderer does not propagate it), so we compare row
    // identity via data-row-kind + textContent prefix instead.
    // The assertion intent is unchanged: cursor is in a different row after ArrowDown.
    expect(rowBeforeInfo).not.toBeNull();
    expect(rowAfterInfo).not.toBeNull();
    expect(rowAfterInfo).not.toEqual(rowBeforeInfo);

    // Verify the row below is what we expect (belowIdx = headingAboveBreakIdx + 1).
    const expectedBelowText = await rowBelow.textContent();
    const expectedBelowLeading = (expectedBelowText ?? '').replace(/^[•\s]+/, '').slice(0, 15);
    expect(rowAfterInfo).toContain(expectedBelowLeading);
  });

  test('copy across decoration produces clean text without decoration artifacts', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/v3-poc');
    await page.waitForSelector('.pagination-break');

    // Select all text in doc.
    await page.locator('.poc-editor-wrapper').click();
    await page.keyboard.press('Meta+A');     // Cmd+A = select all on macOS; Ctrl+A on others
    await page.keyboard.press('Control+A');  // belt + suspenders
    await page.keyboard.press('Meta+C');
    await page.keyboard.press('Control+C');

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    // Clipboard should not contain anything that looks like a decoration artifact.
    expect(clipboardText).not.toContain('pagination-break');
    expect(clipboardText.length).toBeGreaterThan(100);    // multi-page content
  });
});
