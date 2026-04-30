import { describe, it, expect } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import type { GroupId, ResumeDocV3, RowId } from '../types';
import { hydrateInitialState } from '../hydrate';
import { serializeEditorState } from '../serialize';
import { createGroupsPlugin } from '../../plugins/GroupsPlugin';

// Test schema MIRRORS production § 3.1 exactly. plain/bullet have `content:'inline*'`
// (raw inline children: text + marks; no paragraph wrapper inside the row). The wrap/unwrap
// adapters bridge persisted RichText (which IS a {type:'doc',content:[paragraph,...]} for
// schema-validity reasons during transport / AI / clipboard) and the row's inline-only content.
//
// hydrate: extract paragraph children's INLINE content into the row directly.
// serialize: synthesize a {type:'doc',content:[{type:'paragraph',content: rowInline}]} on output.
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

describe('serialize/hydrate round-trip', () => {
  it('serialize drops orphan groups (post-undo orphan case — save-time GC contract)', () => {
    // Hydrate with two groups, then mutate state so one is orphaned, then serialize.
    const original: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'header.name', content: { text: 'Test' } },
        { id: 'r2' as RowId, kind: 'section.heading', content: { text: 'Exp' }, semanticGroupId: 'g1' as GroupId },
      ],
      groups: [
        { id: 'g1' as GroupId, kind: 'section', role: 'experience' },
        // g2 has no row referencing it — pretend it's a left-over orphan from
        // a prior plugin-state operation that was undone (PM doesn't restore
        // group plugin state on undo, see Task 14 contract).
        { id: 'g2' as GroupId, kind: 'entry' },
      ],
    };
    const { docJSON, groups: initialGroups } = hydrateInitialState(original, schema);
    let state = EditorState.create({
      schema,
      doc: schema.nodeFromJSON(docJSON),
      plugins: [createGroupsPlugin()],
    });
    state = state.apply(state.tr.setMeta('groupsHydrate', initialGroups));

    const serialized = serializeEditorState(state);
    // g2 is dropped (no row references it).
    expect(serialized.groups.map((g) => g.id)).toEqual(['g1']);
    // g1 is preserved (referenced by r2).
    expect(serialized.groups[0].kind).toBe('section');
  });

  it('round-trip preserves rows + groups byte-identically', () => {
    const original: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'header.name', content: { text: 'Test User' } },
        { id: 'r2' as RowId, kind: 'header.contact', content: { type: 'text', value: 'foo@bar.com' } },
        { id: 'r3' as RowId, kind: 'section.heading', content: { text: 'Experience' }, semanticGroupId: 'g1' as GroupId },
        { id: 'r4' as RowId, kind: 'entry.title', content: { text: 'Senior PM' }, semanticGroupId: 'g2' as GroupId },
        { id: 'r5' as RowId, kind: 'entry.meta', content: { text: '2022-Present' }, semanticGroupId: 'g2' as GroupId },
        // RichText: persisted as a 'doc' wrapper with paragraph children.
        // hydrate copies paragraphs into the bullet PM node (content:'paragraph');
        // serialize wraps them back into 'doc'. Round-trip is byte-identical.
        { id: 'r6' as RowId, kind: 'bullet', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Did things' }] }] }, semanticGroupId: 'g2' as GroupId },
      ],
      groups: [
        { id: 'g1' as GroupId, kind: 'section', role: 'experience' },
        { id: 'g2' as GroupId, kind: 'entry', parentSectionGroupId: 'g1' as GroupId },
      ],
    };

    const { docJSON, groups: initialGroups } = hydrateInitialState(original, schema);
    // PM transactions are bound to their originating EditorState. Build the
    // state first, THEN call state.tr (not a tr from a second EditorState).
    let state = EditorState.create({
      schema,
      doc: schema.nodeFromJSON(docJSON),
      plugins: [createGroupsPlugin()],
    });
    state = state.apply(state.tr.setMeta('groupsHydrate', initialGroups));

    const roundTrip = serializeEditorState(state);
    expect(roundTrip.schemaVersion).toBe(3);
    expect(roundTrip.rows).toEqual(original.rows);
    expect(roundTrip.groups).toEqual(original.groups);
  });
});
