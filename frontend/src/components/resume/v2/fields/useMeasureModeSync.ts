// frontend/src/components/resume/v2/fields/useMeasureModeSync.ts
import { useLayoutEffect } from 'react';
import type { Editor } from '@tiptap/core';
import type { CanvasMode } from '../types';

/**
 * For measure mode: sync prop value into editor before paint, so ResizeObserver
 * reads the new content's height on first measurement.
 *
 * Hard rule (§ 3.3 of spec): measure mode MUST use useLayoutEffect + setContent
 * with emitUpdate=false. Do not call this hook in edit/export mode (those
 * have different sync contracts).
 */
export function useMeasureModeSync<T>(
  mode: CanvasMode,
  editor: Editor | null,
  propValue: T,
  toDoc: (v: T) => any,
): void {
  useLayoutEffect(() => {
    if (mode !== 'measure' || !editor) return;
    editor.commands.setContent(toDoc(propValue), false);
  }, [mode, editor, propValue, toDoc]);
}
