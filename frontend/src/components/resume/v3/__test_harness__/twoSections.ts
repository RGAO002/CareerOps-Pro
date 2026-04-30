// Two-section fixture used by the /v3-test e2e harness only (T31).
// Section 1 = Experience (gS1) with one entry (gE1: title + meta + 2 bullets).
// Section 2 = Education  (gS2) with one entry (gE2: title + meta + 1 bullet).
import type { ResumeDocV3, GroupId, RowId } from '../schema/types';

export const twoSections: ResumeDocV3 = {
  schemaVersion: 3,
  rows: [
    { id: 'r-name' as RowId,    kind: 'header.name',    content: { text: 'Jane Doe' } },
    { id: 'r-contact' as RowId, kind: 'header.contact', content: { type: 'text', value: 'jane@example.com' } },

    // --- Section 1: Experience ---
    { id: 'r-exp-h' as RowId,    kind: 'section.heading', content: { text: 'Experience' }, semanticGroupId: 'gS1' as GroupId },
    { id: 'r-exp-title' as RowId, kind: 'entry.title',    content: { text: 'Software Engineer' }, semanticGroupId: 'gE1' as GroupId },
    { id: 'r-exp-meta' as RowId,  kind: 'entry.meta',     content: { text: '2020 - 2024' }, semanticGroupId: 'gE1' as GroupId },
    {
      id: 'r-exp-b1' as RowId, kind: 'bullet',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Built things' }] }] },
      semanticGroupId: 'gE1' as GroupId,
    },
    {
      id: 'r-exp-b2' as RowId, kind: 'bullet',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shipped them' }] }] },
      semanticGroupId: 'gE1' as GroupId,
    },

    // --- Section 2: Education ---
    { id: 'r-edu-h' as RowId,    kind: 'section.heading', content: { text: 'Education' }, semanticGroupId: 'gS2' as GroupId },
    { id: 'r-edu-title' as RowId, kind: 'entry.title',    content: { text: 'B.S. Computer Science' }, semanticGroupId: 'gE2' as GroupId },
    { id: 'r-edu-meta' as RowId,  kind: 'entry.meta',     content: { text: '2016 - 2020' }, semanticGroupId: 'gE2' as GroupId },
    {
      id: 'r-edu-b1' as RowId, kind: 'bullet',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dean’s list' }] }] },
      semanticGroupId: 'gE2' as GroupId,
    },
  ],
  groups: [
    { id: 'gS1' as GroupId, kind: 'section', role: 'experience' },
    { id: 'gS2' as GroupId, kind: 'section', role: 'education' },
    { id: 'gE1' as GroupId, kind: 'entry',   parentSectionGroupId: 'gS1' as GroupId },
    { id: 'gE2' as GroupId, kind: 'entry',   parentSectionGroupId: 'gS2' as GroupId },
  ],
};
