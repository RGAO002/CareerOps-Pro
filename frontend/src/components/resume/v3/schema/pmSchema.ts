import type * as React from 'react';
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import type { Schema } from '@tiptap/pm/model';
import type { ResumeRow } from './types';
import { rowToPMNodeJSON } from './hydrate';
import { HeaderNameNodeView } from '../nodeviews/HeaderNameNodeView';
import { HeaderContactNodeView } from '../nodeviews/HeaderContactNodeView';
import { SectionHeadingNodeView } from '../nodeviews/SectionHeadingNodeView';
import { EntryTitleNodeView } from '../nodeviews/EntryTitleNodeView';
import { EntryMetaNodeView } from '../nodeviews/EntryMetaNodeView';
import { PlainNodeView } from '../nodeviews/PlainNodeView';
import { BulletNodeView } from '../nodeviews/BulletNodeView';

type RowKindUnderscore =
  | 'header_name'
  | 'header_contact'
  | 'section_heading'
  | 'entry_title'
  | 'entry_meta'
  | 'plain'
  | 'bullet';

// Map PM node name → React NodeView component (T19).
// Tightened to Record<RowKindUnderscore, ...> so TS enforces exhaustiveness;
// removes the dead-code guard branch and the `as unknown as` casts.
const NODE_VIEW_BY_NAME: Record<RowKindUnderscore, React.ComponentType<NodeViewProps>> = {
  header_name: HeaderNameNodeView,
  header_contact: HeaderContactNodeView,
  section_heading: SectionHeadingNodeView,
  entry_title: EntryTitleNodeView,
  entry_meta: EntryMetaNodeView,
  plain: PlainNodeView,
  bullet: BulletNodeView,
};

// Production PM Node extensions for the 7 v3 row kinds.
// Spec ref: docs/superpowers/specs/2026-04-29-resume-editor-v3-design.md § 3.1.
//
// Naming: PM node names are kind-with-underscore (e.g. 'header.name' → 'header_name').
// Every row node has:
//   - group: 'row'
//   - id attr (default '')
//   - parseHTML: div[data-row-kind="<kind>"]
//   - renderHTML: ['div', { 'data-row-kind', 'data-row-id', 'data-group-id' }, 0]
//
// NodeViews and keymaps are NOT wired here (T19/T21).

interface MakeRowOpts {
  name: RowKindUnderscore;
  kindDataAttr: string; // value for data-row-kind
  content: 'text*' | 'inline*';
  allowMarks: boolean;
  defining?: boolean;
  withSemanticGroupId: boolean;
}

const ALIGN_VALUES = new Set(['left', 'center', 'right']);
function normalizeAlign(v: unknown): 'left' | 'center' | 'right' | null {
  if (typeof v !== 'string') return null;
  return ALIGN_VALUES.has(v) ? (v as 'left' | 'center' | 'right') : null;
}

function makeRowNode(opts: MakeRowOpts) {
  const { name, kindDataAttr, content, allowMarks, defining, withSemanticGroupId } = opts;

  return Node.create({
    name,
    group: 'row',
    content,
    defining: defining ?? false,
    // marks: '' disallows all marks; undefined inherits default (all allowed).
    marks: allowMarks ? undefined : '',

    addAttributes() {
      const attrs: Record<string, { default: unknown; parseHTML?: (el: HTMLElement) => unknown; renderHTML?: (attrs: Record<string, unknown>) => Record<string, string> | null }> = {
        id: { default: '' },
        // align — per-row text alignment, round-trips to v2's alignments map.
        align: {
          default: null,
          parseHTML: (el) => normalizeAlign(el.getAttribute('data-align')),
          renderHTML: (a) => {
            const align = normalizeAlign(a.align);
            return align ? { 'data-align': align, style: `text-align: ${align}` } : null;
          },
        },
      };
      if (withSemanticGroupId) {
        attrs.semanticGroupId = { default: null };
      }
      return attrs;
    },

    parseHTML() {
      return [{ tag: `div[data-row-kind="${kindDataAttr}"]` }];
    },

    renderHTML({ node }) {
      const gid = (node.attrs.semanticGroupId as string | null) ?? '';
      const align = normalizeAlign(node.attrs.align);
      const dom: Record<string, string> = {
        'data-row-kind': kindDataAttr,
        'data-row-id': node.attrs.id,
        'data-group-id': gid,
      };
      if (align) {
        dom['data-align'] = align;
        dom.style = `text-align: ${align}`;
      }
      return ['div', dom, 0];
    },

    // T19: wire React NodeView. Each PM node renders through ReactNodeViewRenderer,
    // which wraps the row in a <div class="react-renderer">. F1 wrapper-selector
    // contract: consumers walking view.dom must use ':scope > div > .row'.
    addNodeView() {
      return ReactNodeViewRenderer(NODE_VIEW_BY_NAME[name] as React.ComponentType<any>);
    },
  });
}

export const HeaderNameRow = makeRowNode({
  name: 'header_name',
  kindDataAttr: 'header.name',
  content: 'text*',
  allowMarks: false,
  defining: true,
  withSemanticGroupId: false,
});

export const HeaderContactRow = makeRowNode({
  name: 'header_contact',
  kindDataAttr: 'header.contact',
  content: 'inline*',
  allowMarks: true,
  withSemanticGroupId: false,
});

export const SectionHeadingRow = makeRowNode({
  name: 'section_heading',
  kindDataAttr: 'section.heading',
  content: 'text*',
  allowMarks: false,
  defining: true,
  withSemanticGroupId: true,
});

export const EntryTitleRow = makeRowNode({
  name: 'entry_title',
  kindDataAttr: 'entry.title',
  content: 'inline*',
  allowMarks: true,
  withSemanticGroupId: true,
});

export const EntryMetaRow = makeRowNode({
  name: 'entry_meta',
  kindDataAttr: 'entry.meta',
  content: 'inline*',
  allowMarks: true,
  withSemanticGroupId: true,
});

export const PlainRow = makeRowNode({
  name: 'plain',
  kindDataAttr: 'plain',
  content: 'inline*',
  allowMarks: true,
  withSemanticGroupId: true,
});

export const BulletRow = makeRowNode({
  name: 'bullet',
  kindDataAttr: 'bullet',
  content: 'inline*',
  allowMarks: true,
  withSemanticGroupId: true,
});

export const v3RowExtensions = [
  HeaderNameRow,
  HeaderContactRow,
  SectionHeadingRow,
  EntryTitleRow,
  EntryMetaRow,
  PlainRow,
  BulletRow,
];

// buildContent — converts a list of v3 ResumeRow objects into a doc-shaped PM JSON
// suitable for `schema.nodeFromJSON(...)`. Reuses rowToPMNodeJSON from hydrate.ts (M2)
// so the row→PM JSON adapter logic is not duplicated.
export function buildContent(schema: Schema, rows: ResumeRow[]) {
  return {
    type: 'doc',
    content: rows.map((r) => rowToPMNodeJSON(r, schema)),
  };
}
