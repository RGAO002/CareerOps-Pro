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
  let yWithinContent = 0;               // distance from current page's CONTENT top (= page-card top + topMargin)

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

  pageGeometries.push({ pageIndex, topPx: 0, heightPx: pageHeightPx });

  for (let i = 0; i < rowElements.length; i++) {
    const rect = rowElements[i].getBoundingClientRect();
    const rowHeight = rect.height;

    // If this row would overflow current page's content area, break before it.
    if (yWithinContent + rowHeight > contentHeightPerPage && yWithinContent > 0) {
      // Whitespace at bottom of breaking page (could not fit the row).
      const remainingContentSpace = contentHeightPerPage - yWithinContent;
      // Screen widget height: remainingSpace + bottomMargin + screenGap + topMargin
      // pushes the next row to land exactly at next-card-top + topMargin.
      const screenHeightPx = remainingContentSpace + marginBottomPx + screenGapPx + marginTopPx;

      pageBreaks.push({ afterRowIndex: i - 1, pageIndex, screenHeightPx });

      // Next card sits on the fixed grid:
      //   nextCardTop = currentCardTop + pageHeightPx + screenGapPx
      pageIndex += 1;
      const nextCardTopPx = pageIndex * (pageHeightPx + screenGapPx);
      pageGeometries.push({ pageIndex, topPx: nextCardTopPx, heightPx: pageHeightPx });
      yWithinContent = 0;
    }
    yWithinContent += rowHeight;
  }

  return { pageBreaks, pageGeometries };
}
