// frontend/src/components/resume/v2/extensions/AtomKeyboardNav.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import Text from '@tiptap/extension-text';
import Paragraph from '@tiptap/extension-paragraph';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import { BulletDocument } from './BulletDocument';
import { AtomKeyboardNav } from './AtomKeyboardNav';
import { useResumeStore } from '../store/useResumeStore';
import { _resetTransactionCounter } from '../store/source-of-truth';
import type { ProseMirrorBulletDoc, ResumeDoc } from '../types';

// ─── mocks (hoisted so vi.mock factories can read them) ──────────────────
const {
  focusFieldWhenReady, focusFieldEnd, focusNext, focusPrevious,
  setOrder, register, unregister, insertBulletMock, deleteBulletMock,
  setBulletKindMock,
} = vi.hoisted(() => ({
  focusFieldWhenReady: vi.fn(),
  focusFieldEnd: vi.fn().mockReturnValue(true),
  focusNext: vi.fn(),
  focusPrevious: vi.fn(),
  setOrder: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  insertBulletMock: vi.fn().mockReturnValue('NEW_BULLET_ID'),
  deleteBulletMock: vi.fn(),
  setBulletKindMock: vi.fn(),
}));

vi.mock('../interaction/AtomFocusManager', () => ({
  atomFocusManager: {
    register,
    unregister,
    setOrder,
    focusNext,
    focusPrevious,
    focusFieldWhenReady,
    focusFieldEnd,
  },
}));

vi.mock('../store/actions/insertBlock', () => ({
  insertBullet: (...args: unknown[]) => insertBulletMock(...args),
}));
vi.mock('../store/actions/deleteBlock', () => ({
  deleteBullet: (...args: unknown[]) => deleteBulletMock(...args),
}));
vi.mock('../store/actions/setBulletKind', () => ({
  setBulletKind: (...args: unknown[]) => setBulletKindMock(...args),
}));

// ─── helpers ──────────────────────────────────────────────────────────────
const makeContent = (text: string): ProseMirrorBulletDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined }],
});

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
  header: { id: 'h', name: '', contact_lines: [] },
  sections: [{ id: 's', role: 'experience', heading: 'Exp', entries: [
    { id: 'e1', title: '', meta: '', bullets: [
      { id: 'b1', content: makeContent('hello world') },
      { id: 'b2', content: makeContent('') },
    ]},
  ]}],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

function makeBulletEditor(bulletId: string, entryId: string, content: ProseMirrorBulletDoc): Editor {
  return new Editor({
    extensions: [
      BulletDocument,
      Paragraph,
      Text,
      Bold,
      Italic,
      AtomKeyboardNav.configure({
        bulletId,
        entryId,
        field: { kind: 'bullet.content', id: bulletId },
      }),
    ],
    content,
  });
}

function fireKey(editor: Editor, key: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const view = (editor as any).view;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handled = view.someProp('handleKeyDown', (f: any) =>
    f(view, new KeyboardEvent('keydown', { key })),
  );
  return Boolean(handled);
}

beforeEach(() => {
  useResumeStore.setState({ resume: structuredClone(RESUME), bulletMeta: {} });
  _resetTransactionCounter();
  insertBulletMock.mockClear();
  insertBulletMock.mockReturnValue('NEW_BULLET_ID');
  deleteBulletMock.mockClear();
  setBulletKindMock.mockClear();
  focusFieldWhenReady.mockClear();
  focusFieldEnd.mockClear();
  focusFieldEnd.mockReturnValue(true);
  focusNext.mockClear();
  focusPrevious.mockClear();
});

