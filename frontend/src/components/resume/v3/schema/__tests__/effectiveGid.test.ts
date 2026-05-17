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

// ─── Row builders ─────────────────────────────────────────────────────────
const sec = (id: string, gid: string, label: string): ResumeDocV3['rows'][number] => ({
  id: id as RowId, kind: 'section.heading',
  semanticGroupId: gid as GroupId,
  content: { text: label },
});
const entryTitle = (id: string, gid: string, label: string): ResumeDocV3['rows'][number] => ({
  id: id as RowId, kind: 'entry.title',
  semanticGroupId: gid as GroupId,
  content: { text: label },
});
const entryMeta = (id: string, gid: string, text: string): ResumeDocV3['rows'][number] => ({
  id: id as RowId, kind: 'entry.meta',
  semanticGroupId: gid as GroupId,
  content: { text },
});
const bullet = (id: string, gid: string, text: string): ResumeDocV3['rows'][number] => ({
  id: id as RowId, kind: 'bullet',
  semanticGroupId: gid as GroupId,
  content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});
const typedPlain = (id: string, text: string): ResumeDocV3['rows'][number] => ({
  id: id as RowId, kind: 'plain',
  content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});
const emptyPlain = (id: string): ResumeDocV3['rows'][number] => ({
  id: id as RowId, kind: 'plain',
  content: { type: 'doc', content: [] },
});
const headerName = (id: string, name: string): ResumeDocV3['rows'][number] => ({
  id: id as RowId, kind: 'header.name', content: { text: name },
});
const headerContact = (id: string, val: string): ResumeDocV3['rows'][number] => ({
  id: id as RowId, kind: 'header.contact',
  content: { type: 'text', value: val },
});

const sectionGroup = (id: string): ResumeDocV3['groups'][number] => ({
  id: id as GroupId, kind: 'section', role: 'projects',
});
const entryGroup = (id: string, parent?: string): ResumeDocV3['groups'][number] => ({
  id: id as GroupId, kind: 'entry',
  ...(parent ? { parentSectionGroupId: parent as GroupId } : {}),
});

describe('effectiveGid — Rule 1 (block containment)', () => {
  it('plain wedged between two bullets of same entry → entry gid (typed)', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        entryTitle('rt', 'gE', 'T'),
        bullet('rb1', 'gE', 'one'),
        typedPlain('rp', 'wedged'),
        bullet('rb2', 'gE', 'two'),
      ],
      groups: [entryGroup('gE')],
    };
    expect(effectiveGid(doc, 2)).toBe('gE');
  });

  it('plain wedged between two bullets of same entry → entry gid (empty)', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        entryTitle('rt', 'gE', 'T'),
        bullet('rb1', 'gE', 'one'),
        emptyPlain('rp'),
        bullet('rb2', 'gE', 'two'),
      ],
      groups: [entryGroup('gE')],
    };
    expect(effectiveGid(doc, 2)).toBe('gE');
  });

  it('user scenario: row 27 between row 20 (title) and row 32 (last bullet) → entry no matter what', () => {
    // Builds a CareerOps Pro entry with title + meta + several bullets,
    // then a typed plain in the middle, then more bullets.
    const rows = [
      entryTitle('rt', 'gCO', 'CareerOps Pro'),
      entryMeta('rm', 'gCO', 'Python, Next.js'),
      bullet('rb1', 'gCO', 'one'),
      bullet('rb2', 'gCO', 'two'),
      typedPlain('rp', 'middle paragraph'),    // inside block
      bullet('rb3', 'gCO', 'three'),
      bullet('rb4', 'gCO', 'four'),            // last entry-content
    ];
    const doc: ResumeDocV3 = { schemaVersion: 3, rows, groups: [entryGroup('gCO')] };
    expect(effectiveGid(doc, 4)).toBe('gCO');
  });
});

