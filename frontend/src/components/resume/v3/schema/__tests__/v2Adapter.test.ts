import { describe, expect, it } from 'vitest';
import type { ResumeDoc as ResumeDocV2 } from '../../../v2/types';
import { v2ToV3, v3ToV2 } from '../v2Adapter';

const sampleV2: ResumeDocV2 = {
  schema_version: 2,
  id: 'resume-1',
  title: 'Test Resume',
  template_id: 'minimal-single-column',
  header: {
    id: 'header-1',
    name: 'Ada Lovelace',
    contact_lines: [
      { type: 'text', value: 'New York, NY' },
      { type: 'link', label: 'ada.dev', url: 'https://ada.dev' },
    ],
  },
  sections: [
    {
      id: 'section-exp',
      role: 'experience',
      heading: 'Experience',
      entries: [
        {
          id: 'entry-apple',
          title: 'Apple',
          meta: 'Engineer · 2024',
          bullets: [
            {
              id: 'bullet-1',
              kind: 'bullet',
              content: {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Built systems.' }] }],
              },
            },
            {
              id: 'bullet-2',
              kind: 'plain',
              content: {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Continuation.' }] }],
              },
            },
          ],
        },
      ],
    },
  ],
  metadata: {
    created_at: '2026-04-29T00:00:00.000Z',
    updated_at: '2026-04-29T00:00:00.000Z',
    target_company: 'Apple',
    target_role: 'Engineer',
    parent_id: null,
  },
};

describe('v2Adapter', () => {
  it('projects v2 resume sections and entries into v3 rows + semantic groups', () => {
    const v3 = v2ToV3(sampleV2);

    expect(v3.schemaVersion).toBe(3);
    expect(v3.groups).toContainEqual({
      id: 'section-exp',
      kind: 'section',
      role: 'experience',
      label: 'Experience',
    });
    expect(v3.groups).toContainEqual({
      id: 'entry-apple',
      kind: 'entry',
      parentSectionGroupId: 'section-exp',
    });
    expect(v3.rows.map((row) => row.kind)).toEqual([
      'header.name',
      'header.contact',
      'header.contact',
      'section.heading',
      'entry.title',
      'entry.meta',
      'bullet',
      'plain',
    ]);
  });

  it('serializes v3 edits back into the current v2 API shape', () => {
    const v3 = v2ToV3(sampleV2);
    v3.rows = v3.rows.map((row) =>
      row.kind === 'entry.title'
        ? { ...row, content: { text: 'Apple Platform Engineering' } }
        : row,
    );

    const v2 = v3ToV2(v3, sampleV2);

    expect(v2.schema_version).toBe(2);
    expect(v2.id).toBe(sampleV2.id);
    expect(v2.header.name).toBe('Ada Lovelace');
    expect(v2.header.contact_lines).toEqual(sampleV2.header.contact_lines);
    expect(v2.sections[0].entries[0].title).toBe('Apple Platform Engineering');
    expect(v2.sections[0].entries[0].bullets.map((b) => b.kind)).toEqual(['bullet', 'plain']);
    expect(v2.sections[0].entries[0].bullets[0].content.content[0].content?.[0].text).toBe('Built systems.');
    expect(new Date(v2.metadata.updated_at).getTime()).toBeGreaterThan(0);
  });
});
