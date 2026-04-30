'use client';
import * as React from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { groupsPluginKey } from '../plugins/GroupsPlugin';
import type { GroupId } from '../schema/types';

// Per-row-kind placeholder. Entry rows are role-aware via GroupsPlugin
// (e.g., Experience -> "Title @ Company", Skills -> "Skill category").
// Mirrors v2's placeholdersFor() in EntryAtomRenderer.tsx.
const PLACEHOLDER_BY_ROLE: Record<string, { title: string | null; meta: string | null }> = {
  summary:      { title: null, meta: null },
  skills:       { title: 'Skill category (e.g. Languages)', meta: null },
  experience:   { title: 'Title @ Company', meta: 'Date · Location' },
  projects:     { title: 'Project name', meta: 'Date · Tech / link' },
  education:    { title: 'Degree, Major', meta: 'School · Year' },
  awards:       { title: 'Award name', meta: 'Date · Issuer' },
  publications: { title: 'Publication title', meta: 'Venue · Year' },
  volunteer:    { title: 'Role @ Organization', meta: 'Date · Location' },
  custom:       { title: 'Title', meta: 'Subtitle' },
};

function resolvePlaceholder(props: NodeViewProps): string {
  const { editor, node } = props;
  const kind = node.type.name;
  if (kind === 'header_name')     return 'Your name';
  if (kind === 'header_contact')  return 'email | phone | location';
  if (kind === 'section_heading') return 'Section heading';
  if (kind === 'bullet')          return 'Empty bullet — type, or Backspace to remove';
  if (kind === 'plain')           return 'New line';
  if (kind === 'entry_title' || kind === 'entry_meta') {
    const gid = node.attrs.semanticGroupId as GroupId | null | undefined;
    let role = 'custom';
    try {
      const groups = editor && gid ? groupsPluginKey.getState(editor.state) : null;
      const entry = groups?.byId.get(gid as GroupId);
      if (entry?.kind === 'entry' && entry.parentSectionGroupId) {
        const section = groups?.byId.get(entry.parentSectionGroupId);
        if (section?.kind === 'section') role = section.role;
      }
    } catch {/* F4 orphan-tolerant */}
    const ph = PLACEHOLDER_BY_ROLE[role] ?? PLACEHOLDER_BY_ROLE.custom;
    return (kind === 'entry_title' ? ph.title : ph.meta) ?? '';
  }
  return '';
}

/**
 * Shared row container for v3 NodeViews.
 *
 * Emits the canonical row DOM:
 *   <div class="row row-<kindClass>" data-row-kind data-row-id [data-group-id]>
 *     <span class="row-handle" contenteditable="false" data-edit-only />
 *     {prefix?}                            // bullet marker etc.
 *     <div class="row-content">…inline editable content…</div>
 *     {suffix?}                            // section divider <hr>
 *   </div>
 *
 * F4 (orphan-tolerant): a missing/dangling `semanticGroupId` does NOT throw;
 * we just emit data-group-id="" and let downstream UI fall back to "ungrouped".
 *
 * NodeView code does NOT walk view.dom for rows — that's a consumer concern
 * (PaginationPlugin, smoke tests). The F1 wrapper-selector contract is pinned
 * by `__tests__/wrapperSelector.test.tsx`.
 */
export interface RowContainerProps extends NodeViewProps {
  /** CSS suffix for `.row-<kindClass>`, e.g. "header-name". */
  kindClass: string;
  /** value emitted on data-row-kind, e.g. "header.name". */
  kindDataAttr: string;
  /** Optional element rendered before .row-content (e.g. bullet marker). */
  prefix?: React.ReactNode;
  /** Optional element rendered after .row-content (e.g. section divider). */
  suffix?: React.ReactNode;
}

export function RowContainer(props: RowContainerProps) {
  const { node, kindClass, kindDataAttr, prefix, suffix } = props;
  const rowId = (node.attrs.id as string) || '';
  // F4: tolerate missing semanticGroupId.
  const groupId = (node.attrs.semanticGroupId as string | null | undefined) ?? '';
  const alignRaw = node.attrs.align as string | null | undefined;
  const align = (alignRaw === 'center' || alignRaw === 'right' || alignRaw === 'left') ? alignRaw : null;

  // Empty-row placeholder: a row counts as empty when its inline content is
  // empty (no text). Tiptap's Placeholder extension renders via PM
  // decorations onto the OUTER PM-controlled DOM, which doesn't reach the
  // React NodeViewWrapper's div — so we render the placeholder ourselves
  // via data-placeholder + .is-empty class on the wrapper. CSS in
  // EditorPageV3.css picks it up via .row.is-empty::after.
  const isEmpty = node.content.size === 0;
  const placeholder = isEmpty ? resolvePlaceholder(props) : '';

  return (
    <NodeViewWrapper
      className={`row row-${kindClass}${isEmpty && placeholder ? ' is-empty' : ''}`}
      data-row-kind={kindDataAttr}
      data-row-id={rowId}
      data-group-id={groupId}
      data-align={align ?? undefined}
      data-placeholder={isEmpty && placeholder ? placeholder : undefined}
    >
      <span
        className="row-handle"
        contentEditable={false}
        data-edit-only=""
        aria-hidden="true"
      >
        {/* 6-dot drag handle, design_handoff_ai_sidebar/.r-handle pattern:
         * 2 columns × 3 rows of 3px round dots in a CSS grid. */}
        <i /><i /><i /><i /><i /><i />
      </span>
      {prefix}
      <NodeViewContent
        as="div"
        className="row-content"
        style={align ? { textAlign: align } : undefined}
      />
      {suffix}
    </NodeViewWrapper>
  );
}
