import { describe, it, expect } from 'vitest';
import { isEditorRoot } from './keyboard-router';

describe('keyboard router', () => {
  it('isEditorRoot true when ancestor has edit mode', () => {
    const root = document.createElement('div');
    root.setAttribute('data-canvas-root', '');
    root.setAttribute('data-mode', 'edit');
    const child = document.createElement('input');
    root.appendChild(child);
    document.body.appendChild(root);
    expect(isEditorRoot(child)).toBe(true);
    document.body.removeChild(root);
  });
  it('isEditorRoot false when ancestor has export mode', () => {
    const root = document.createElement('div');
    root.setAttribute('data-canvas-root', '');
    root.setAttribute('data-mode', 'export');
    const child = document.createElement('input');
    root.appendChild(child);
    document.body.appendChild(root);
    expect(isEditorRoot(child)).toBe(false);
    document.body.removeChild(root);
  });
});
