# Resume Editor v3 — PoC Sign-off

**Date:** 2026-04-29
**Branch:** feature/resume-editor-v2
**PoC commit:** 3d531a18cd61ec48f740a6c5de121ca26b04ef58

## Summary

| PoC | Status | Notes |
|---|---|---|
| A — Print fidelity (incl. @page CSS-var) | ✅ PASS | 3/3 tests; @page CSS-var fails when used directly inside @page rule, but JS-injected static @page rule from CSS tokens works. |
| B — Selection traversal | ✅ PASS | 3/3 tests; widget decoration is transparent to PM selection / cursor / clipboard. |
| C — PageChromeLayer alignment | ✅ PASS | 3/3 tests; PageChromeLayer is a pure pass-through of plugin state. |

## A — Print fidelity

- PDF page count = pageGeometries length: ✅ PASS
- @page CSS custom property honored on Chromium: ✅ PASS (via JS-injected static @page rule from CSS tokens)
- Editor / PDF page-boundary diff < 1%: ✅ PASS

**Critical finding (reviewer concern about @page CSS-var):**

Chromium's print engine does NOT resolve `@page { margin: var(--page-margin-top) ... }` — CSS custom properties don't propagate into `@page` rules. The architecture mitigates this with `emitStaticPageRuleFromTokens()` (in `PocPrintCanvas.tsx`): at /print mount, JS reads `--page-margin-*` from `.poc-canvas-root` and emits a static `<style>@page { size: 8.5in 11in; margin: 0.75in 1in 0.75in 1in; }</style>` into `<head>`. This sidesteps the CSS-var-in-@page limitation while preserving the C5 contract (single-SoT margin tokens).

PDF page 2 first text position: ~62.6pt from top edge (expected 54pt, tolerance allows 50–94pt). The CSS-driven @page margin is honored.

PDF page size at scale=1: 612 × 792 pts (= 8.5in × 11in). CSS @page size honored.

## B — Selection traversal

- Drag-select across decoration produces continuous selection: ✅ PASS
- Arrow-down crosses decoration cleanly: ✅ PASS
- Copy across decoration produces clean text: ✅ PASS

The widget decoration's `pointer-events: none` + `user-select: none` make it transparent to ProseMirror selection logic. Cross-decoration drag-select produces a continuous selection containing both rows; clipboard text contains no decoration artifacts; arrow keys traverse the decoration without getting stuck.

Test infrastructure adjustments (documented):
- Used `closest('.row')` + textContent for cursor identification because `ReactNodeViewRenderer` doesn't propagate `data-row-id` to outer wrapper.
- Pre-click for ProseMirror focus before drag (PM only initiates drag selection if editor already has focus).

## C — Chrome alignment

- Page card geometry matches plugin within 1px: ✅ PASS
- Row content stays within page card boundaries: ✅ PASS (after layout-min.ts bug fix)
- Chrome layer hidden on print: ✅ PASS

**Bug found and fixed during PoC C:**

LayoutEngine summed `rect.height` for rows, but CSS margins between `.row` siblings (e.g. `.row-heading { margin: 16px 0 8px }`) live in the gap space and are NOT included in `rect.height`. This caused under-counting of vertical space, leading to rows straddling page-card boundaries.

Fix in `layout-min.ts`: replaced height-summation with position-based measurement. Each row's extent on a page is computed as `(rect.top - pageFirstRowTop) + rect.height`, which captures inter-row CSS margins automatically. The screenHeightPx formula (`remainingSpace + bottomMargin + screenGap + topMargin`) is algebraically unchanged.

Post-fix verification: row 23 (last row on page 1) bottom = 1019.6, card 1 bottom = 1080 (60.4px gap). Row 24 (first on page 2) at viewport top = 1202, well inside card 1 (1112..2168).

## Cross-browser

| Browser | Status | Notes |
|---|---|---|
| Chromium (primary print target) | ✅ PASS | Default Playwright project. |
| Firefox | Not tested in this PoC. | v3 deployment target is Chromium-only initially; Firefox print fidelity may need its own validation in M5 if multi-browser becomes a requirement. |
| Safari | Not tested in this PoC. | Same as Firefox. |

## Architectural findings

1. **CSS custom properties in `@page` rules are not resolved by Chromium.** Mitigation: JS-injected static @page rule (no architectural change to single-SoT contract; tokens still drive the emitted values).

2. **`ReactNodeViewRenderer` wraps each PM node in `<div class="react-renderer">`.** PaginationPlugin's selector for measuring rows must use `:scope > div > .row`, not `:scope > .row`. (Productionization in M3-M5 should encapsulate this.)

3. **Layout engine must use position-based measurement, not height-summation.** CSS margins between rows are not in `rect.height`. (Plan reviewer round 4 had assumed simple summation — the bug surfaced empirically in PoC C, was fixed cleanly.)

4. **Hardened ready pipeline matters in /print.** PaginationPlugin needs explicit retry on rows-not-yet-measured (height=0) and a hard timeout. Without it, the readonly /print view never paginated. The retry + `data-layout-error` attribute makes failures observable.

## Decision

**✅ PASS — proceed to M2.**

All three PoCs are green on Chromium. The single-PM + widget-decoration architecture is validated. Plan A (widget decoration) holds; Plan B (atom node fallback) is NOT needed.

The architectural patches discovered during PoC (static @page injection, NodeView selector level, position-based layout measurement, ready-pipeline retry) are committed and will guide the production implementation in M3-M5.

M1 commits:
- `cdfd833` — PoC scaffold
- `5bce288` — NodeViews + CSS
- `3d0a328` — LayoutEngine + tests
- `45baaa3` — PaginationPlugin
- `7fa5d57` — PageChromeLayer
- `dfd84d8` — /print route + data-paginated flag
- `626e2a6` — Text extension fix
- `df9609c` — Plan A patch (static @page + hardened pipeline + selector fix)
- `76e6f19` — PoC B selection tests
- `3d531a1` — PoC C tests + LayoutEngine margin-aware fix
