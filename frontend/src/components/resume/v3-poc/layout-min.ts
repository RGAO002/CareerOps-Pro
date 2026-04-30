export interface LayoutInput {
  rowElements: HTMLElement[];           // outer .row elements in PM doc order
  pageHeightPx: number;                 // e.g. 11in × dpi
  marginTopPx: number;                  // var(--page-margin-top)
  marginBottomPx: number;               // var(--page-margin-bottom)
  screenGapPx: number;                  // var(--page-break-screen-gap) — visual gap between page cards on screen
}

export interface PageBreak {
  /** PM document position immediately after this row ends — where to insert the widget decoration. */
  afterRowIndex: number;
  pageIndex: number;
  /** Per-break inline height for the screen widget decoration. Equals the
   *  unused vertical space at the bottom of the breaking page (which depends
   *  on the breaking row's height) PLUS bottomMargin + screenGap + topMargin
   *  for the next page. This is what makes the next page's first row line up
   *  with the next .page-card on screen. On print this value is ignored
   *  (CSS @media print sets `height: 0`; @page handles real margins). */
  screenHeightPx: number;
}

export interface PageGeometry {
  pageIndex: number;
  topPx: number;                        // distance from canvas top to this page-card's top edge
  heightPx: number;                     // page card visual height (always pageHeightPx)
}

export interface LayoutOutput {
  pageBreaks: PageBreak[];
  pageGeometries: PageGeometry[];
}

export function computeLayout(input: LayoutInput): LayoutOutput {
  const { rowElements, pageHeightPx, marginTopPx, marginBottomPx, screenGapPx } = input;
  const contentHeightPerPage = pageHeightPx - marginTopPx - marginBottomPx;

  const pageBreaks: PageBreak[] = [];
  const pageGeometries: PageGeometry[] = [];
  let pageIndex = 0;

  // KEY INSIGHT (P1 review fix):
  //
  // Page cards sit on a FIXED visual grid: pageN.top = N * (pageHeight + screenGap).
  // The grid is independent of where breaks happen — every page card is a full
  // pageHeight tall and they're separated by exactly screenGap.
  //
  // The dynamic per-break `screenHeightPx` is what fills the FLOW so that the
  // first row of page N+1 lands at canvas Y == cardN+1.top + topMargin. The
  // formula remainingSpace + bottomMargin + screenGap + topMargin computes
  // exactly this flow-fill amount; it does NOT define cardN+1.top.
  //
  // Concretely (1000px page, 100/100 margins, 32px gap):
  //   page1 card: top=0, bottom=1000
  //   page2 card: top=1032, bottom=2032
  //   page3 card: top=2064, bottom=3064
  //   etc.
  //
  // The break decoration's height varies (depends on which row caused the break),
  // but the CARD positions don't.
  //
  // POSITION-BASED MEASUREMENT (bug fix):
  //
  // We must NOT track progress by summing row heights alone.  CSS margins
  // between rows (.row-heading { margin: 16px 0 8px }, .row-plain { margin:
  // 4px 0 }, etc.) create gaps that are NOT captured by rect.height.
  // Summing heights therefore under-counts the real vertical space used,
  // causing the algorithm to place rows that visually overflow the page card
  // onto page 1 instead of page 2.
  //
  // Fix: anchor against the first row's viewport top and measure every row's
  // position as (rect.top − firstRowTop).  This captures margins and any
  // other layout contributions automatically, since getBoundingClientRect()
  // reflects the actual rendered position.
  //
  // On subsequent pages, reset the anchor to the first row on that page and
  // compare against the same contentHeightPerPage budget.

  pageGeometries.push({ pageIndex, topPx: 0, heightPx: pageHeightPx });

  // Read all rects once in a single synchronous pass to avoid interleaved
  // layout thrashing.
  const rects = rowElements.map((el) => el.getBoundingClientRect());

  // viewport top of the first row on the current page.  Used as the anchor
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
    // Guard yFromPageStart > 0 so we never break before the first row on a page.
    if (rowBottomFromPageStart > contentHeightPerPage && yFromPageStart > 0) {
      // Remaining content space on the breaking page = budget minus where this
      // row's top is.  Can be small (row just barely didn't fit) or large (a
      // tall inter-row gap pushed the row past the boundary).
      const remainingContentSpace = contentHeightPerPage - yFromPageStart;
      // Screen widget height: remainingSpace + bottomMargin + screenGap + topMargin
      // pushes the next row to land exactly at next-card-top + topMargin.
      const screenHeightPx = remainingContentSpace + marginBottomPx + screenGapPx + marginTopPx;

      pageBreaks.push({ afterRowIndex: i - 1, pageIndex, screenHeightPx });

      // Next card sits on the fixed grid:
      //   nextCardTop = currentCardTop + pageHeightPx + screenGapPx
      pageIndex += 1;
      const nextCardTopPx = pageIndex * (pageHeightPx + screenGapPx);
      pageGeometries.push({ pageIndex, topPx: nextCardTopPx, heightPx: pageHeightPx });

      // Reset anchor to this row — it is the first row on the new page.
      // All subsequent rows on this page will be measured relative to it,
      // capturing their real inter-row spacing correctly.
      pageFirstRowTop = rect.top;
    }
  }

  return { pageBreaks, pageGeometries };
}
