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

// ─── Test fixtures ─────────────────────────────────────────────────────────
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

describe('effectiveGid — Rule 1 (containment)', () => {
  it('typed plain inside an entry block → entry gid (no matter how many blanks above)', () => {
    // Reproduces user-reported bug: "123" sits one blank line below the
    // last bullet of an entry. Previously broke attribution; now Rule 1
    // says "you're inside entry-CareerOps's block, so you belong to it".
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        sec('rs', 'gS', 'PROJECTS'),
        entryTitle('rt', 'gE', 'CareerOps Pro'),
        bullet('rb1', 'gE', 'first'),
        bullet('rb2', 'gE', 'second'),
        emptyPlain('re'),
        typedPlain('rp', '123'),
      ],
      groups: [sectionGroup('gS'), entryGroup('gE', 'gS')],
    };
    expect(effectiveGid(doc, 5)).toBe('gE');
  });

  it('empty plain inside an entry block also gets the entry gid', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        sec('rs', 'gS', 'A'),
        entryTitle('rt', 'gE', 'T'),
        bullet('rb', 'gE', 'b'),
        emptyPlain('re'),
      ],
      groups: [sectionGroup('gS'), entryGroup('gE', 'gS')],
    };
    expect(effectiveGid(doc, 3)).toBe('gE');
  });

  it('typed plain between two entries inside one section → preceding entry', () => {
    // Per the simple boundary model: an entry block extends from its
    // entry.title to the NEXT entry.title (or section.heading). A plain
    // between the two entries belongs to the FIRST.
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        sec('rs', 'gS', 'A'),
        entryTitle('rt1', 'gE1', 'E1'),
        bullet('rb1', 'gE1', 'b1'),
        emptyPlain('re1'),
        typedPlain('rp', 'between'),
        emptyPlain('re2'),
        entryTitle('rt2', 'gE2', 'E2'),
        bullet('rb2', 'gE2', 'b2'),
      ],
      groups: [sectionGroup('gS'), entryGroup('gE1', 'gS'), entryGroup('gE2', 'gS')],
    };
    expect(effectiveGid(doc, 4)).toBe('gE1');
  });

  it('plain in section but BEFORE any entry.title → section gid', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        sec('rs', 'gS', 'Summary'),
        typedPlain('rp', 'lead-in'),
        emptyPlain('re'),
        typedPlain('rp2', 'still summary'),
      ],
      groups: [sectionGroup('gS')],
    };
    expect(effectiveGid(doc, 1)).toBe('gS');
    expect(effectiveGid(doc, 2)).toBe('gS');
    expect(effectiveGid(doc, 3)).toBe('gS');
  });

  it('typed plain at tail of section (no closing section.heading) → still in last entry', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        sec('rs', 'gS', 'A'),
        entryTitle('rt', 'gE', 'T'),
        bullet('rb', 'gE', 'b'),
        emptyPlain('re1'),
        emptyPlain('re2'),
        emptyPlain('re3'),
        typedPlain('rp', 'tail'),
      ],
      groups: [sectionGroup('gS'), entryGroup('gE', 'gS')],
    };
    expect(effectiveGid(doc, 6)).toBe('gE');
  });

  it('typed plain right after one section.heading and before next → section gid', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        sec('rs1', 'gS1', 'A'),
        entryTitle('rt', 'gE', 'T'),
        bullet('rb', 'gE', 'b'),
        sec('rs2', 'gS2', 'B'),
        typedPlain('rp', 'belongs to B'),
      ],
      groups: [sectionGroup('gS1'), sectionGroup('gS2'), entryGroup('gE', 'gS1')],
    };
    expect(effectiveGid(doc, 4)).toBe('gS2');
  });
});

describe('effectiveGid — Rule 2 (adjacency fallback for header area)', () => {
  it('typed plain right after header.name → null (header.name has no gid)', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        headerName('rh', 'Alice'),
        typedPlain('rp', 'subtitle'),
      ],
      groups: [],
    };
    expect(effectiveGid(doc, 1)).toBeNull();
  });

  it('typed plain after header.contact → null', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        headerContact('rc', 'a@b.c'),
        typedPlain('rp', 'orphan'),
      ],
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

  it('empty plain at doc start → null', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [emptyPlain('rp')],
      groups: [],
    };
    expect(effectiveGid(doc, 0)).toBeNull();
  });

  it('header area: typed plain right after typed plain that has null gid → null', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        headerName('rh', 'Alice'),
        typedPlain('rp1', 'a'),
        typedPlain('rp2', 'b'),
      ],
      groups: [],
    };
    // p1 → header.name has no gid → null. p2 → recurses on p1 → null.
    expect(effectiveGid(doc, 1)).toBeNull();
    expect(effectiveGid(doc, 2)).toBeNull();
  });

  it('header area: empty plain breaks adjacency for next typed plain', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        headerName('rh', 'Alice'),
        emptyPlain('re'),
        typedPlain('rp', 'after empty'),
      ],
      groups: [],
    };
    expect(effectiveGid(doc, 2)).toBeNull();
  });
});

describe('effectiveGidsFromState — PM-state mirror of containment rule', () => {
  it('typed plain after entry bullets inherits entry gid (Bug A — primary case)', () => {
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
    expect(eff[0]).toBe('gS');
    expect(eff[1]).toBe('gE');
    expect(eff[2]).toBe('gE');
    expect(eff[3]).toBe('gE');
    expect(eff[4]).toBe('gE');
  });

  it('typed plain N blanks below last bullet of entry → still entry gid', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        sec('rs', 'gS', 'A'),
        entryTitle('rt', 'gE', 'T'),
        bullet('rb', 'gE', 'b'),
        emptyPlain('re1'),
        emptyPlain('re2'),
        emptyPlain('re3'),
        typedPlain('rp', 'tail text'),
      ],
      groups: [sectionGroup('gS'), entryGroup('gE', 'gS')],
    };
    const eff = effectiveGidsFromState(makeStateFromV3(doc));
    expect(eff[6]).toBe('gE');
    // Empties inside the entry block also attribute (any plain inside block).
    expect(eff[3]).toBe('gE');
    expect(eff[4]).toBe('gE');
    expect(eff[5]).toBe('gE');
  });

  it('typed plain in section pre-entry area → section gid', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        sec('rs', 'gS', 'Summary'),
        typedPlain('rp', 'lead'),
      ],
      groups: [sectionGroup('gS')],
    };
    const eff = effectiveGidsFromState(makeStateFromV3(doc));
    expect(eff[1]).toBe('gS');
  });
});
