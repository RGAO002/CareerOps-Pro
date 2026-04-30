'use client';
import * as React from 'react';
import type { NodeViewProps } from '@tiptap/react';
import { RowContainer } from './rowContainer';

export function SectionHeadingNodeView(props: NodeViewProps) {
  return (
    <RowContainer
      {...props}
      kindClass="section-heading"
      kindDataAttr="section.heading"
      suffix={<hr className="section-divider" contentEditable={false} />}
    />
  );
}
