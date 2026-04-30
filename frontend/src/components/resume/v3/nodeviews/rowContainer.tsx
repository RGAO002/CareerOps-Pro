'use client';
import * as React from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';

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

  return (
    <NodeViewWrapper
      className={`row row-${kindClass}`}
      data-row-kind={kindDataAttr}
      data-row-id={rowId}
      data-group-id={groupId}
    >
      <span
        className="row-handle"
        contentEditable={false}
        data-edit-only=""
        aria-hidden="true"
      />
      {prefix}
      <NodeViewContent as="div" className="row-content" />
      {suffix}
    </NodeViewWrapper>
  );
}
