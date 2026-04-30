// T34 — /print-v3 production route (side-by-side with v2 /resume/[id]/print).
//
// This is the productionized PDF export surface for v3. It mounts the
// PrintCanvasV3 component which:
//   - hydrates a ResumeDocV3 into a readonly TipTap editor with the full v3
//     schema + production PaginationPlugin (T32);
//   - injects a literal static @page rule (F2 from M1 PoC sign-off);
//   - drives the data-paginated pipeline that the PDF exporter waits on.
//
// For now this route mounts a default fixture document; in M7 the route can
// accept a query param / server-fetched document. Keeping this surface minimal
// matches the T34 brief.

import { PrintCanvasV3 } from '@/components/resume/v3/PrintCanvasV3';
import { twoSections } from '@/components/resume/v3/__test_harness__/twoSections';

export default function PrintV3Page() {
  return (
    <main style={{ minHeight: '100vh', padding: 0, margin: 0 }}>
      <PrintCanvasV3 doc={twoSections} />
    </main>
  );
}
