// frontend/src/components/resume/v2/interaction/AtomFocusManager.ts
import type { Editor } from '@tiptap/core';
import type { EditableField } from '../types';

function fieldKey(f: EditableField): string {
  switch (f.kind) {
    case 'header.name': return 'header.name';
    case 'header.contact': return `header.contact:${f.index}`;
    case 'section.heading': return `section.heading:${f.id}`;
    case 'entry.title': return `entry.title:${f.id}`;
    case 'entry.meta': return `entry.meta:${f.id}`;
    case 'bullet.content': return `bullet.content:${f.id}`;
  }
}

type Listener = () => void;

export class AtomFocusManager {
  private editors = new Map<string, Editor>();
  private order: string[] = [];
  private listeners = new Set<Listener>();
  private boundHandlers = new WeakMap<Editor, { focus: () => void; blur: () => void; selUpdate: () => void }>();

  /** Subscribe to focus / selection changes across all registered editors.
   *  Listener fires whenever a TipTap editor gains/loses focus or its
   *  selection changes (so toolbars can reactively show active marks).
   *  Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  register(field: EditableField, editor: Editor): void {
    const k = fieldKey(field);
    this.editors.set(k, editor);
    if (!this.order.includes(k)) this.order.push(k);
    if (typeof editor.on === 'function' && !this.boundHandlers.has(editor)) {
      const focus = () => this.emit();
      const blur = () => this.emit();
      const selUpdate = () => this.emit();
      editor.on('focus', focus);
      editor.on('blur', blur);
      editor.on('selectionUpdate', selUpdate);
      editor.on('transaction', selUpdate);
      this.boundHandlers.set(editor, { focus, blur, selUpdate });
    }
    this.emit();
  }

  unregister(field: EditableField): void {
    const k = fieldKey(field);
    const ed = this.editors.get(k);
    this.editors.delete(k);
    this.order = this.order.filter(x => x !== k);
    if (ed && typeof ed.off === 'function') {
      const handlers = this.boundHandlers.get(ed);
      if (handlers) {
        ed.off('focus', handlers.focus);
        ed.off('blur', handlers.blur);
        ed.off('selectionUpdate', handlers.selUpdate);
        ed.off('transaction', handlers.selUpdate);
        this.boundHandlers.delete(ed);
      }
    }
    this.emit();
  }

  setOrder(fields: EditableField[]): void {
    this.order = fields.map(fieldKey);
  }

  currentEditor(): Editor | null {
    for (const ed of this.editors.values()) {
      if (ed.isFocused) return ed;
    }
    return null;
  }

  focusNext(field: EditableField): void {
    const k = fieldKey(field);
    const i = this.order.indexOf(k);
    if (i < 0 || i >= this.order.length - 1) return;
    const nextK = this.order[i + 1];
    this.editors.get(nextK)?.commands.focus();
  }

  focusPrevious(field: EditableField): void {
    const k = fieldKey(field);
    const i = this.order.indexOf(k);
    if (i <= 0) return;
    const prevK = this.order[i - 1];
    this.editors.get(prevK)?.commands.focus();
  }
}

export const atomFocusManager = new AtomFocusManager();
