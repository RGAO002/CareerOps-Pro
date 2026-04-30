'use client';
import * as React from 'react';
import type { NodeViewProps } from '@tiptap/react';
import { RowContainer } from './rowContainer';

export function EntryMetaNodeView(props: NodeViewProps) {
  return <RowContainer {...props} kindClass="entry-meta" kindDataAttr="entry.meta" />;
}
