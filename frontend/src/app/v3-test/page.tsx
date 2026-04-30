// Test-only harness route for v3 e2e tests.
//
// Purpose
// -------
// Provides a deterministic /v3-test page that mounts a real v3 editor with a
// 2-section fixture so Playwright e2e tests (T31 — drag-cross-section) can
// drive PointerEvents in a real browser. NOT a production route. M5/M7 will
// ship the real v3 editor mounting story; this exists solely to give Playwright
// something to load until then.
//
// Scope
// -----
// - Mount the full v3 row schema + GroupsPlugin + history.
// - Wire row-handle pointerdown to DragController.onPointerDown so a real
//   pointer-driven drag works end to end.
// - Expose `window.__v3TestHarness` with helpers used by the test (read doc /
//   read groups state) so the spec doesn't need to walk DOM internals to
//   assert on group membership.

import { V3TestHarness } from '@/components/resume/v3/__test_harness__/V3TestHarness';

export const dynamic = 'force-dynamic';

export default function V3TestPage() {
  return (
    <main style={{ minHeight: '100vh', padding: '24px' }}>
      <V3TestHarness />
    </main>
  );
}