describe('effectiveGid — Rule 2 (trailing entry adjacency)', () => {
  it('empty plain right after entry’s last bullet → null', () => {
    // User: row 33 right after the last bullet, still empty — doesn't belong.
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        entryTitle('rt', 'gE', 'T'),
        bullet('rb', 'gE', 'last'),
        emptyPlain('re'),
      ],
      groups: [entryGroup('gE')],
    };
    expect(effectiveGid(doc, 2)).toBeNull();
  });

  it('typed plain right after entry’s last bullet (no empty between) → entry gid', () => {
    // User: row 33 was empty but the user typed into it — now it belongs.
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        entryTitle('rt', 'gE', 'T'),
        bullet('rb', 'gE', 'last'),
        typedPlain('rp', '123'),
      ],
      groups: [entryGroup('gE')],
    };
    expect(effectiveGid(doc, 2)).toBe('gE');
  });

  it('typed plain after an empty plain after entry → null', () => {
    // User: row 33 empty, row 34 typed — row 34 is independent because
    // of the empty in between.
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        entryTitle('rt', 'gE', 'T'),
        bullet('rb', 'gE', 'last'),
        emptyPlain('re'),       // row 33
        typedPlain('rp', '34'), // row 34
      ],
      groups: [entryGroup('gE')],
    };
    expect(effectiveGid(doc, 3)).toBeNull();
  });

  it('chain of typed plains right after entry (no empties) → all in entry', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        entryTitle('rt', 'gE', 'T'),
        bullet('rb', 'gE', 'last'),
        typedPlain('rp1', 'a'),
        typedPlain('rp2', 'b'),
        typedPlain('rp3', 'c'),
      ],
      groups: [entryGroup('gE')],
    };
    expect(effectiveGid(doc, 2)).toBe('gE');
    expect(effectiveGid(doc, 3)).toBe('gE');
    expect(effectiveGid(doc, 4)).toBe('gE');
  });

  it('typed plains separated by an empty plain → only the first chain belongs', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        entryTitle('rt', 'gE', 'T'),
        bullet('rb', 'gE', 'last'),
        typedPlain('rp1', 'a'),   // adjacent → entry
        emptyPlain('re'),         // empty → null
        typedPlain('rp2', 'b'),   // separated by empty → null
      ],
      groups: [entryGroup('gE')],
    };
    expect(effectiveGid(doc, 2)).toBe('gE');
    expect(effectiveGid(doc, 3)).toBeNull();
    expect(effectiveGid(doc, 4)).toBeNull();
  });

  it('plain between last bullet of E1 and entry.title of E2 → trailing E1', () => {
    // The trailing rule attributes by the row above (E1's bullet), not the
    // row below (E2's title).
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        entryTitle('rt1', 'gE1', 'E1'),
        bullet('rb1', 'gE1', 'b'),
        typedPlain('rp', 'between'),
        entryTitle('rt2', 'gE2', 'E2'),
        bullet('rb2', 'gE2', 'b'),
      ],
      groups: [entryGroup('gE1'), entryGroup('gE2')],
    };
    expect(effectiveGid(doc, 2)).toBe('gE1');
  });
});

describe('effectiveGid — Rule 3 (trailing section adjacency)', () => {
  it('typed plain right after section.heading (no entry yet) → section gid', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        sec('rs', 'gS', 'Summary'),
        typedPlain('rp', 'lead-in'),
      ],
      groups: [sectionGroup('gS')],
    };
    expect(effectiveGid(doc, 1)).toBe('gS');
  });

  it('empty plain right after section.heading → null', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        sec('rs', 'gS', 'Summary'),
        emptyPlain('rp'),
      ],
      groups: [sectionGroup('gS')],
    };
    expect(effectiveGid(doc, 1)).toBeNull();
  });

  it('typed plain after empty after section.heading → null', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        sec('rs', 'gS', 'Summary'),
        emptyPlain('re'),
        typedPlain('rp', 'separated'),
      ],
      groups: [sectionGroup('gS')],
    };
    expect(effectiveGid(doc, 2)).toBeNull();
  });
});

