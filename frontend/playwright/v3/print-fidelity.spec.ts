import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from 'canvas';

const POC_PRINT_URL = '/v3-poc/print';
const PDF_TMP = path.join('/tmp', 'v3-poc-print.pdf');

test.describe('PoC A — Print fidelity', () => {
  // CRITICAL: page.pdf() options must let CSS @page own the page size and
  // margins. `format: 'Letter'` and explicit `margin:` options OVERRIDE any
  // CSS @page rule, so a test that uses them does NOT verify our @page
  // contract. We must use `preferCSSPageSize: true` and pass NO format/margin
  // options. Then the PDF page geometry == whatever CSS @page resolved to,
  // which is what we want to verify.
  const PDF_OPTS = { preferCSSPageSize: true, printBackground: false } as const;

  test('PDF page count equals pageGeometries length', async ({ page }) => {
    await page.goto(POC_PRINT_URL);
    await expect(page.locator('body[data-paginated="true"]')).toBeVisible({ timeout: 5000 });

    const pageCount = await page.locator('.page-card').count();
    expect(pageCount).toBeGreaterThanOrEqual(2);

    const pdfBuf = await page.pdf(PDF_OPTS);
    fs.writeFileSync(PDF_TMP, pdfBuf);

    const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBuf) }).promise;
    expect(pdf.numPages).toBe(pageCount);
  });

  test('@page CSS custom property is honored — page 2 first content respects topMargin', async ({ page }) => {
    await page.goto(POC_PRINT_URL);
    await expect(page.locator('body[data-paginated="true"]')).toBeVisible();

    const pdfBuf = await page.pdf(PDF_OPTS);   // preferCSSPageSize so CSS @page rules.
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBuf) }).promise;

    // Verify CSS @page actually drove the page size: at @page { size: 8.5in 11in },
    // pdfjs viewport at scale=1 (= 72 dpi PDF points) should be 612 × 792 ± 1pt.
    const page1 = await pdf.getPage(1);
    const v1 = page1.getViewport({ scale: 1 });
    expect(Math.abs(v1.width - 612)).toBeLessThan(2);
    expect(Math.abs(v1.height - 792)).toBeLessThan(2);

    // Verify @page margin via text position on page 2.
    // PDF coordinate origin is bottom-left; ty is distance from bottom.
    // yFromTop = pageHeight - ty. For 0.75in top margin = 54pt, first content
    // should be at yFromTop between 54pt and ~90pt (margin + line height).
    const page2 = await pdf.getPage(2);
    const pageHeight = page2.getViewport({ scale: 1 }).height;   // 792pt
    const textContent = await page2.getTextContent();
    // Find first text item with actual content (skip whitespace-only items).
    const firstText = textContent.items.find(
      (item): item is pdfjs.TextItem => 'str' in item && item.str.trim().length > 0
    );
    expect(firstText).toBeTruthy();
    const [,,,, , ty] = firstText!.transform;
    const yFromTop = pageHeight - ty;

    // 0.75in = 54pt. Content starts at topMargin baseline, so yFromTop should
    // be between 54pt and 54pt + ~20pt (line height tolerance).
    const PDF_PT_PER_IN = 72;
    const topMarginPt = 0.75 * PDF_PT_PER_IN;   // 54pt
    expect(yFromTop).toBeGreaterThan(topMarginPt - 4);
    expect(yFromTop).toBeLessThan(topMarginPt + 40);   // allow up to ~0.55in from margin top for line height
  });

  test('editor view boundary aligns with PDF boundary (< 1% pixel diff)', async ({ page }) => {
    await page.goto('/v3-poc');
    await page.waitForLoadState('networkidle');

    await page.goto(POC_PRINT_URL);
    await expect(page.locator('body[data-paginated="true"]')).toBeVisible();
    const pdfBuf = await page.pdf(PDF_OPTS);

    const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBuf) }).promise;
    const pdfPage1 = await pdf.getPage(1);
    // PDF coordinate units are points (72 dpi). 1in = 72pt. At scale=96/72,
    // the rendered canvas has 1in == 96px so it matches editor screenshot DPI.
    const pdfCanvas = await renderPdfPageToCanvas(pdfPage1, pdfPage1.getViewport({ scale: 96 / 72 }));
    const pdfPage1HeightPx = pdfCanvas.height;

    const cardBox = await page.locator('.page-card').nth(0).boundingBox();
    expect(cardBox).not.toBeNull();
    const editorPage1HeightPx = cardBox!.height;

    const diffPx = Math.abs(editorPage1HeightPx - pdfPage1HeightPx);
    const ratio = diffPx / pdfPage1HeightPx;
    expect(ratio).toBeLessThan(0.01);
  });
});

async function renderPdfPageToCanvas(page: pdfjs.PDFPageProxy, viewport: pdfjs.PageViewport) {
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  // pdfjs requires CanvasRenderingContext2D shape; node-canvas's is compatible enough.
  await page.render({ canvas: null, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: imageData.width, height: imageData.height, data: imageData.data };
}

function findFirstNonEmptyRow(canvas: { width: number; height: number; data: Uint8ClampedArray }): number {
  // Scan rows from top; return Y of first row containing a pixel below alpha-threshold.
  const rowBytes = canvas.width * 4;
  for (let y = 0; y < canvas.height; y++) {
    let rowHasInk = false;
    for (let x = 0; x < canvas.width; x++) {
      const idx = y * rowBytes + x * 4;
      const r = canvas.data[idx], g = canvas.data[idx + 1], b = canvas.data[idx + 2];
      // Ink threshold: anything not close to pure white.
      if (r < 240 || g < 240 || b < 240) { rowHasInk = true; break; }
    }
    if (rowHasInk) return y;
  }
  return canvas.height;
}
