// frontend/src/components/resume/v2/types.ts

// ─────────── ID types ───────────
export type ResumeId = string;
export type BlockId = string;            // UUID v4
export type EditorId = string;           // per-TipTap-instance UUID
export type TransactionId = number;      // monotonic
export type ISO8601 = string;

// ─────────── Domain schema ───────────
export type SectionRole =
  | 'summary'
  | 'skills'
  | 'experience'
  | 'projects'
  | 'education'
  | 'awards'
  | 'publications'
  | 'custom';

export type ContactItem =
  | { type: 'text'; value: string }
  | { type: 'link'; label: string; url: string };

export type HeaderBlock = {
  id: BlockId;
  name: string;
  contact_lines: ContactItem[];
};

export type EntryBlock = {
  id: BlockId;
  title: string;
  meta: string;
  bullets: BulletBlock[];
};

export type BulletBlock = {
  id: BlockId;
  content: ProseMirrorBulletDoc;
  tags?: string[];
  evidence_refs?: string[];
};

export type SectionBlock = {
  id: BlockId;
  role: SectionRole;
  heading: string;
  entries: EntryBlock[];
};

export type ResumeMetadata = {
  created_at: ISO8601;
  updated_at: ISO8601;
  target_company: string | null;
  target_role: string | null;
  parent_id: string | null;
};

export type ResumeDoc = {
  schema_version: 2;
  id: ResumeId;
  title: string;
  template_id: string;
  header: HeaderBlock;
  sections: SectionBlock[];
  metadata: ResumeMetadata;
  /**
   * Per-field text alignment for single-line fields (name, contact line,
   * section heading, entry title, entry meta). Keys are serialized
   * EditableField identifiers (e.g. "header.name", "section.heading:{id}").
   * Bullet alignment lives inside each bullet's ProseMirrorBulletDoc and is
   * NOT mirrored here.
   */
  alignments?: Record<string, 'left' | 'center' | 'right'>;
};

// ─────────── ProseMirror shapes ───────────
export type ProseMirrorInline = {
  type: 'text';
  text: string;
  marks?: Array<
    | { type: 'bold' }
    | { type: 'italic' }
    | { type: 'link'; attrs: { href: string } }
  >;
};

export type ProseMirrorParagraph = {
  type: 'paragraph';
  attrs?: { textAlign?: 'left' | 'center' | 'right' };
  content?: ProseMirrorInline[];
};

export type ProseMirrorBulletDoc = {
  type: 'doc';
  content: [ProseMirrorParagraph];   // exactly 1
};

export type SingleLineDoc = {
  type: 'doc';
  content: [ProseMirrorParagraph];   // exactly 1 paragraph wrapping the inline content
};

// ─────────── LayoutAtom (pagination unit) ───────────
export type AtomId = BlockId;            // same as the source block ID

export type LayoutAtom =
  | { kind: 'header';          id: AtomId; sourceBlockId: BlockId; keepWithNext: false }
  | { kind: 'section-heading'; id: AtomId; sourceBlockId: BlockId; keepWithNext: true }
  | { kind: 'entry';           id: AtomId; sourceBlockId: BlockId; keepWithNext: false };

export type AtomLayout = {
  pageIndex: number;
  xWithinPage: number;
  yWithinPage: number;
  width: number;
  height: number;
};

// ─────────── SelectableBlock (interaction unit) ───────────
export type SelectableBlock =
  | { kind: 'section'; id: BlockId }
  | { kind: 'entry';   id: BlockId; sectionId: BlockId }
  | { kind: 'bullet';  id: BlockId; entryId: BlockId };

// ─────────── EditableField (TipTap instance unit) ───────────
export type EditableField =
  | { kind: 'header.name' }
  | { kind: 'header.contact'; index: number }
  | { kind: 'section.heading'; id: BlockId }
  | { kind: 'entry.title';    id: BlockId }
  | { kind: 'entry.meta';     id: BlockId }
  | { kind: 'bullet.content'; id: BlockId };

// ─────────── Modes ───────────
export type CanvasMode = 'edit' | 'export' | 'measure';

// ─────────── Origin tracking ───────────
export type UpdateOriginType =
  | 'tiptap'
  | 'ai-rewrite'
  | 'undo'
  | 'redo'
  | 'drag-reorder'
  | 'paste'
  | 'load'
  | 'remote';

export type UpdateOrigin = {
  type: UpdateOriginType;
  editorId?: EditorId;
  transactionId: TransactionId;
};
