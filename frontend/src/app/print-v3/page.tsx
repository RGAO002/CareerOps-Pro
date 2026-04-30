// T34 — /print-v3 production route (side-by-side with v2 /resume/[id]/print).
// T35 — adds ?fixture=<name> support backed by a small named registry. This
// keeps the URL clean (vs base64 doc payloads) and lets PDF e2e specs and
// manual QA share inputs with the same source of truth.
//
// This is the productionized PDF export surface for v3. It mounts the
// PrintCanvasV3 component which:
//   - hydrates a ResumeDocV3 into a readonly TipTap editor with the full v3
//     schema + production PaginationPlugin (T32);
//   - injects a literal static @page rule (F2 from M1 PoC sign-off);
//   - drives the data-paginated pipeline that the PDF exporter waits on.
//
// In M7 the route can accept a server-fetched document; today it picks from a
// fixed registry keyed by a query param.

import { PrintCanvasV3 } from '@/components/resume/v3/PrintCanvasV3';
import { resolveFixture } from './fixtures';

interface PrintV3PageProps {
  // Next.js App Router passes searchParams as a Promise in newer versions,
  // and as a plain object in older ones. Accept the union and resolve.
  searchParams?: Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>>;
}

export default async function PrintV3Page({ searchParams }: PrintV3PageProps) {
  const params = (await Promise.resolve(searchParams)) ?? {};
  const raw = params.fixture;
  const fixtureName = Array.isArray(raw) ? raw[0] : raw;
  const doc = resolveFixture(fixtureName);
  return (
    <main style={{ minHeight: '100vh', padding: 0, margin: 0 }}>
      <PrintCanvasV3 doc={doc} />
    </main>
  );
}
