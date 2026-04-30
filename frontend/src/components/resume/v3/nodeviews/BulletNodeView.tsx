'use client';
import * as React from 'react';
import type { NodeViewProps } from '@tiptap/react';
import { RowContainer } from './rowContainer';

export function BulletNodeView(props: NodeViewProps) {
  return (
    <RowContainer
      {...props}
      kindClass="bullet"
      kindDataAttr="bullet"
      prefix={
        <span className="row-marker" contentEditable={false} aria-hidden="true">
          {'•'}
        </span>
      }
    />
  );
}
