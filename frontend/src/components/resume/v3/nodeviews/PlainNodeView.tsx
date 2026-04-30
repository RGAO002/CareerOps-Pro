'use client';
import * as React from 'react';
import type { NodeViewProps } from '@tiptap/react';
import { RowContainer } from './rowContainer';

export function PlainNodeView(props: NodeViewProps) {
  return <RowContainer {...props} kindClass="plain" kindDataAttr="plain" />;
}
