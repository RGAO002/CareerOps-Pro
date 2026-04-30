import { describe, it, expect } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { createGroupsPlugin } from '../../plugins/GroupsPlugin';
import { hydrateInitialState } from '../../schema/hydrate';
import { assembleAIContext } from '../contextAssembly';
import type { GroupId, ResumeDocV3, RowId } from '../../schema/types';

// Minimal schema mirroring production node names (T18). plain/bullet have
// `content: 'inline*'` like production. Adapter via hydrateInitialState bridges
// persisted RichText to the inline-only PM row.
const schema = new Schema({
  nodes: {
    doc: { content: '(header_name | header_contact | section_heading | entry_title | entry_meta | plain | bullet)+' },
    text: { group: 'inline', inline: true },
    header_name:     { attrs: { id: { default: '' } }, content: 'text*' },
    header_contact:  { attrs: { id: { default: '' } }, content: 'text*' },
    section_heading: { attrs: { id: { default: '' }, semanticGroupId: { default: null } }, content: 'text*' },
    entry_title:     { attrs: { id: { default: '' }, semanticGroupId: { default: null } }, content: 'text*' },
    entry_meta:      { attrs: { id: { default: '' }, semanticGroupId: { default: null } }, content: 'text*' },
    plain:           { attrs: { id: { default: '' }, semanticGroupId: { default: null } }, content: 'inline*', inline: false },
    bullet:          { attrs: { id: { default: '' }, semanticGroupId: { default: null } }, content: 'inline*', inline: false },
  },
});

function buildState(doc: ResumeDocV3): EditorState {
  const { docJSON, groups } = hydrateInitialState(doc, schema);
  let state = EditorState.create({
    schema,
    doc: schema.nodeFromJSON(docJSON),
    plugins: [createGroupsPlugin()],
  });
  state = state.apply(state.tr.setMeta('groupsHydrate', groups));
  return state;
}

