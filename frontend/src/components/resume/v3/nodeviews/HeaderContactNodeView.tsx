'use client';
import * as React from 'react';
import type { NodeViewProps } from '@tiptap/react';
import { RowContainer } from './rowContainer';

export function HeaderContactNodeView(props: NodeViewProps) {
  return <RowContainer {...props} kindClass="header-contact" kindDataAttr="header.contact" />;
}