// ─── Enter ────────────────────────────────────────────────────────────────
describe('AtomKeyboardNav — Enter (Notion-style split)', () => {
  it('Enter in middle of text splits bullet: prefix stays, suffix moves to new bullet, focus jumps to new', () => {
    const editor = makeBulletEditor('b1', 'e1', makeContent('hello world'));
    // place cursor between "hello" and " world" → pos = 1 + len("hello") = 6
    editor.commands.focus();
    editor.commands.setTextSelection(6);

    expect(fireKey(editor, 'Enter')).toBe(true);

    // Current bullet should now contain ONLY the prefix "hello"
    const json = editor.getJSON();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstInline = (json as any).content?.[0]?.content?.[0];
    expect(firstInline).toMatchObject({ type: 'text', text: 'hello' });

    // insertBullet should have been called with the suffix doc, at idx+1=1
    expect(insertBulletMock).toHaveBeenCalledTimes(1);
    const call = insertBulletMock.mock.calls[0] as unknown as [string, number, ProseMirrorBulletDoc, unknown];
    expect(call[0]).toBe('e1');
    expect(call[1]).toBe(1);
    const para = call[2].content?.[0];
    const inline = para?.content?.[0];
    expect(inline).toMatchObject({ type: 'text', text: ' world' });

    // Focus should be requested for the new bullet ID via focusFieldWhenReady
    expect(focusFieldWhenReady).toHaveBeenCalledWith({
      kind: 'bullet.content',
      id: 'NEW_BULLET_ID',
    });

    editor.destroy();
  });

  it('Enter at end of bullet leaves current unchanged and inserts empty new bullet after', () => {
    const editor = makeBulletEditor('b1', 'e1', makeContent('done'));
    editor.commands.focus();
    const docSize = editor.state.doc.content.size;
    editor.commands.setTextSelection(docSize);

    expect(fireKey(editor, 'Enter')).toBe(true);

    // Current content unchanged
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inline = (editor.getJSON() as any).content?.[0]?.content?.[0];
    expect(inline).toMatchObject({ type: 'text', text: 'done' });

    expect(insertBulletMock).toHaveBeenCalledTimes(1);
    const call = insertBulletMock.mock.calls[0] as unknown as [string, number, ProseMirrorBulletDoc, unknown];
    const para = call[2].content?.[0];
    expect(para?.content ?? []).toEqual([]);

    expect(focusFieldWhenReady).toHaveBeenCalledWith({
      kind: 'bullet.content',
      id: 'NEW_BULLET_ID',
    });
    editor.destroy();
  });

  it('Enter on empty bullet inserts new empty bullet after and focuses it', () => {
    const editor = makeBulletEditor('b2', 'e1', makeContent(''));
    editor.commands.focus();

    expect(fireKey(editor, 'Enter')).toBe(true);

    expect(insertBulletMock).toHaveBeenCalledTimes(1);
    const call = insertBulletMock.mock.calls[0] as unknown as [string, number, ProseMirrorBulletDoc, unknown];
    expect(call[0]).toBe('e1');
    // b2 is at idx 1, new bullet inserted at idx 2
    expect(call[1]).toBe(2);
    const para = call[2].content?.[0];
    expect(para?.content ?? []).toEqual([]);
    expect(focusFieldWhenReady).toHaveBeenCalledWith({
      kind: 'bullet.content',
      id: 'NEW_BULLET_ID',
    });
    editor.destroy();
  });
});

