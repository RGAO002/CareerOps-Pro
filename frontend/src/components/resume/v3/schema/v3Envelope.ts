// frontend/src/components/resume/v3/schema/v3Envelope.ts
//
// Bridge between the API/disk v3 shape (snake_case, with id/title/metadata
// envelope) and the editor's body-only `ResumeDocV3` shape (camelCase).
//
// Used by the page boundary (`/resume/[id]/page.tsx`, `/print/page.tsx`) and
// EditorPageV3 / PrintCanvasClientV3.
//
// We also provide `v3ApiToV2Stub`: many in-editor consumers (useResumeStore,
// AI sidebar, atom renderers in print fallback) still expect a v2-shaped
// `ResumeDoc`. Until Phase 4 (AI rewire) deletes those consumers, we feed
// them a v2 derived from the v3 envelope via the existing v3ToV2 adapter.

import type { ResumeDoc as ResumeDocV2 } from '../../v2/types';
import type { GroupId, ResumeDocV3, ResumeRow, RowId, SemanticGroup } from './types';
import { v3ToV2 } from './v2Adapter';

export interface ResumeFileV3 {
  schema_version: 3;
  id: string;
  title: string;
  template_id: string;
  rows: ResumeRow[];
  groups: SemanticGroup[];
  metadata: {
    created_at: string;
    updated_at: string;
    target_company?: string | null;
    target_role?: string | null;
    parent_id?: string | null;
    [k: string]: unknown;
  };
}

/** True if the value looks like a v3 API envelope (vs legacy v2 shape). */
export function isV3ApiEnvelope(x: unknown): x is ResumeFileV3 {
  return !!x && typeof x === 'object' && (x as { schema_version?: unknown }).schema_version === 3;
}

/** Strip envelope, return the editor body (camelCase). */
export function v3FileToEditorBody(file: ResumeFileV3): ResumeDocV3 {
  return {
    schemaVersion: 3,
    rows: file.rows ?? [],
    groups: file.groups ?? [],
  };
}

/** Wrap an editor body back into an API envelope, preserving id/title/meta. */
export function editorBodyToV3File(body: ResumeDocV3, prev: ResumeFileV3): ResumeFileV3 {
  return {
    ...prev,
    schema_version: 3,
    rows: body.rows,
    groups: body.groups,
  };
}

/**
 * Build a minimal valid v2 envelope from a v3 API doc, for legacy consumers
 * (useResumeStore, AI sidebar, etc.) that still read v2 shape.
 *
 * Implementation: hand v3ToV2 a stub `previous` envelope so it merges
 * envelope-level fields (id, title, metadata) correctly.
 */
export function v3ApiToV2(file: ResumeFileV3): ResumeDocV2 {
  const stubPrev: ResumeDocV2 = {
    schema_version: 2,
    id: file.id,
    title: file.title,
    template_id: file.template_id,
    header: { id: 'header', name: '', contact_lines: [] },
    sections: [],
    metadata: {
      created_at: file.metadata?.created_at ?? new Date().toISOString(),
      updated_at: file.metadata?.updated_at ?? new Date().toISOString(),
      target_company: (file.metadata?.target_company as string | null | undefined) ?? null,
      target_role: (file.metadata?.target_role as string | null | undefined) ?? null,
      parent_id: (file.metadata?.parent_id as string | null | undefined) ?? null,
    },
  };
  const body: ResumeDocV3 = v3FileToEditorBody(file);
  return v3ToV2(body, stubPrev);
}

// Re-export for convenience.
export type { ResumeDocV3, ResumeRow, SemanticGroup, GroupId, RowId };
