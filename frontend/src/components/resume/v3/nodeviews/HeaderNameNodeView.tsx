'use client';
import * as React from 'react';
import type { NodeViewProps } from '@tiptap/react';
import { RowContainer } from './rowContainer';

export function HeaderNameNodeView(props: NodeViewProps) {
  return <RowContainer {...props} kindClass="header-name" kindDataAttr="header.name" />;
}