// ─── Backspace ────────────────────────────────────────────────────────────
describe('AtomKeyboardNav — Backspace (single-step delete)', () => {
  it('Backspace at start of empty bullet (any kind) deletes it and focuses END of previous field', () => {
    // b2 in the default RESUME is an empty bullet with kind absent (treated as 'bullet').
    // No setBulletKind setup needed — single-step delete fires regardless of kind.
    const editor = makeBulletEditor('b2', 'e1', makeContent(''));
    editor.commands.focus();

    expect(fireKey(editor, 'Backspace')).toBe(true);

    expect(setBulletKindMock).not.toHaveBeenCalled();
    expect(deleteBulletMock).toHaveBeenCalledTimes(1);
    const delCall = deleteBulletMock.mock.calls[0] as unknown as [string, unknown];
    expect(delCall[0]).toBe('b2');
    expect(focusFieldEnd).toHaveBeenCalled();
    const focusCall = focusFieldEnd.mock.calls[0] as unknown as [{ kind: string; id: string }];
    expect(focusCall[0].kind).toBe('bullet.content');
    expect(focusCall[0].id).toBe('b1');
    expect(focusPrevious).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('Backspace at start of empty bullet ALWAYS deletes (single-step, no outdent)', () => {
    // Entry has [b1(text), b2(empty)]. Pressing Backspace in b2 must call
    // deleteBullet exactly once and must NEVER call setBulletKind — the
    // two-step outdent → delete path is gone.
    const editor = makeBulletEditor('b2', 'e1', makeContent(''));
    editor.commands.focus();

    expect(fireKey(editor, 'Backspace')).toBe(true);

    expect(deleteBulletMock).toHaveBeenCalledTimes(1);
    expect(deleteBulletMock.mock.calls[0][0]).toBe('b2');
    // Critical assertion: no auto-conversion to 'plain'.
    expect(setBulletKindMock).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('Backspace at start of non-empty BULLET outdents to plain (preserves content) and returns true', () => {
    // b1 has no kind set → defaults to 'bullet'. Pressing Backspace at start
    // with content present must call setBulletKind('plain') and NOT delete.
    const editor = makeBulletEditor('b1', 'e1', makeContent('hello'));
    editor.commands.focus();
    editor.commands.setTextSelection(1); // start of paragraph

    expect(fireKey(editor, 'Backspace')).toBe(true);

    expect(setBulletKindMock).toHaveBeenCalledTimes(1);
    const skCall = setBulletKindMock.mock.calls[0] as unknown as [string, string, unknown];
    expect(skCall[0]).toBe('b1');
    expect(skCall[1]).toBe('plain');
    expect(deleteBulletMock).not.toHaveBeenCalled();
    expect(focusFieldEnd).not.toHaveBeenCalled();
    expect(focusPrevious).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('Backspace at start of EMPTY plain row deletes it and focuses end of previous field', () => {
    // Mark b2 as kind='plain' and keep its content empty.
    const r = useResumeStore.getState().resume!;
    useResumeStore.setState({
      resume: {
        ...r,
        sections: r.sections.map(s => ({
          ...s,
          entries: s.entries.map(e => ({
            ...e,
            bullets: e.bullets.map(b =>
              b.id === 'b2' ? { ...b, kind: 'plain' as const } : b),
          })),
        })),
      },
    });

    const editor = makeBulletEditor('b2', 'e1', makeContent(''));
    editor.commands.focus();

    expect(fireKey(editor, 'Backspace')).toBe(true);

    expect(setBulletKindMock).not.toHaveBeenCalled();
    expect(deleteBulletMock).toHaveBeenCalledTimes(1);
    expect(deleteBulletMock.mock.calls[0][0]).toBe('b2');
    expect(focusFieldEnd).toHaveBeenCalled();
    const focusCall = focusFieldEnd.mock.calls[0] as unknown as [{ kind: string; id: string }];
    expect(focusCall[0].kind).toBe('bullet.content');
    expect(focusCall[0].id).toBe('b1');
    editor.destroy();
  });

  it('Backspace at start of NON-empty plain row returns false (no setBulletKind, no delete)', () => {
    // Mark b1 as kind='plain' with content. Backspace must be a no-op.
    const r = useResumeStore.getState().resume!;
    useResumeStore.setState({
      resume: {
        ...r,
        sections: r.sections.map(s => ({
          ...s,
          entries: s.entries.map(e => ({
            ...e,
            bullets: e.bullets.map(b =>
              b.id === 'b1' ? { ...b, kind: 'plain' as const } : b),
          })),
        })),
      },
    });

    const editor = makeBulletEditor('b1', 'e1', makeContent('hello'));
    editor.commands.focus();
    editor.commands.setTextSelection(1); // start of paragraph

    expect(fireKey(editor, 'Backspace')).toBe(false);
    expect(setBulletKindMock).not.toHaveBeenCalled();
    expect(deleteBulletMock).not.toHaveBeenCalled();
    expect(focusFieldEnd).not.toHaveBeenCalled();
    expect(focusPrevious).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('Backspace mid-text returns false (no delete, no focus shift, no kind flip)', () => {
    const editor = makeBulletEditor('b1', 'e1', makeContent('hello'));
    editor.commands.focus();
    editor.commands.setTextSelection(3); // middle of "hello"

    fireKey(editor, 'Backspace');
    expect(setBulletKindMock).not.toHaveBeenCalled();
    expect(deleteBulletMock).not.toHaveBeenCalled();
    expect(focusFieldEnd).not.toHaveBeenCalled();
    expect(focusPrevious).not.toHaveBeenCalled();
    editor.destroy();
  });
});

// ─── Enter inherits kind ──────────────────────────────────────────────────
describe('AtomKeyboardNav — Enter inherits current bullet kind', () => {
  it('Enter on bullet-kind row inserts a new bullet-kind row', () => {
    // b1 has no kind set → defaults to 'bullet'
    const editor = makeBulletEditor('b1', 'e1', makeContent('done'));
    editor.commands.focus();
    const docSize = editor.state.doc.content.size;
    editor.commands.setTextSelection(docSize);

    expect(fireKey(editor, 'Enter')).toBe(true);

    expect(insertBulletMock).toHaveBeenCalledTimes(1);
    // 5th arg is the kind
    const call = insertBulletMock.mock.calls[0] as unknown as [string, number, unknown, unknown, string];
    expect(call[4]).toBe('bullet');
    editor.destroy();
  });

  it('Enter on plain-kind row inserts a new plain-kind row', () => {
    // Mark b1 as kind='plain'
    const r = useResumeStore.getState().resume!;
    useResumeStore.setState({
      resume: {
        ...r,
        sections: r.sections.map(s => ({
          ...s,
          entries: s.entries.map(e => ({
            ...e,
            bullets: e.bullets.map(b =>
              b.id === 'b1' ? { ...b, kind: 'plain' as const } : b),
          })),
        })),
      },
    });

    const editor = makeBulletEditor('b1', 'e1', makeContent('done'));
    editor.commands.focus();
    const docSize = editor.state.doc.content.size;
    editor.commands.setTextSelection(docSize);

    expect(fireKey(editor, 'Enter')).toBe(true);

    expect(insertBulletMock).toHaveBeenCalledTimes(1);
    const call = insertBulletMock.mock.calls[0] as unknown as [string, number, unknown, unknown, string];
    expect(call[4]).toBe('plain');
    editor.destroy();
  });
});
