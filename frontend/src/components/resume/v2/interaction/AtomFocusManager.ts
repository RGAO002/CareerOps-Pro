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

export class AtomFocusManager {
  private editors = new Map<string, Editor>();
  private order: string[] = [];

  register(field: EditableField, editor: Editor): void {
    const k = fieldKey(field);
    this.editors.set(k, editor);
    if (!this.order.includes(k)) this.order.push(k);
  }

  unregister(field: EditableField): void {
    const k = fieldKey(field);
    this.editors.delete(k);
    this.order = this.order.filter(x => x !== k);
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
