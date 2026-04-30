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

export function v2ToV3(v2: ResumeDocV2): ResumeDocV3 {
  const rows: ResumeRow[] = [];
  const groups: SemanticGroup[] = [];

  rows.push({
    id: headerNameRowId(v2),
    kind: 'header.name',
    content: toPlainText(v2.header.name),
  });

  v2.header.contact_lines.forEach((contact, index) => {
    rows.push({
      id: headerContactRowId(v2, index),
      kind: 'header.contact',
      content: contact as ContactItem,
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
    rows.push({
      id: sectionHeadingRowId(section),
      kind: 'section.heading',
      semanticGroupId: sectionGroupId,
      content: toPlainText(section.heading),
    });

    for (const entry of section.entries) {
      const entryGroupId = asGroupId(entry.id);
      groups.push({
        id: entryGroupId,
        kind: 'entry',
        parentSectionGroupId: sectionGroupId,
      });
      rows.push({
        id: entryTitleRowId(entry),
        kind: 'entry.title',
        semanticGroupId: entryGroupId,
        content: toPlainText(entry.title),
      });
      rows.push({
        id: entryMetaRowId(entry),
        kind: 'entry.meta',
        semanticGroupId: entryGroupId,
        content: toPlainText(entry.meta),
      });
      for (const bullet of entry.bullets) {
        rows.push({
          id: asRowId(bullet.id),
          kind: bullet.kind === 'plain' ? 'plain' : 'bullet',
          semanticGroupId: entryGroupId,
          content: toRichText(bullet.content),
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

  for (const row of v3.rows) {
    if (row.kind === 'header.name') {
      rowOrder.push('name');
    } else if (row.kind === 'header.contact') {
      const index = headerContacts.length;
      headerContacts.push(textContactToV2(row.content));
      rowOrder.push(`contact:${index}`);
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