describe('effectiveGid — header / fallback / orphan-bullet edge cases', () => {
  it('typed plain right after header.name → null', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [headerName('rh', 'Alice'), typedPlain('rp', 'x')],
      groups: [],
    };
    expect(effectiveGid(doc, 1)).toBeNull();
  });

  it('typed plain right after header.contact → null', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [headerContact('rc', 'a@b.c'), typedPlain('rp', 'x')],
      groups: [],
    };
    expect(effectiveGid(doc, 1)).toBeNull();
  });

  it('typed plain at doc start → null', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [typedPlain('rp', 'lone')],
      groups: [],
    };
    expect(effectiveGid(doc, 0)).toBeNull();
  });

  it('orphan bullet: typed plain immediately after orphan bullet → orphan entry gid', () => {
    // An orphan bullet (no entry.title for its group) is still entry-content.
    // A typed plain immediately after it attributes to the orphan entry.
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        entryTitle('rt', 'gReal', 'Real'),
        bullet('rb', 'gReal', 'real'),
        bullet('rorph', 'gOrph', 'orphan bullet'),
        typedPlain('rp', '234'),
      ],
      groups: [entryGroup('gReal'), entryGroup('gOrph')],
    };
    expect(effectiveGid(doc, 3)).toBe('gOrph');
  });

  it('orphan bullet: empty plain after orphan bullet → null', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        bullet('rorph', 'gOrph', 'orphan'),
        emptyPlain('re'),
      ],
      groups: [entryGroup('gOrph')],
    };
    expect(effectiveGid(doc, 1)).toBeNull();
  });

  it('orphan bullet: typed plain after empty after orphan bullet → null (separated)', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        bullet('rorph', 'gOrph', 'orphan'),
        emptyPlain('re'),
        typedPlain('rp', '5'),
      ],
      groups: [entryGroup('gOrph')],
    };
    expect(effectiveGid(doc, 2)).toBeNull();
  });
});

describe('effectiveGidsFromState — PM-state mirror', () => {
  it('CareerOps Pro repro: typed "123" right below last bullet (one empty above) → entry gid', () => {
    // The exact case from the user's screenshot — "123" immediately after
    // the entry's last bullet (no empty between them) belongs.
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        sec('rs', 'gS', 'PROJECTS'),
        entryTitle('rt', 'gE', 'CareerOps Pro'),
        bullet('rb1', 'gE', 'first'),
        bullet('rb2', 'gE', 'second'),
        typedPlain('rp', '123'),
      ],
      groups: [sectionGroup('gS'), entryGroup('gE', 'gS')],
    };
    const eff = effectiveGidsFromState(makeStateFromV3(doc));
    expect(eff[4]).toBe('gE');
  });

  it('typed "123" two rows below last bullet with one empty between → still entry (no empty in between path)', () => {
    // Wait: an empty plain AT i-1 is a plain AT i-1, not "between". The
    // "between" check looks at strict rows STRICTLY between pIdx and i.
    // Here pIdx (last bullet) = i-2; rows STRICTLY between = i-1, which IS
    // an empty plain → trailing rule says null.
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        entryTitle('rt', 'gE', 'T'),
        bullet('rb', 'gE', 'last'),
        emptyPlain('re'),
        typedPlain('rp', '123'),
      ],
      groups: [entryGroup('gE')],
    };
    const eff = effectiveGidsFromState(makeStateFromV3(doc));
    expect(eff[3]).toBeNull();
  });

  it('plain inside entry block: trailing empty rows at doc tail past last bullet → null (not in entry)', () => {
    // The user's complaint case: a bunch of trailing empty New-line
    // placeholders at the doc tail with no entry-content below them.
    // These should NOT be part of the entry.
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        entryTitle('rt', 'gE', 'T'),
        bullet('rb', 'gE', 'b'),
        emptyPlain('re1'),
        emptyPlain('re2'),
        emptyPlain('re3'),
      ],
      groups: [entryGroup('gE')],
    };
    const eff = effectiveGidsFromState(makeStateFromV3(doc));
    expect(eff[2]).toBeNull();
    expect(eff[3]).toBeNull();
    expect(eff[4]).toBeNull();
  });

  it('block containment via bullets above and below: empty plain "wedged" between two bullets of same entry → in entry', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        entryTitle('rt', 'gE', 'T'),
        bullet('rb1', 'gE', 'one'),
        emptyPlain('re'),
        bullet('rb2', 'gE', 'two'),
      ],
      groups: [entryGroup('gE')],
    };
    const eff = effectiveGidsFromState(makeStateFromV3(doc));
    expect(eff[2]).toBe('gE');
  });
});
