import type {
  BulletBlock,
  ContactItem as V2ContactItem,
  EntryBlock,
  ProseMirrorBulletDoc,
  ResumeDoc as ResumeDocV2,
  SectionBlock,
  SectionRole as V2SectionRole,
} from '../../v2/types';
import type {
  Align,
  ContactItem,
  GroupId,
  ResumeDocV3,
  ResumeRow,
  RichText,
  RowId,
  SectionRole,
  SemanticGroup,
} from './types';

const asRowId = (id: string): RowId => id as RowId;
const asGroupId = (id: string): GroupId => id as GroupId;

function normalizeRole(role: V2SectionRole): SectionRole {
  return role as SectionRole;
}

function toPlainText(text: string) {
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

// v2 alignments[fieldKey] keys, mirrored from useResumeStore.fieldKeyToStr.
function v2AlignKey(kind: ResumeRow['kind'], rowId: RowId, contactIndex?: number): string | null {
  switch (kind) {
    case 'header.name': return 'header.name';
    case 'header.contact': return contactIndex !== undefined ? `header.contact:${contactIndex}` : null;
    case 'section.heading': return `section.heading:${rowIdInner(rowId, 'section', 'heading')}`;
    case 'entry.title': return `entry.title:${rowIdInner(rowId, 'entry', 'title')}`;
    case 'entry.meta': return `entry.meta:${rowIdInner(rowId, 'entry', 'meta')}`;
    case 'plain':
    case 'bullet': return `bullet.content:${rowId}`;
  }
}
function rowIdInner(rowId: RowId, prefix: 'section' | 'entry', suffix: 'heading' | 'title' | 'meta'): string {
  // RowId format from v2ToV3:
  //   section:<sectionId>:heading
  //   entry:<entryId>:title
  //   entry:<entryId>:meta
  // Extract <id> between prefix and suffix.
  const m = (rowId as string).match(new RegExp(`^${prefix}:(.+):${suffix}$`));
  return m ? m[1] : (rowId as string);
}
function readAlign(v2: ResumeDocV2, key: string | null): Align | undefined {
  if (!key) return undefined;
  const v = v2.alignments?.[key];
  return (v === 'center' || v === 'right' || v === 'left') ? v : undefined;
}

// Generate a fresh suffix for an entry/section id whose id already collided.
// Keeps the prefix human-readable in dev tools while guaranteeing uniqueness.
function dedupeId(seen: Set<string>, raw: string): string {
  if (!seen.has(raw)) { seen.add(raw); return raw; }
  let i = 2;
  while (seen.has(`${raw}__${i}`)) i++;
  const next = `${raw}__${i}`;
  seen.add(next);
  return next;
}

// Mirrors v2's placeholdersFor() in EntryAtomRenderer.tsx — sections where
// title or meta is null don't render that field at all (e.g. Summary has
// neither, Skills has no meta). v2ToV3 honors the same rule by skipping
// row creation, so empty placeholder rows don't appear in the v3 editor.
function rolePolicy(role: string): { renderTitle: boolean; renderMeta: boolean } {
  switch (role) {
    case 'summary': return { renderTitle: false, renderMeta: false };
    case 'skills':  return { renderTitle: true,  renderMeta: false };
    default:        return { renderTitle: true,  renderMeta: true };
  }
}

export function v2ToV3(v2: ResumeDocV2): ResumeDocV3 {
  const rows: ResumeRow[] = [];
  const groups: SemanticGroup[] = [];
  // Defensive: parsers / merges occasionally produce v2 docs with duplicate
  // entry / section ids. v3's GroupsPlugin uses a Map keyed by id, so dupes
  // would collapse and the second-onward entries' rows get reassigned to the
  // first entry's parent — losing whole sections on save. Track ids here and
  // remap on collision so each v3 group/row has a stable unique id.
  const seenIds = new Set<string>();

  const headerNameId = headerNameRowId(v2);
  rows.push({
    id: headerNameId,
    kind: 'header.name',
    content: toPlainText(v2.header.name),
    ...(readAlign(v2, v2AlignKey('header.name', headerNameId)) ? { align: readAlign(v2, v2AlignKey('header.name', headerNameId))! } : {}),
  });

  v2.header.contact_lines.forEach((contact, index) => {
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
      // Round-trip collapse for INDEPENDENT PLAIN rows: v3ToV2 emits a
      // single null-gid plain row as a synthetic entry with empty
      // title/meta and one plain bullet (entry.id === bullet.id === the
      // original v3 row id). Detect that exact shape on read and emit it
      // back as a single section-level plain row with gid=null instead of
      // a 3-row "empty entry". Without this collapse, every save+reload
      // would multiply each independent plain row into title+meta+bullet.
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
        continue; // skip normal entry emission for this synthetic
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
      // v2 parity: skip rows whose role doesn't render that field
      // (Summary: no title/meta; Skills: no meta). Empty title/meta in
      // the v2 data round-trips fine via v3ToV2 fallbacks.
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

function textContactToV2(contact: ContactItem): V2ContactItem {
  return contact.type === 'link'
    ? { type: 'link', label: contact.label, url: contact.url }
    : { type: 'text', value: contact.value };
}

function textOf(row: ResumeRow | undefined): string {
  if (!row || !('content' in row)) return '';
  const content = row.content;
  if ('text' in content) return content.text;
  if ('value' in content) return content.value;
  if ('label' in content) return content.label;
  return '';
}

export function v3ToV2(v3: ResumeDocV3, previous: ResumeDocV2): ResumeDocV2 {
  const groupsById = new Map(v3.groups.map((group) => [group.id, group]));
  const headerContacts: V2ContactItem[] = [];
  const rowOrder: string[] = [];

  // Build the v2 alignments map from v3 row.align fields. Start from previous
  // so we preserve any keys belonging to rows not present in v3 (defensive).
  const alignments: Record<string, Align> = { ...(previous.alignments ?? {}) };
  let contactCounter = 0;
  for (const row of v3.rows) {
    if (row.kind === 'header.name') {
      rowOrder.push('name');
      const k = v2AlignKey('header.name', row.id);
      if (k) {
        if (row.align) alignments[k] = row.align; else delete alignments[k];
      }
    } else if (row.kind === 'header.contact') {
      const index = headerContacts.length;
      headerContacts.push(textContactToV2(row.content));
      rowOrder.push(`contact:${index}`);
      const k = v2AlignKey('header.contact', row.id, contactCounter);
      contactCounter++;
      if (k) {
        if (row.align) alignments[k] = row.align; else delete alignments[k];
      }
    } else {
      const k = v2AlignKey(row.kind, row.id);
      if (k) {
        if (row.align) alignments[k] = row.align; else delete alignments[k];
      }
    }
  }

  const sectionRows: Extract<ResumeRow, { kind: 'section.heading' }>[] = [];
  const seenSectionAnchors = new Map<string, number>();
  for (const row of v3.rows) {
    if (row.kind !== 'section.heading') continue;
    const anchor = row.semanticGroupId || row.id;
    const existingIndex = seenSectionAnchors.get(anchor);
    if (existingIndex !== undefined) {
      const existing = sectionRows[existingIndex];
      if (!existing.content.text.trim() && row.content.text.trim()) {
        sectionRows[existingIndex] = row;
      }
      continue;
    }
    seenSectionAnchors.set(anchor, sectionRows.length);
    sectionRows.push(row);
  }
  // Save-time dedupe: even though v2ToV3 dedupes on LOAD, defensive belt-and-
  // braces on SAVE prevents corrupt v3 in-memory state (e.g. groups Map after
  // a buggy mutation) from writing duplicate-id entries / sections back to
  // the JSON. We keep first-seen ids verbatim and rename collisions with
  // __2 / __3 suffixes — same shape dedupeId() uses for v2ToV3.
  const seenSaveIds = new Set<string>();
  const dedupeOnSave = (raw: string): string => {
    if (!seenSaveIds.has(raw)) { seenSaveIds.add(raw); return raw; }
    let i = 2;
    while (seenSaveIds.has(`${raw}__${i}`)) i++;
    const next = `${raw}__${i}`;
    seenSaveIds.add(next);
    return next;
  };
  const sections: SectionBlock[] = sectionRows.map((row) => {
    const sectionGroup = groupsById.get(row.semanticGroupId);
    const entries = collectEntriesForSection(v3, row.semanticGroupId).map((e) => ({
      ...e,
      id: dedupeOnSave(e.id),
    }));
    return {
      id: dedupeOnSave(row.semanticGroupId),
      role: sectionGroup?.kind === 'section' ? (sectionGroup.role as V2SectionRole) : 'custom',
      heading: row.content.text,
      entries,
    };
  });

  const firstHeaderName = v3.rows.find((row) => row.kind === 'header.name');
  return {
    ...previous,
    schema_version: 2,
    header: {
      ...previous.header,
      name: textOf(firstHeaderName),
      contact_lines: headerContacts,
      row_order: rowOrder.length > 0 ? rowOrder : undefined,
    },
    sections,
    alignments: Object.keys(alignments).length > 0 ? alignments : undefined,
    metadata: {
      ...previous.metadata,
      updated_at: new Date().toISOString(),
    },
  };
}

function collectEntriesForSection(v3: ResumeDocV3, sectionGroupId: GroupId): EntryBlock[] {
  const groupsById = new Map(v3.groups.map((group) => [group.id, group]));
  const entryGroupIds = v3.groups
    .filter((group) => group.kind === 'entry' && group.parentSectionGroupId === sectionGroupId)
    .map((group) => group.id);

  // Index of every row in v3.rows for fast doc-order lookup. Used below to
  // tag each emitted entry with `_idx` (lowest member-row index) so we can
  // sort registered entries + orphan entries together by doc position.
  // Without this, the two-pass build (registered first, orphans appended)
  // would always place orphans AFTER all registered entries even when the
  // orphan rows physically sit between them in the doc — producing the
  // "orphan row jumps to the bottom" bug observed in the PDF export.
  const rowIndex = new Map<string, number>();
  v3.rows.forEach((row, idx) => rowIndex.set(row.id, idx));

  const entries: Array<EntryBlock & { _idx: number }> = [];
  for (const entryGroupId of entryGroupIds) {
    const memberRows = v3.rows.filter((row) => 'semanticGroupId' in row && row.semanticGroupId === entryGroupId);
    if (memberRows.length === 0) continue;

    const titleRow = memberRows.find((row) => row.kind === 'entry.title');
    const metaRow = memberRows.find((row) => row.kind === 'entry.meta');
    const bullets: BulletBlock[] = memberRows
      .filter((row) => row.kind === 'bullet' || row.kind === 'plain')
      .map((row) => ({
        id: row.id,
        kind: row.kind === 'plain' ? 'plain' : 'bullet',
        content: richTextToV2BulletDoc(row.content),
      }));

    // First member row's doc index — defines this entry's position relative
    // to orphans / other entries. memberRows preserves v3.rows order so [0]
    // is already the doc-order-first row of the group.
    const firstIdx = rowIndex.get(memberRows[0].id) ?? Number.MAX_SAFE_INTEGER;
    entries.push({
      id: entryGroupId,
      title: textOf(titleRow),
      meta: textOf(metaRow),
      bullets,
      _idx: firstIdx,
    });
  }

  // Section-level / orphan row fallback. Two distinct cases collapse here:
  //
  //   (a) ORPHAN: bullet/plain whose `semanticGroupId` points at a missing
  //       entry group (parser bug, broken edit). Each gets its own synthetic
  //       entry in v2 keyed by the dangling gid (preserves identity across
  //       reloads).
  //
  //   (b) INDEPENDENT PLAIN: plain row with `semanticGroupId === null`. By
  //       design (Enter creates plain rows with null gid — see enter.ts
  //       `gidForNewRow`), these are section-level paragraphs that don't
  //       belong to any entry. We synthesize a per-row entry keyed by the
  //       row's id; v2ToV3 detects the "empty title + empty meta + 1 plain
  //       bullet" pattern and collapses it back to a single independent
  //       plain row on reload, so the round-trip is stable.
  //
  // Critical: do NOT add to every section's entries (the original loop did,
  // which is why a single stray summary bullet duplicated to all 5 sections
  // and grew by one each round-trip). Walk the doc once to find each row's
  // enclosing section gid, then only emit for the matching section.
  let cursor: GroupId | null = null;
  for (let i = 0; i < v3.rows.length; i++) {
    const row = v3.rows[i];
    if (row.kind === 'section.heading') {
      cursor = (row.semanticGroupId ?? null) as GroupId | null;
      continue;
    }
    if (cursor !== sectionGroupId) continue;
    if (row.kind !== 'bullet' && row.kind !== 'plain') continue;
    const rowGid = ('semanticGroupId' in row) ? row.semanticGroupId : null;
    // Skip rows that already belong to a known entry — those are emitted by
    // the registered-entry loop above.
    if (rowGid && groupsById.has(rowGid)) continue;
    // Synthesize entry id: dangling gid for case (a), row.id for case (b).
    // Stable across round-trips so editor identity / undo don't reset.
    const synthEntryId = rowGid ?? row.id;
    entries.push({
      id: synthEntryId,
      title: '',
      meta: '',
      bullets: [{
        id: row.id,
        kind: row.kind === 'plain' ? 'plain' : 'bullet',
        content: richTextToV2BulletDoc(row.content),
      }],
      _idx: i,
    });
  }

  // Sort by doc-order so orphans interleave correctly with registered
  // entries (fixes "orphan row jumps to bottom of section" PDF bug).
  entries.sort((a, b) => a._idx - b._idx);
  return entries.map(({ _idx, ...entry }) => entry);
}
