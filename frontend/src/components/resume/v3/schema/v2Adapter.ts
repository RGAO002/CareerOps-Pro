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

export function v2ToV3(v2: ResumeDocV2): ResumeDocV3 {
  const rows: ResumeRow[] = [];
  const groups: SemanticGroup[] = [];

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
    const sectionGroupId = asGroupId(section.id);
    groups.push({
      id: sectionGroupId,
      kind: 'section',
      role: normalizeRole(section.role),
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
      const entryGroupId = asGroupId(entry.id);
      groups.push({
        id: entryGroupId,
        kind: 'entry',
        parentSectionGroupId: sectionGroupId,
      });
      const titleId = entryTitleRowId(entry);
      const metaId = entryMetaRowId(entry);
      const titleAlign = readAlign(v2, v2AlignKey('entry.title', titleId));
      const metaAlign = readAlign(v2, v2AlignKey('entry.meta', metaId));
      rows.push({
        id: titleId,
        kind: 'entry.title',
        semanticGroupId: entryGroupId,
        content: toPlainText(entry.title),
        ...(titleAlign ? { align: titleAlign } : {}),
      });
      rows.push({
        id: metaId,
        kind: 'entry.meta',
        semanticGroupId: entryGroupId,
        content: toPlainText(entry.meta),
        ...(metaAlign ? { align: metaAlign } : {}),
      });
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

  const sectionRows = v3.rows.filter((row) => row.kind === 'section.heading');
  const sections: SectionBlock[] = sectionRows.map((row) => {
    const sectionGroup = groupsById.get(row.semanticGroupId);
    const entries = collectEntriesForSection(v3, row.semanticGroupId);
    return {
      id: row.semanticGroupId,
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

  const entries: EntryBlock[] = [];
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

    entries.push({
      id: entryGroupId,
      title: textOf(titleRow),
      meta: textOf(metaRow),
      bullets,
    });
  }

  // Fallback for malformed docs: if rows reference an entry group that is
  // missing from groups, keep the content rather than dropping user text.
  for (const row of v3.rows) {
    if (!('semanticGroupId' in row) || !row.semanticGroupId) continue;
    if (groupsById.has(row.semanticGroupId)) continue;
    if (row.kind !== 'bullet' && row.kind !== 'plain') continue;
    entries.push({
      id: row.semanticGroupId,
      title: '',
      meta: '',
      bullets: [{
        id: row.id,
        kind: row.kind === 'plain' ? 'plain' : 'bullet',
        content: richTextToV2BulletDoc(row.content),
      }],
    });
  }

  return entries;
}
