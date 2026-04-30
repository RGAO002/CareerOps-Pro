'use client';
import * as React from 'react';
import type { NodeViewProps } from '@tiptap/react';
import { RowContainer } from './rowContainer';

export function EntryTitleNodeView(props: NodeViewProps) {
  return <RowContainer {...props} kindClass="entry-title" kindDataAttr="entry.title" />;
}
