import type { ResumeDocV3, GroupId, RowId } from '../../../schema/types';

// 1-page fixture: 1 header.name, 1 header.contact, 1 section.heading (Experience),
// 1 entry.title, 1 entry.meta, 2 bullets. Total = 7 rows.
export const onePage: ResumeDocV3 = {
  schemaVersion: 3,
  rows: [
    { id: 'r-name' as RowId, kind: 'header.name', content: { text: 'Jane Doe' } },
    {
      id: 'r-contact' as RowId,
      kind: 'header.contact',
      content: { type: 'text', value: 'jane@example.com' },
    },
    {
      id: 'r-heading' as RowId,
      kind: 'section.heading',
      content: { text: 'Experience' },
      semanticGroupId: 'gS1' as GroupId,
    },
    {
      id: 'r-title' as RowId,
      kind: 'entry.title',
      content: { text: 'Software Engineer' },
      semanticGroupId: 'gE1' as GroupId,
    },
    {
      id: 'r-meta' as RowId,
      kind: 'entry.meta',
      content: { text: '2020 - 2024' },
      semanticGroupId: 'gE1' as GroupId,
    },
    {
      id: 'r-bullet-1' as RowId,
      kind: 'bullet',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Built things' }] }] },
      semanticGroupId: 'gE1' as GroupId,
    },
    {
      id: 'r-bullet-2' as RowId,
      kind: 'bullet',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shipped them' }] }] },
      semanticGroupId: 'gE1' as GroupId,
    },
  ],
  groups: [
    { id: 'gS1' as GroupId, kind: 'section', role: 'experience' },
    { id: 'gE1' as GroupId, kind: 'entry', parentSectionGroupId: 'gS1' as GroupId },
  ],
};

// onePageOrphan — same doc as onePage, but the section group gS1 is left out
// of the groups array, leaving the entry group's parentSectionGroupId pointing
// at a non-existent section. Production code (F4) must tolerate this.
export const onePageOrphan: ResumeDocV3 = {
  schemaVersion: 3,
  rows: onePage.rows,
  groups: [
    // section group gS1 deliberately omitted — entry group references non-existent parent.
    { id: 'gE1' as GroupId, kind: 'entry', parentSectionGroupId: 'gS1' as GroupId },
  ],
};
