import { describe, expect, it } from 'vitest';
import type { ResumeDoc as ResumeDocV2 } from '../../../v2/types';
import type { GroupId, RowId } from '../types';
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

  it('keeps empty plain rows in v2 persistence because blank lines are user-authored spacing', () => {
    const v3 = v2ToV3(sampleV2);
    const entryTitleIndex = v3.rows.findIndex((row) => row.kind === 'entry.title');
    expect(entryTitleIndex).toBeGreaterThanOrEqual(0);

    v3.rows.splice(entryTitleIndex + 1, 0, {
      id: 'empty-plain' as RowId,
      kind: 'plain',
      semanticGroupId: 'entry-apple' as GroupId,
      content: { type: 'doc', content: [] },
    });

    const v2 = v3ToV2(v3, sampleV2);

    expect(v2.sections[0].entries[0].bullets.map((b) => b.id)).toEqual(['empty-plain', 'bullet-1', 'bullet-2']);
    expect(v2.sections[0].entries[0].bullets.map((b) => b.kind)).toEqual(['plain', 'bullet', 'plain']);
  });

  it('keeps empty orphan plain rows as authored blank-line entries', () => {
    const v3 = v2ToV3(sampleV2);
    const sectionHeadingIndex = v3.rows.findIndex((row) => row.kind === 'section.heading');
    expect(sectionHeadingIndex).toBeGreaterThanOrEqual(0);

    v3.rows.splice(sectionHeadingIndex + 1, 0, {
      id: 'empty-orphan-plain' as RowId,
      kind: 'plain',
      semanticGroupId: 'missing-entry' as GroupId,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
    });

    const v2 = v3ToV2(v3, sampleV2);

    expect(v2.sections[0].entries.map((entry) => entry.id)).toEqual(['missing-entry', 'entry-apple']);
    expect(v2.sections[0].entries[0].bullets).toHaveLength(1);
    expect(v2.sections[0].entries[0].bullets[0].kind).toBe('plain');
  });

  // ─── Independent-plain rule (null gid) round-trip ────────────────────
  // Per the new schema rule, plain rows created by Enter have
  // semanticGroupId=null. v3ToV2 must serialize them as "synthetic
  // entries" (empty title/meta + 1 plain bullet, entry.id === bullet.id);
  // v2ToV3 must collapse that pattern back to a single null-gid plain row
  // so save/reload doesn't multiply the row.

  it('serializes a null-gid plain row as a synthetic entry keyed by row id', () => {
    const v3 = v2ToV3(sampleV2);
    const sectionHeadingIndex = v3.rows.findIndex((row) => row.kind === 'section.heading');
    expect(sectionHeadingIndex).toBeGreaterThanOrEqual(0);

    // Insert an independent plain row (gid omitted) right after the section
    // heading — i.e. before the existing entry.
    v3.rows.splice(sectionHeadingIndex + 1, 0, {
      id: 'independent-plain' as RowId,
      kind: 'plain',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'standalone paragraph' }] }] },
    });

    const v2 = v3ToV2(v3, sampleV2);

    // Synthetic entry id === row id. Comes BEFORE the original entry-apple
    // because doc-order sort places it first.
    expect(v2.sections[0].entries.map((e) => e.id)).toEqual(['independent-plain', 'entry-apple']);
    const synth = v2.sections[0].entries[0];
    expect(synth.title).toBe('');
    expect(synth.meta).toBe('');
    expect(synth.bullets).toHaveLength(1);
    expect(synth.bullets[0].id).toBe('independent-plain'); // bullet.id === entry.id is the marker
    expect(synth.bullets[0].kind).toBe('plain');
  });

  it('collapses synthetic-pattern entry back to a single independent plain row on v2ToV3', () => {
    // Build a v2 doc that contains the exact synthetic shape v3ToV2 emits:
    // empty title, empty meta, one plain bullet whose id === entry.id.
    const v2WithSynth: ResumeDocV2 = {
      ...sampleV2,
      sections: [
        {
          id: 'section-exp',
          role: 'experience',
          heading: 'Experience',
          entries: [
            {
              id: 'standalone-1',
              title: '',
              meta: '',
              bullets: [{
                id: 'standalone-1',
                kind: 'plain',
                content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'free paragraph' }] }] },
              }],
            },
            sampleV2.sections[0].entries[0], // the original entry-apple
          ],
        },
      ],
    };

    const v3 = v2ToV3(v2WithSynth);

    // The synthetic entry should NOT produce title/meta rows. It should
    // collapse to a single plain row with no semanticGroupId attribute.
    const standaloneRow = v3.rows.find((r) => r.id === 'standalone-1');
    expect(standaloneRow).toBeTruthy();
    expect(standaloneRow!.kind).toBe('plain');
    // Independence marker: gid is undefined / null on the row.
    expect((standaloneRow as { semanticGroupId?: unknown }).semanticGroupId ?? null).toBeNull();
    // No title/meta rows for it (only entry-apple's title/meta should exist).
    const titleRows = v3.rows.filter((r) => r.kind === 'entry.title');
    expect(titleRows.map((r) => r.id)).not.toContain('entry:standalone-1:title');
  });

  it('round-trip stable: null-gid plain row survives v3ToV2 → v2ToV3 unchanged', () => {
    const v3 = v2ToV3(sampleV2);
    const sectionHeadingIndex = v3.rows.findIndex((row) => row.kind === 'section.heading');

    v3.rows.splice(sectionHeadingIndex + 1, 0, {
      id: 'rt-plain' as RowId,
      kind: 'plain',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'survives roundtrip' }] }] },
    });

    const v2 = v3ToV2(v3, sampleV2);
    const v3Back = v2ToV3(v2);

    const rtRow = v3Back.rows.find((r) => r.id === 'rt-plain');
    expect(rtRow).toBeTruthy();
    expect(rtRow!.kind).toBe('plain');
    expect((rtRow as { semanticGroupId?: unknown }).semanticGroupId ?? null).toBeNull();
    // Critical: should NOT have multiplied into title+meta+bullet on the
    // way back — exactly one row for this paragraph.
    expect(v3Back.rows.filter((r) => r.id === 'rt-plain')).toHaveLength(1);
  });

  it('does not serialize duplicate section headings with the same group as duplicate sections', () => {
    const v3 = v2ToV3(sampleV2);
    const sectionHeading = v3.rows.find((row) => row.kind === 'section.heading');
    expect(sectionHeading).toBeTruthy();
    const duplicate = {
      ...sectionHeading!,
      id: 'duplicate-section-heading',
      content: { text: '' },
    } as typeof v3.rows[number];
    v3.rows.splice(v3.rows.indexOf(sectionHeading!), 0, duplicate);

    const v2 = v3ToV2(v3, sampleV2);

    expect(v2.sections).toHaveLength(1);
    expect(v2.sections[0].id).toBe('section-exp');
    expect(v2.sections[0].heading).toBe('Experience');
    expect(v2.sections[0].entries).toHaveLength(1);
    expect(v2.sections[0].entries[0].bullets).toHaveLength(2);
  });

});