// Helper: rich-text content for plain/bullet rows.
function rt(text: string): { type: 'doc'; content: unknown[] } {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

describe('assembleAIContext (§ 6.4)', () => {
  it('aggregates header rows into context.header (name + contact list)', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'header.name', content: { text: 'Jane Doe' } },
        { id: 'r2' as RowId, kind: 'header.contact', content: { type: 'text', value: 'jane@example.com' } },
        { id: 'r3' as RowId, kind: 'header.contact', content: { type: 'text', value: '555-1234' } },
      ],
      groups: [],
    };
    const state = buildState(doc);
    const ctx = assembleAIContext(state);
    expect(ctx.header.name).toBe('Jane Doe');
    expect(ctx.header.contact).toEqual(['jane@example.com', '555-1234']);
    expect(ctx.sections).toEqual([]);
    expect(ctx.orphanRows).toEqual([]);
  });

  it('assembles multiple sections each with multiple entries correctly', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r0' as RowId, kind: 'header.name', content: { text: 'Jane' } },
        // Section 1: Experience with two entries
        { id: 'r1' as RowId, kind: 'section.heading', content: { text: 'Experience' }, semanticGroupId: 'sExp' as GroupId },
        { id: 'r2' as RowId, kind: 'entry.title', content: { text: 'Senior Dev @ Acme' }, semanticGroupId: 'eAcme' as GroupId },
        { id: 'r3' as RowId, kind: 'entry.meta', content: { text: '2020 — Present' }, semanticGroupId: 'eAcme' as GroupId },
        { id: 'r4' as RowId, kind: 'bullet', content: rt('Led team of 5'), semanticGroupId: 'eAcme' as GroupId },
        { id: 'r5' as RowId, kind: 'bullet', content: rt('Shipped X'), semanticGroupId: 'eAcme' as GroupId },
        { id: 'r6' as RowId, kind: 'entry.title', content: { text: 'Junior Dev @ Beta' }, semanticGroupId: 'eBeta' as GroupId },
        { id: 'r7' as RowId, kind: 'bullet', content: rt('Built foo'), semanticGroupId: 'eBeta' as GroupId },
        // Section 2: Education with one entry
        { id: 'r8' as RowId, kind: 'section.heading', content: { text: 'Education' }, semanticGroupId: 'sEdu' as GroupId },
        { id: 'r9' as RowId, kind: 'entry.title', content: { text: 'BS @ University' }, semanticGroupId: 'eUni' as GroupId },
        { id: 'r10' as RowId, kind: 'entry.meta', content: { text: '2016 — 2020' }, semanticGroupId: 'eUni' as GroupId },
      ],
      groups: [
        { id: 'sExp' as GroupId, kind: 'section', role: 'experience' },
        { id: 'sEdu' as GroupId, kind: 'section', role: 'education' },
        { id: 'eAcme' as GroupId, kind: 'entry', parentSectionGroupId: 'sExp' as GroupId },
        { id: 'eBeta' as GroupId, kind: 'entry', parentSectionGroupId: 'sExp' as GroupId },
        { id: 'eUni' as GroupId, kind: 'entry', parentSectionGroupId: 'sEdu' as GroupId },
      ],
    };
    const state = buildState(doc);
    const ctx = assembleAIContext(state);

    expect(ctx.sections).toHaveLength(2);

    const exp = ctx.sections[0];
    expect(exp.role).toBe('experience');
    expect(exp.heading).toBe('Experience');
    expect(exp.groupId).toBe('sExp');
    expect(exp.entries).toHaveLength(2);
    expect(exp.entries[0].title).toBe('Senior Dev @ Acme');
    expect(exp.entries[0].meta).toBe('2020 — Present');
    expect(exp.entries[0].bullets).toEqual(['Led team of 5', 'Shipped X']);
    expect(exp.entries[1].title).toBe('Junior Dev @ Beta');
    expect(exp.entries[1].bullets).toEqual(['Built foo']);

    const edu = ctx.sections[1];
    expect(edu.role).toBe('education');
    expect(edu.entries).toHaveLength(1);
    expect(edu.entries[0].title).toBe('BS @ University');
    expect(edu.entries[0].meta).toBe('2016 — 2020');

    expect(ctx.orphanRows).toEqual([]);
  });

  it('section with direct plain rows (no entries; e.g. Summary) attaches them to section.directRows', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r0' as RowId, kind: 'header.name', content: { text: 'Jane' } },
        { id: 'r1' as RowId, kind: 'section.heading', content: { text: 'Summary' }, semanticGroupId: 'sSum' as GroupId },
        { id: 'r2' as RowId, kind: 'plain', content: rt('Experienced engineer.'), semanticGroupId: 'sSum' as GroupId },
        { id: 'r3' as RowId, kind: 'plain', content: rt('Loves shipping.'), semanticGroupId: 'sSum' as GroupId },
      ],
      groups: [
        { id: 'sSum' as GroupId, kind: 'section', role: 'summary' },
      ],
    };
    const state = buildState(doc);
    const ctx = assembleAIContext(state);

    expect(ctx.sections).toHaveLength(1);
    const s = ctx.sections[0];
    expect(s.role).toBe('summary');
    expect(s.entries).toEqual([]);
    expect(s.directRows.map((r) => r.text)).toEqual([
      'Experienced engineer.',
      'Loves shipping.',
    ]);
    expect(s.directRows.every((r) => r.kind === 'plain')).toBe(true);
  });

  it('orphan rows (no preceding section) land in context.orphanRows', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r0' as RowId, kind: 'header.name', content: { text: 'Jane' } },
        // plain row with no group AND no preceding section.
        { id: 'r1' as RowId, kind: 'plain', content: rt('Floating note.') },
        { id: 'r2' as RowId, kind: 'bullet', content: rt('Stray bullet.') },
      ],
      groups: [],
    };
    const state = buildState(doc);
    const ctx = assembleAIContext(state);

    expect(ctx.sections).toEqual([]);
    expect(ctx.orphanRows).toHaveLength(2);
    expect(ctx.orphanRows.map((r) => r.text)).toEqual(['Floating note.', 'Stray bullet.']);
  });

  it('entry rows are ordered by document position', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r0' as RowId, kind: 'header.name', content: { text: 'Jane' } },
        { id: 'r1' as RowId, kind: 'section.heading', content: { text: 'Experience' }, semanticGroupId: 'sExp' as GroupId },
        { id: 'r2' as RowId, kind: 'entry.title', content: { text: 'A' }, semanticGroupId: 'eA' as GroupId },
        { id: 'r3' as RowId, kind: 'bullet', content: rt('a1'), semanticGroupId: 'eA' as GroupId },
        { id: 'r4' as RowId, kind: 'bullet', content: rt('a2'), semanticGroupId: 'eA' as GroupId },
        { id: 'r5' as RowId, kind: 'bullet', content: rt('a3'), semanticGroupId: 'eA' as GroupId },
      ],
      groups: [
        { id: 'sExp' as GroupId, kind: 'section', role: 'experience' },
        { id: 'eA' as GroupId, kind: 'entry', parentSectionGroupId: 'sExp' as GroupId },
      ],
    };
    const state = buildState(doc);
    const ctx = assembleAIContext(state);
    expect(ctx.sections[0].entries[0].bullets).toEqual(['a1', 'a2', 'a3']);
  });

  it('bullets carry plain text content (mark stripping / pass-through)', () => {
    // Production rich-text bullets may contain marks; assembleAIContext returns
    // node.textContent which is plain text with marks stripped.
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r0' as RowId, kind: 'header.name', content: { text: 'Jane' } },
        { id: 'r1' as RowId, kind: 'section.heading', content: { text: 'X' }, semanticGroupId: 'sX' as GroupId },
        { id: 'r2' as RowId, kind: 'entry.title', content: { text: 'E' }, semanticGroupId: 'eE' as GroupId },
        // Multi-text-node bullet (would have marks in production); plain text.
        {
          id: 'r3' as RowId,
          kind: 'bullet',
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'World' }] }] },
          semanticGroupId: 'eE' as GroupId,
        },
      ],
      groups: [
        { id: 'sX' as GroupId, kind: 'section', role: 'custom' },
        { id: 'eE' as GroupId, kind: 'entry', parentSectionGroupId: 'sX' as GroupId },
      ],
    };
    const state = buildState(doc);
    const ctx = assembleAIContext(state);
    expect(ctx.sections[0].entries[0].bullets).toEqual(['Hello World']);
  });

  it('F4 orphan-tolerant: entry whose parentSectionGroupId points at a missing section → entry lands in context.orphanRows (no crash)', () => {
    // Entry group `eOrphan` claims `parentSectionGroupId: sMissing` but `sMissing`
    // does not exist in groups state. The entry.title comes BEFORE any
    // section.heading row, so there is no current section to host it. The
    // entry's title + its bullets must land in orphanRows, not crash.
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r0' as RowId, kind: 'header.name', content: { text: 'Jane' } },
        // Entry with no preceding section heading
        { id: 'r1' as RowId, kind: 'entry.title', content: { text: 'Stranded entry' }, semanticGroupId: 'eOrphan' as GroupId },
        { id: 'r2' as RowId, kind: 'bullet', content: rt('Stranded bullet'), semanticGroupId: 'eOrphan' as GroupId },
      ],
      groups: [
        // Entry references a missing section group
        { id: 'eOrphan' as GroupId, kind: 'entry', parentSectionGroupId: 'sMissing' as GroupId },
      ],
    };
    const state = buildState(doc);
    // Must not throw.
    const ctx = assembleAIContext(state);
    expect(ctx.sections).toEqual([]);
    expect(ctx.orphanRows.map((r) => r.text)).toContain('Stranded entry');
    expect(ctx.orphanRows.map((r) => r.text)).toContain('Stranded bullet');
  });

  it('F4 orphan-tolerant: row whose group is missing from plugin state still places — never throws', () => {
    // bullet row carries semanticGroupId 'eGhost' but no such group exists in
    // plugin state. Must not throw.
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r0' as RowId, kind: 'header.name', content: { text: 'Jane' } },
        { id: 'r1' as RowId, kind: 'section.heading', content: { text: 'Experience' }, semanticGroupId: 'sExp' as GroupId },
        // Bullet with a ghost group id (group not in plugin state)
        { id: 'r2' as RowId, kind: 'bullet', content: rt('Ghost bullet'), semanticGroupId: 'eGhost' as GroupId },
      ],
      groups: [
        { id: 'sExp' as GroupId, kind: 'section', role: 'experience' },
        // 'eGhost' intentionally not declared
      ],
    };
    const state = buildState(doc);
    const ctx = assembleAIContext(state);
    // Bullet still placed (under the current section's directRows since no
    // entry was ever opened); does not crash.
    expect(ctx.sections).toHaveLength(1);
    const allTexts = [
      ...ctx.sections[0].directRows.map((r) => r.text),
      ...ctx.orphanRows.map((r) => r.text),
    ];
    expect(allTexts).toContain('Ghost bullet');
  });
});
