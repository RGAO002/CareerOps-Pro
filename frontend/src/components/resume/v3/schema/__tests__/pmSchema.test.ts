import { describe, it, expect } from 'vitest';
import { getSchema } from '@tiptap/core';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Link } from '@tiptap/extension-link';
import { Document } from '@tiptap/extension-document';
import { Text } from '@tiptap/extension-text';
import { v3RowExtensions, buildContent } from '../pmSchema';
import type { GroupId, ResumeRow, RowId } from '../types';

const TestDoc = Document.extend({
  content: '(header_name | header_contact | section_heading | entry_title | entry_meta | plain | bullet)+',
});

const extensions = [TestDoc, Text, Bold, Italic, Link, ...v3RowExtensions];

describe('v3 production PM schema', () => {
  const schema = getSchema(extensions);

  it('registers 7 row node types with underscore names', () => {
    const expected = [
      'header_name',
      'header_contact',
      'section_heading',
      'entry_title',
      'entry_meta',
      'plain',
      'bullet',
    ];
    for (const name of expected) {
      expect(schema.nodes[name]).toBeDefined();
    }
  });

  it('header_name has content text* and disallows marks', () => {
    const t = schema.nodes.header_name;
    expect(t.spec.content).toBe('text*');
    // marks: '' means none allowed
    expect(t.spec.marks).toBe('');
    expect(t.spec.defining).toBe(true);
  });

  it('section_heading has content text* and disallows marks; defining', () => {
    const t = schema.nodes.section_heading;
    expect(t.spec.content).toBe('text*');
    expect(t.spec.marks).toBe('');
    expect(t.spec.defining).toBe(true);
  });

  it('plain and bullet have inline* content and accept inline marks', () => {
    for (const name of ['plain', 'bullet']) {
      const t = schema.nodes[name];
      expect(t.spec.content).toBe('inline*');
      // Build a node with a bold-marked text child — should not throw.
      const bold = schema.marks.bold.create();
      const child = schema.text('hi', [bold]);
      expect(() => t.create({ id: 'r1' }, [child])).not.toThrow();
    }
  });

  it('header_contact, entry_title, entry_meta accept inline marks', () => {
    for (const name of ['header_contact', 'entry_title', 'entry_meta']) {
      const t = schema.nodes[name];
      expect(t.spec.content).toBe('inline*');
      const italic = schema.marks.italic.create();
      const child = schema.text('hi', [italic]);
      expect(() => t.create({ id: 'r1' }, [child])).not.toThrow();
    }
  });

  it('section_heading / entry_title / entry_meta have semanticGroupId attr default null', () => {
    for (const name of ['section_heading', 'entry_title', 'entry_meta']) {
      const t = schema.nodes[name];
      const node = t.createAndFill({ id: 'x' });
      expect(node?.attrs.semanticGroupId).toBeNull();
    }
  });

  it('plain and bullet have optional semanticGroupId attr default null', () => {
    for (const name of ['plain', 'bullet']) {
      const t = schema.nodes[name];
      const node = t.createAndFill({ id: 'x' });
      expect(node?.attrs.semanticGroupId).toBeNull();
    }
  });

  it('every row node type has id attr default ""', () => {
    const names = [
      'header_name',
      'header_contact',
      'section_heading',
      'entry_title',
      'entry_meta',
      'plain',
      'bullet',
    ];
    for (const name of names) {
      const t = schema.nodes[name];
      const node = t.createAndFill();
      expect(node?.attrs.id).toBe('');
    }
  });

  it('buildContent helper round-trips a known fixture into a valid PM doc', () => {
    const fixtureRows: ResumeRow[] = [
      { id: 'r1' as RowId, kind: 'header.name', content: { text: 'Test User' } },
      { id: 'r2' as RowId, kind: 'header.contact', content: { type: 'text', value: 'foo@bar.com' } },
      { id: 'r3' as RowId, kind: 'section.heading', content: { text: 'Experience' }, semanticGroupId: 'g1' as GroupId },
      { id: 'r4' as RowId, kind: 'entry.title', content: { text: 'Senior PM' }, semanticGroupId: 'g2' as GroupId },
      { id: 'r5' as RowId, kind: 'entry.meta', content: { text: '2022-Present' }, semanticGroupId: 'g2' as GroupId },
      {
        id: 'r6' as RowId,
        kind: 'bullet',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Did things' }] }] },
        semanticGroupId: 'g2' as GroupId,
      },
      {
        id: 'r7' as RowId,
        kind: 'plain',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A note' }] }] },
      },
    ];
    const docJSON = buildContent(schema, fixtureRows);
    expect(docJSON.type).toBe('doc');
    expect(() => schema.nodeFromJSON(docJSON)).not.toThrow();
    const node = schema.nodeFromJSON(docJSON);
    expect(node.childCount).toBe(7);
  });
});
