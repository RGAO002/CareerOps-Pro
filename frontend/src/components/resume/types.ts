// frontend/src/components/resume/types.ts

/**
 * Metadata about a resume — all fields other than its document content.
 * The full `ResumeDoc` is the TipTap JSON; the schema enforces shape at runtime.
 */
export interface ResumeMeta {
  /** Unique id. For Plan A we use the URL slug; later plans move to uuid. */
  id: string;
  /** User-facing name, editable. e.g. "Base resume" or "Stripe Backend variant". */
  title: string;
  /** Schema version for migrations. Start at 1. */
  schema_version: 1;
  /** ISO string for display; numeric epoch is used by Plan D snapshots. */
  updated_at: string;

  // Tailoring context (optional; null until a variant targets a job)
  target_company: string | null;
  target_company_domain: string | null;
  target_role: string | null;
}

/**
 * TipTap ProseMirror JSON doc — loosely typed because the exact shape
 * is enforced by the schema at runtime, not the type system. The shape is
 * compatible with the API client's `Resume["doc"]` (which uses `unknown[]`).
 */
export interface ResumeDoc {
  type: "doc";
  content: unknown[];
}
