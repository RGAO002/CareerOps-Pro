// frontend/src/components/resume/v3/layout/LayoutEngine.ts
//
// Production v3 LayoutEngine — port of v3-poc/layout-min.ts.
//
// CRITICAL — F3 position-based measurement (M1 PoC finding, spec § 4):
//   computeLayout MUST measure rows via (rect.top - pageFirstRowTop) + rect.height,
//   NOT by summing rect.height across rows. CSS sibling margins (e.g.
//   `.row-section-heading { margin: 16px 0 8px }`) live in gap space and are
//   NOT included in rect.height. Summing heights produces wrong page breaks
//   for any document that has inter-row margins.
//
// This is the same algorithm as v3-poc/layout-min.ts (kept frozen as M1
// reference). Production lives here under v3/ and is what ResumeCanvasV3
// (T33/T34) wires.

export interface LayoutInput {
  /** Outer .row elements in PM document order (one per top-level row node). */
  rowElements: HTMLElement[];
  /** Page card height (e.g. 11in × DPI). */
  pageHeightPx: number;
  /** var(--page-margin-top). */
  marginTopPx: number;
  /** var(--page-margin-bottom). */
  marginBottomPx: number;
  /** var(--page-break-screen-gap) — visual gap between page cards on screen. */
  screenGapPx: number;
}

export interface PageBreak {
  /** Index of the row AFTER which the break decoration sits (zero-based). */
  afterRowIndex: number;
  /** Page index that the breaking row lives on (the page that fills up). */
  pageIndex: number;
  /**
   * Per-break inline height for the screen widget decoration. Equals the
   * unused vertical space at the bottom of the breaking page (depends on
   * the breaking row's position) PLUS bottomMargin + screenGap + topMargin
   * for the next page. This is what makes the next page's first row line up
   * with the next .page-card on screen. On print this value is ignored
   * (CSS @media print sets `height: 0`; @page handles real margins).
   */
  screenHeightPx: number;
}

export interface PageGeometry {
  pageIndex: number;
  /** Distance from canvas top to this page card's top edge. */
  topPx: number;
  /** Page card visual height — always equals pageHeightPx (fixed grid). */
  heightPx: number;
}

export interface LayoutOutput {
  pageBreaks: PageBreak[];
  pageGeometries: PageGeometry[];
}

/**
 * Compute page breaks + page-card geometries for a vertical stack of row
 * elements.
 *
 * Algorithm (position-based, F3):
 *   - Read all rect once (single layout flush; avoids interleaved thrashing).
 *   - Anchor at the first row's viewport top. For each row, compute
 *       yFromPageStart = rect.top - pageFirstRowTop
 *       rowBottomFromPageStart = yFromPageStart + rect.height
 *     If rowBottomFromPageStart > contentHeightPerPage AND yFromPageStart > 0
 *     (never break before the first row of a page), insert a break BEFORE
 *     this row, increment pageIndex, and reset the anchor to this row's top.
 *   - Page cards sit on a fixed visual grid:
 *       pageN.top = N × (pageHeightPx + screenGapPx)
 *     The break flow-fill height is what makes the NEXT page's first row
 *     visually line up with cardN+1.top + topMargin.
 *
 * Why position math (not height summation):
 *   CSS margins between rows (.row-section-heading { margin: 16px 0 8px },
 *   .row-plain { margin: 4px 0 }, etc.) create vertical space NOT captured
 *   by rect.height. Summing heights under-counts real used space, causing
 *   rows that visually overflow page N to be incorrectly placed on page N
 *   instead of page N+1. getBoundingClientRect().top reflects actual
 *   rendered position, so (rect.top − firstRowTop) automatically accounts
 *   for margins, gaps, and any other CSS contribution.
 */
export function computeLayout(input: LayoutInput): LayoutOutput {
  const { rowElements, pageHeightPx, marginTopPx, marginBottomPx, screenGapPx } = input;
  const contentHeightPerPage = pageHeightPx - marginTopPx - marginBottomPx;

  const pageBreaks: PageBreak[] = [];
  const pageGeometries: PageGeometry[] = [];
  let pageIndex = 0;

  pageGeometries.push({ pageIndex, topPx: 0, heightPx: pageHeightPx });

  // Read all rects once in a single synchronous pass to avoid interleaved
  // layout thrashing.
  const rects = rowElements.map((el) => el.getBoundingClientRect());

  // viewport top of the first row on the current page. Used as the anchor
  // so that CSS margins between rows (which are NOT captured by rect.height)
  // are automatically included in our content-height accounting.
  let pageFirstRowTop = rects.length > 0 ? rects[0].top : 0;

  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];

    // Distance from current page's first row top to this row's top.
    // Captures inter-row margins; comparable to (contentHeightPerPage - row.height)
    // as an upper bound for fitting.
    const yFromPageStart = rect.top - pageFirstRowTop;
    const rowBottomFromPageStart = yFromPageStart + rect.height;

    // If this row's bottom exceeds the content height budget, break before it.
    // Guard yFromPageStart > 0 so we never break before the first row on a page
    // (avoids infinite loop if a single row > pageHeight).
    if (rowBottomFromPageStart > contentHeightPerPage && yFromPageStart > 0) {
      // KEEP-TOGETHER: don't break in the middle of an entry group. If row[i]
      // shares its semanticGroupId with row[i-1] (same entry), walk back to
      // find the entry's first row on this page and break BEFORE that instead.
      // Avoids the "title + meta orphaned at bottom of page, all bullets on
      // next page" pattern where a huge widget gap sits between meta and
      // bullets. Only applies when the entry STARTS on this page — if the
      // entry already spans from page top, it's larger than a page and we
      // have no choice but to break inside.
      let breakIdx = i;
      const gid = (rowElements[i].getAttribute('data-group-id') ?? '').trim();
      if (gid) {
        let entryFirstRow = -1;
        let j = i - 1;
        while (j >= 0) {
          const prevGid = (rowElements[j].getAttribute('data-group-id') ?? '').trim();
          if (prevGid !== gid) break; // walked past entry boundary
          const yJ = rects[j].top - pageFirstRowTop;
          if (yJ <= 0) { entryFirstRow = -1; break; } // entry started at page top — can't push back
          entryFirstRow = j;
          j--;
        }
        if (entryFirstRow >= 0) breakIdx = entryFirstRow;
      }

      const breakRect = rects[breakIdx];
      const breakY = breakRect.top - pageFirstRowTop;
      const remainingContentSpace = contentHeightPerPage - breakY;
      const screenHeightPx = remainingContentSpace + marginBottomPx + screenGapPx + marginTopPx;

      pageBreaks.push({ afterRowIndex: breakIdx - 1, pageIndex, screenHeightPx });

      pageIndex += 1;
      const nextCardTopPx = pageIndex * (pageHeightPx + screenGapPx);
      pageGeometries.push({ pageIndex, topPx: nextCardTopPx, heightPx: pageHeightPx });

      pageFirstRowTop = breakRect.top;
      // Re-anchor to breakIdx. Outer for-loop's i++ will move us to
      // breakIdx + 1 next; rows breakIdx + 1..i (which we'd already scanned)
      // are measured against the new anchor and accumulated normally.
      i = breakIdx;
    }
  }

  return { pageBreaks, pageGeometries };
}
