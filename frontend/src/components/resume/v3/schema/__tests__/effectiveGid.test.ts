import { describe, it, expect } from 'vitest';
import type { ResumeDocV3, RowId, GroupId } from '../types';
import { effectiveGid, effectiveGidsFromState } from '../effectiveGid';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { getSchema } from '@tiptap/core';
import { v3RowExtensions } from '../pmSchema';
import { Document } from '@tiptap/extension-document';
import { Text } from '@tiptap/extension-text';
import { hydrateInitialState } from '../hydrate';

const TestDoc = Document.extend({
  content: '(header_name | header_contact | section_heading | entry_title | entry_meta | plain | bullet)+',
});

function makeStateFromV3(doc: ResumeDocV3): EditorState {
  const schema = getSchema([TestDoc, Text, ...v3RowExtensions]) as Schema;
  const { docJSON } = hydrateInitialState(doc, schema);
  const pmDoc = schema.nodeFromJSON(docJSON as Parameters<typeof schema.nodeFromJSON>[0]);
  return EditorState.create({ schema, doc: pmDoc });
}

describe('effectiveGid', () => {
  it('empty plain row returns null', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'plain', content: { type: 'doc', content: [] } },
      ],
      groups: [],
    };
    expect(effectiveGid(doc, 0)).toBeNull();
  });

  it('typed plain after section.heading inherits section gid', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'section.heading', semanticGroupId: 'gSum' as GroupId, content: { text: 'Summary' } },
        { id: 'r2' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] } },
      ],
      groups: [{ id: 'gSum' as GroupId, kind: 'section', role: 'summary' }],
    };
    expect(effectiveGid(doc, 1)).toBe('gSum');
  });

  it('typed plain after entry.title inherits entry gid', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'entry.title', semanticGroupId: 'gE' as GroupId, content: { text: 'Engineer' } },
        { id: 'r2' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'body' }] }] } },
      ],
      groups: [{ id: 'gE' as GroupId, kind: 'entry' }],
    };
    expect(effectiveGid(doc, 1)).toBe('gE');
  });

  it('typed plain after bullet inherits entry gid (bullet has entry gid)', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'bullet', semanticGroupId: 'gE' as GroupId, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'shipped X' }] }] } },
        { id: 'r2' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'detail' }] }] } },
      ],
      groups: [{ id: 'gE' as GroupId, kind: 'entry' }],
    };
    expect(effectiveGid(doc, 1)).toBe('gE');
  });

  it('typed plain at doc start has no predecessor → null', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'orphan' }] }] } },
      ],
      groups: [],
    };
    expect(effectiveGid(doc, 0)).toBeNull();
  });

  it('typed plain chain: each inherits transitively', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'section.heading', semanticGroupId: 'gSum' as GroupId, content: { text: 'Summary' } },
        { id: 'r2' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] } },
        { id: 'r3' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] } },
        { id: 'r4' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'third' }] }] } },
      ],
      groups: [{ id: 'gSum' as GroupId, kind: 'section', role: 'summary' }],
    };
    expect(effectiveGid(doc, 1)).toBe('gSum');
    expect(effectiveGid(doc, 2)).toBe('gSum');
    expect(effectiveGid(doc, 3)).toBe('gSum');
  });

  it('cascade: empty plain in middle of chain breaks inheritance for downstream typed plains', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'section.heading', semanticGroupId: 'gSum' as GroupId, content: { text: 'Summary' } },
        { id: 'r2' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] } },
        { id: 'r3' as RowId, kind: 'plain', content: { type: 'doc', content: [] } }, // empty
        { id: 'r4' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'after empty' }] }] } },
      ],
      groups: [{ id: 'gSum' as GroupId, kind: 'section', role: 'summary' }],
    };
    expect(effectiveGid(doc, 1)).toBe('gSum');
    expect(effectiveGid(doc, 2)).toBeNull();
    // r4 looks at r3 (empty → null) → r4 inherits null
    expect(effectiveGid(doc, 3)).toBeNull();
  });

  it('PM-state variant: typed plain after entry bullets inherits entry gid (Bug A)', () => {
    // Reproduces the user-reported bug: an entry with title + 2 bullets,
    // followed by a typed plain row "123". The typed plain has no stored
    // semanticGroupId (the schema attribute is always null on plain), but
    // its EFFECTIVE gid must resolve to the entry's gid via the
    // empty/typed-plain inheritance rule. The hover/scope consumer in
    // ResumeCanvasV3 reads effective gids from PM state — this test pins
    // that the helper returns the entry gid for the typed plain.
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'rh' as RowId, kind: 'section.heading', semanticGroupId: 'gS' as GroupId, content: { text: 'PROJECTS' } },
        { id: 'rt' as RowId, kind: 'entry.title', semanticGroupId: 'gE' as GroupId, content: { text: 'CareerOps Pro' } },
        { id: 'rb1' as RowId, kind: 'bullet', semanticGroupId: 'gE' as GroupId, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first bullet' }] }] } },
        { id: 'rb2' as RowId, kind: 'bullet', semanticGroupId: 'gE' as GroupId, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second bullet' }] }] } },
        // Typed plain row "123" — no stored gid; should inherit gE via the
        // chain bullet→bullet→typed plain.
        { id: 'rp' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '123' }] }] } },
      ],
      groups: [
        { id: 'gS' as GroupId, kind: 'section', role: 'projects' },
        { id: 'gE' as GroupId, kind: 'entry', parentSectionGroupId: 'gS' as GroupId },
      ],
    };
    const state = makeStateFromV3(doc);
    const eff = effectiveGidsFromState(state);
    // Indices: 0 heading, 1 title, 2 bullet, 3 bullet, 4 typed plain.
    expect(eff[0]).toBe('gS');
    expect(eff[1]).toBe('gE');
    expect(eff[2]).toBe('gE');
    expect(eff[3]).toBe('gE');
    // The fix: typed plain "123" inherits the entry's gid.
    expect(eff[4]).toBe('gE');
  });

  it('PM-state variant: empty plain row has effective gid null', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'rh' as RowId, kind: 'section.heading', semanticGroupId: 'gS' as GroupId, content: { text: 'A' } },
        { id: 'rt' as RowId, kind: 'entry.title', semanticGroupId: 'gE' as GroupId, content: { text: 'Title' } },
        { id: 'rb' as RowId, kind: 'bullet', semanticGroupId: 'gE' as GroupId, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] } },
        { id: 'rp' as RowId, kind: 'plain', content: { type: 'doc', content: [] } }, // empty
      ],
      groups: [
        { id: 'gS' as GroupId, kind: 'section', role: 'projects' },
        { id: 'gE' as GroupId, kind: 'entry', parentSectionGroupId: 'gS' as GroupId },
      ],
    };
    const state = makeStateFromV3(doc);
    const eff = effectiveGidsFromState(state);
    expect(eff[3]).toBeNull();
  });

  it('typed plain after header.contact (which has no gid) → null', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'header.contact', content: { type: 'text', value: 'a@b.c' } },
        { id: 'r2' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'orphan body' }] }] } },
      ],
      groups: [],
    };
    expect(effectiveGid(doc, 1)).toBeNull();
  });
});
