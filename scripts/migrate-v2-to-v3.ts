/**
 * migrate-v2-to-v3.ts
 *
 * Self-contained Node CLI — v2→v3 conversion logic is INLINED here so this
 * script keeps working even after frontend/src/components/resume/v3/schema/v2Adapter.ts
 * is deleted. Do NOT import from the frontend tree.
 *
 * Usage:
 *   npx tsx scripts/migrate-v2-to-v3.ts <source-dir> <dest-dir>
 *
 * For each *.json in <source-dir> (excluding *.suggestions.json, *.backup.json,
 * *.v2-backup.json), the script:
 *   1. Verifies schema_version === 2
 *   2. Writes a .v2-backup.json sibling next to the source file
 *   3. Converts to v3 and writes the result to <dest-dir>/<filename>
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, basename } from 'node:path';

// ──────────────────────────────────────────────────────────────────────
// Minimal v3 types (inlined from frontend/src/components/resume/v3/schema/types.ts)
// ──────────────────────────────────────────────────────────────────────

type RowId = string & { readonly __brand: 'RowId' };
type GroupId = string & { readonly __brand: 'GroupId' };
type Align = 'left' | 'center' | 'right';

type PlainText = { text: string; align?: Align };
type RichText = { type: 'doc'; content: unknown[] };
type ContactItem =
  | { type: 'text'; value: string }
  | { type: 'link'; label: string; url: string };

type SectionRole =
  | 'experience' | 'education' | 'skills' | 'projects'
  | 'awards' | 'publications' | 'volunteer' | 'summary' | 'custom';

type ResumeRow =
  | { id: RowId; kind: 'header.name';     content: PlainText;   align?: Align }
  | { id: RowId; kind: 'header.contact';  content: ContactItem; align?: Align }
  | { id: RowId; kind: 'section.heading'; content: PlainText;   align?: Align; semanticGroupId: GroupId }
  | { id: RowId; kind: 'entry.title';     content: PlainText;   align?: Align; semanticGroupId: GroupId }
  | { id: RowId; kind: 'entry.meta';      content: PlainText;   align?: Align; semanticGroupId: GroupId }
  | { id: RowId; kind: 'plain';           content: RichText;    align?: Align; semanticGroupId?: GroupId }
  | { id: RowId; kind: 'bullet';          content: RichText;    align?: Align; semanticGroupId?: GroupId };

type SemanticGroup =
  | { id: GroupId; kind: 'section'; role: SectionRole; label?: string }
  | { id: GroupId; kind: 'entry';   parentSectionGroupId?: GroupId };

interface ResumeDocV3 {
  schemaVersion: 3;
  rows: ResumeRow[];
  groups: SemanticGroup[];
}

// ──────────────────────────────────────────────────────────────────────
// v2 types (inlined from frontend/src/components/resume/v2/types.ts)
// Using `any` for the input doc to keep this tooling-grade code simple.
// ──────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ResumeDocV2 = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SectionBlock = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EntryBlock = any;

type ProseMirrorBulletDoc = {
  type: 'doc';
  content: [{ type: 'paragraph'; content?: unknown[] | null }];
};

// ──────────────────────────────────────────────────────────────────────
// Inlined helpers (from frontend/src/components/resume/v3/schema/v2Adapter.ts)
// ──────────────────────────────────────────────────────────────────────

const asRowId = (id: string): RowId => id as RowId;
const asGroupId = (id: string): GroupId => id as GroupId;

function normalizeRole(role: string): SectionRole {
  return role as SectionRole;
}

function toPlainText(text: string): PlainText {
  return { text: text ?? '' };
}

function toRichText(doc: ProseMirrorBulletDoc | undefined): RichText {
  return doc ?? { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
}

function richTextToV2BulletDoc(doc: RichText): ProseMirrorBulletDoc {
  const paragraphs = (doc.content ?? []).filter((node): node is { type: 'paragraph'; content?: unknown[] | null } => {
    if (typeof node !== 'object' || node === null) return false;
    return (node as { type?: unknown }).type === 'paragraph';
  });
  const inline = paragraphs.flatMap((node) => node.content ?? []);
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: inline as ProseMirrorBulletDoc['content'][number]['content'],
      },
    ],
  };
}

function headerNameRowId(v2: ResumeDocV2): RowId {
  return asRowId(`header:${v2.header.id}:name`);
}

function headerContactRowId(v2: ResumeDocV2, index: number): RowId {
  return asRowId(`header:${v2.header.id}:contact:${index}`);
}

function sectionHeadingRowId(section: SectionBlock): RowId {
  return asRowId(`section:${section.id}:heading`);
}

function entryTitleRowId(entry: EntryBlock): RowId {
  return asRowId(`entry:${entry.id}:title`);
}

function entryMetaRowId(entry: EntryBlock): RowId {
  return asRowId(`entry:${entry.id}:meta`);
}

function rowIdInner(rowId: RowId, prefix: 'section' | 'entry', suffix: 'heading' | 'title' | 'meta'): string {
  const m = (rowId as string).match(new RegExp(`^${prefix}:(.+):${suffix}$`));
  return m ? m[1] : (rowId as string);
}

function v2AlignKey(kind: ResumeRow['kind'], rowId: RowId, contactIndex?: number): string | null {
  switch (kind) {
    case 'header.name':    return 'header.name';
    case 'header.contact': return contactIndex !== undefined ? `header.contact:${contactIndex}` : null;
    case 'section.heading': return `section.heading:${rowIdInner(rowId, 'section', 'heading')}`;
    case 'entry.title':    return `entry.title:${rowIdInner(rowId, 'entry', 'title')}`;
    case 'entry.meta':     return `entry.meta:${rowIdInner(rowId, 'entry', 'meta')}`;
    case 'plain':
    case 'bullet':         return `bullet.content:${rowId}`;
  }
}

function readAlign(v2: ResumeDocV2, key: string | null): Align | undefined {
  if (!key) return undefined;
  const v = v2.alignments?.[key];
  return (v === 'center' || v === 'right' || v === 'left') ? v : undefined;
}

function dedupeId(seen: Set<string>, raw: string): string {
  if (!seen.has(raw)) { seen.add(raw); return raw; }
  let i = 2;
  while (seen.has(`${raw}__${i}`)) i++;
  const next = `${raw}__${i}`;
  seen.add(next);
  return next;
}

function rolePolicy(role: string): { renderTitle: boolean; renderMeta: boolean } {
  switch (role) {
    case 'summary': return { renderTitle: false, renderMeta: false };
    case 'skills':  return { renderTitle: true,  renderMeta: false };
    default:        return { renderTitle: true,  renderMeta: true };
  }
}

// ──────────────────────────────────────────────────────────────────────
// Inlined v2ToV3 (from frontend/src/components/resume/v3/schema/v2Adapter.ts)
// ──────────────────────────────────────────────────────────────────────

function v2ToV3(v2: ResumeDocV2): ResumeDocV3 {
  const rows: ResumeRow[] = [];
  const groups: SemanticGroup[] = [];
  const seenIds = new Set<string>();

  const headerNameId = headerNameRowId(v2);
  rows.push({
    id: headerNameId,
    kind: 'header.name',
    content: toPlainText(v2.header.name),
    ...(readAlign(v2, v2AlignKey('header.name', headerNameId)) ? { align: readAlign(v2, v2AlignKey('header.name', headerNameId))! } : {}),
  });

  v2.header.contact_lines.forEach((contact: ContactItem, index: number) => {
    const contactId = headerContactRowId(v2, index);
    const align = readAlign(v2, v2AlignKey('header.contact', contactId, index));
    rows.push({
      id: contactId,
      kind: 'header.contact',
      content: contact as ContactItem,
      ...(align ? { align } : {}),
    });
  });

  for (const section of v2.sections) {
    const sectionGroupId = asGroupId(dedupeId(seenIds, section.id));
    const role = normalizeRole(section.role);
    const policy = rolePolicy(role);
    groups.push({
      id: sectionGroupId,
      kind: 'section',
      role,
      label: section.heading,
    });
    const sectionHeadingId = sectionHeadingRowId(section);
    const sectionAlign = readAlign(v2, v2AlignKey('section.heading', sectionHeadingId));
    rows.push({
      id: sectionHeadingId,
      kind: 'section.heading',
      semanticGroupId: sectionGroupId,
      content: toPlainText(section.heading),
      ...(sectionAlign ? { align: sectionAlign } : {}),
    });

    for (const entry of section.entries) {
      const entryGroupId = asGroupId(dedupeId(seenIds, entry.id));
      const isIndependentPlainSynthetic =
        !entry.title &&
        !entry.meta &&
        entry.bullets.length === 1 &&
        entry.bullets[0].kind === 'plain' &&
        asRowId(entry.bullets[0].id) === asRowId(entry.id);
      if (isIndependentPlainSynthetic) {
        const bullet = entry.bullets[0];
        const bulletId = asRowId(bullet.id);
        const bulletAlign = readAlign(v2, v2AlignKey('bullet', bulletId));
        rows.push({
          id: bulletId,
          kind: 'plain',
          // gid intentionally OMITTED — null/absent marks this as independent.
          content: toRichText(bullet.content),
          ...(bulletAlign ? { align: bulletAlign } : {}),
        });
        continue;
      }

      groups.push({
        id: entryGroupId,
        kind: 'entry',
        parentSectionGroupId: sectionGroupId,
      });
      const titleId = entryTitleRowId(entry);
      const metaId = entryMetaRowId(entry);
      const titleAlign = readAlign(v2, v2AlignKey('entry.title', titleId));
      const metaAlign = readAlign(v2, v2AlignKey('entry.meta', metaId));
      if (policy.renderTitle) {
        rows.push({
          id: titleId,
          kind: 'entry.title',
          semanticGroupId: entryGroupId,
          content: toPlainText(entry.title),
          ...(titleAlign ? { align: titleAlign } : {}),
        });
      }
      if (policy.renderMeta) {
        rows.push({
          id: metaId,
          kind: 'entry.meta',
          semanticGroupId: entryGroupId,
          content: toPlainText(entry.meta),
          ...(metaAlign ? { align: metaAlign } : {}),
        });
      }
      for (const bullet of entry.bullets) {
        const bulletId = asRowId(bullet.id);
        const bulletAlign = readAlign(v2, v2AlignKey('bullet', bulletId));
        rows.push({
          id: bulletId,
          kind: bullet.kind === 'plain' ? 'plain' : 'bullet',
          semanticGroupId: entryGroupId,
          content: toRichText(bullet.content),
          ...(bulletAlign ? { align: bulletAlign } : {}),
        });
      }
    }
  }

  return { schemaVersion: 3, rows, groups };
}

// ──────────────────────────────────────────────────────────────────────
// Migration entry point
// ──────────────────────────────────────────────────────────────────────

function isResumeJson(name: string): boolean {
  if (!name.endsWith('.json')) return false;
  if (name.endsWith('.suggestions.json')) return false;
  if (name.endsWith('.backup.json')) return false;
  if (name.endsWith('.v2-backup.json')) return false;
  return true;
}

function migrate(source: string, dest: string): { ok: number; failed: string[] } {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  const files = readdirSync(source).filter(isResumeJson);
  const failed: string[] = [];
  let ok = 0;
  for (const file of files) {
    const path = join(source, file);
    try {
      const raw = JSON.parse(readFileSync(path, 'utf-8'));
      if (raw.schema_version !== 2) {
        console.error(`SKIP ${file}: schema_version=${raw.schema_version}, expected 2`);
        failed.push(file);
        continue;
      }
      // Backup original next to source.
      const backupPath = join(source, basename(file, '.json') + '.v2-backup.json');
      copyFileSync(path, backupPath);

      // Convert.
      const v3 = v2ToV3(raw);

      // Strip stored gid from plain rows (lazy gid rule per spec § 2.2).
      v3.rows = v3.rows.map((row: any) => {
        if (row.kind !== 'plain') return row;
        const { semanticGroupId, ...rest } = row;
        return rest;
      });

      // Wrap with v3 doc envelope.
      const v3Doc = {
        schema_version: 3,
        id: raw.id,
        title: raw.title,
        template_id: raw.template_id ?? 'minimal-single-column',
        rows: v3.rows,
        groups: v3.groups,
        metadata: raw.metadata ?? { created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        ...(raw.alignments ? { alignments: raw.alignments } : {}),
      };

      writeFileSync(join(dest, file), JSON.stringify(v3Doc, null, 2), 'utf-8');
      console.log(`OK   ${file}`);
      ok++;
    } catch (e) {
      console.error(`FAIL ${file}:`, (e as Error).message);
      failed.push(file);
    }
  }
  return { ok, failed };
}

const [, , source, dest] = process.argv;
if (!source || !dest) {
  console.error('Usage: tsx scripts/migrate-v2-to-v3.ts <source-dir> <dest-dir>');
  process.exit(2);
}
const { ok, failed } = migrate(source, dest);
console.log(`\nMigrated ${ok} file(s). Failed: ${failed.length}`);
if (failed.length > 0) {
  console.error('Failures:', failed);
  process.exit(1);
}
