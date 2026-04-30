import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Document } from '@tiptap/extension-document';
import { Text } from '@tiptap/extension-text';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Link } from '@tiptap/extension-link';
import * as React from 'react';
import { act } from 'react';
import { v3RowExtensions } from '../../schema/pmSchema';

const TestDoc = Document.extend({
  content: '(header_name | header_contact | section_heading | entry_title | entry_meta | plain | bullet)+',
});

const extensions = [TestDoc, Text, Bold, Italic, Link, ...v3RowExtensions];

function makeContent(nodeType: string, text = 'hi', extraAttrs: Record<string, unknown> = {}) {
  return {
    type: 'doc',
    content: [
      {
        type: nodeType,
        attrs: { id: 'r1', ...extraAttrs },
        content: text ? [{ type: 'text', text }] : [],
      },
    ],
  };
}

function MountEditor({ nodeType, extraAttrs }: { nodeType: string; extraAttrs?: Record<string, unknown> }) {
  const editor = useEditor({
    extensions,
    content: makeContent(nodeType, 'hi', extraAttrs),
    immediatelyRender: false,
  });
  if (!editor) return null;
  return <EditorContent editor={editor} />;
}

async function flushFrames() {
  // happy-dom + tiptap useEditor renders asynchronously; flush a tick.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

afterEach(() => {
  cleanup();
});

describe('v3 NodeViews — per-kind render', () => {
  const cases: Array<{ nodeType: string; rowClass: string; extra?: Record<string, unknown> }> = [
    { nodeType: 'header_name', rowClass: 'row-header-name' },
    { nodeType: 'header_contact', rowClass: 'row-header-contact' },
    { nodeType: 'section_heading', rowClass: 'row-section-heading', extra: { semanticGroupId: 'g1' } },
    { nodeType: 'entry_title', rowClass: 'row-entry-title', extra: { semanticGroupId: 'g1' } },
    { nodeType: 'entry_meta', rowClass: 'row-entry-meta', extra: { semanticGroupId: 'g1' } },
    { nodeType: 'plain', rowClass: 'row-plain' },
    { nodeType: 'bullet', rowClass: 'row-bullet' },
  ];

  for (const { nodeType, rowClass, extra } of cases) {
    it(`renders ${nodeType} as .row.${rowClass} with handle, data-row-id, .row-content`, async () => {
      const { container } = render(<MountEditor nodeType={nodeType} extraAttrs={extra} />);
      await flushFrames();

      const rowEl = container.querySelector(`.row.${rowClass}`) as HTMLElement | null;
      expect(rowEl).toBeTruthy();
      expect(rowEl!.getAttribute('data-row-id')).toBe('r1');
      expect(rowEl!.querySelector('.row-handle')).toBeTruthy();
      expect(rowEl!.querySelector('.row-content')).toBeTruthy();
    });
  }

  it('bullet renders .row-marker with contenteditable=false and data-edit-only', async () => {
    const { container } = render(<MountEditor nodeType="bullet" />);
    await flushFrames();
    const marker = container.querySelector('.row.row-bullet .row-marker') as HTMLElement | null;
    expect(marker).toBeTruthy();
    expect(marker!.getAttribute('contenteditable')).toBe('false');
    expect(marker!.hasAttribute('data-edit-only')).toBe(true);
  });

  it('section_heading renders <hr.section-divider> with contenteditable=false (NOT data-edit-only — divider is part of resume visuals, must appear in PDF)', async () => {
    const { container } = render(
      <MountEditor nodeType="section_heading" extraAttrs={{ semanticGroupId: 'g1' }} />,
    );
    await flushFrames();
    const hr = container.querySelector('.row.row-section-heading hr.section-divider') as HTMLElement | null;
    expect(hr).toBeTruthy();
    expect(hr!.tagName.toLowerCase()).toBe('hr');
    expect(hr!.getAttribute('contenteditable')).toBe('false');
    expect(hr!.hasAttribute('data-edit-only')).toBe(false);
  });

  it('NodeView tolerates missing/dangling semanticGroupId (F4 orphan-tolerant)', async () => {
    // entry_title with no semanticGroupId provided should still render without throwing.
    const { container } = render(
      <MountEditor nodeType="entry_title" extraAttrs={{}} />,
    );
    await flushFrames();
    const rowEl = container.querySelector('.row.row-entry-title') as HTMLElement | null;
    expect(rowEl).toBeTruthy();
    // Should not crash; we accept whatever the NodeView emits for missing group.
  });
});
