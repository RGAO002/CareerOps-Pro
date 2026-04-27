// frontend/src/components/resume/v2/extensions/SingleLineKeyboardNav.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import Text from '@tiptap/extension-text';
import Paragraph from '@tiptap/extension-paragraph';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import { SingleLineDocument } from './SingleLineDocument';
import { SingleLineKeyboardNav } from './SingleLineKeyboardNav';
import { useResumeStore } from '../store/useResumeStore';
import { _resetTransactionCounter } from '../store/source-of-truth';
import type { EditableField, ResumeDoc, SingleLineDoc } from '../types';

// ─── mocks (hoisted so vi.mock factories can read them) ──────────────────
const {
  focusFieldWhenReady, focusFieldEnd, focusNext, focusPrevious,
  setOrder, register, unregister,
  insertBulletMock, insertEntryMock, insertContactLineMock,
  deleteSectionMock, deleteContactLineMock,
  setEntryHiddenFieldMock,
  forceShowMetaMock, unforceShowMetaMock,
  forceShowTitleMock, unforceShowTitleMock,
} = vi.hoisted(() => ({
  focusFieldWhenReady: vi.fn(),
  focusFieldEnd: vi.fn().mockReturnValue(true),
  focusNext: vi.fn(),
  focusPrevious: vi.fn(),
  setOrder: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  insertBulletMock: vi.fn().mockReturnValue('NEW_BULLET_ID'),
  insertEntryMock: vi.fn().mockReturnValue({
    entryId: 'NEW_ENTRY_ID', firstBulletId: 'NEW_FIRST_BULLET_ID',
  }),
  insertContactLineMock: vi.fn().mockReturnValue(0),
  deleteSectionMock: vi.fn(),
  deleteContactLineMock: vi.fn(),
  setEntryHiddenFieldMock: vi.fn(),
  forceShowMetaMock: vi.fn(),
  unforceShowMetaMock: vi.fn(),
  forceShowTitleMock: vi.fn(),
  unforceShowTitleMock: vi.fn(),
}));

vi.mock('../interaction/AtomFocusManager', () => ({
  atomFocusManager: {
    register, unregister, setOrder,
    focusNext, focusPrevious,
    focusFieldWhenReady, focusFieldEnd,
  },
}));

vi.mock('../interaction/meta-visibility', () => ({
  forceShowMeta: (...args: unknown[]) => forceShowMetaMock(...args),
  unforceShowMeta: (...args: unknown[]) => unforceShowMetaMock(...args),
  isMetaForced: () => false,
  subscribeMetaVisibility: () => () => {},
}));

vi.mock('../interaction/title-visibility', () => ({
  forceShowTitle: (...args: unknown[]) => forceShowTitleMock(...args),
  unforceShowTitle: (...args: unknown[]) => unforceShowTitleMock(...args),
  isTitleForced: () => false,
  subscribeTitleVisibility: () => () => {},
}));

vi.mock('../store/actions/insertBlock', () => ({
  insertBullet: (...args: unknown[]) => insertBulletMock(...args),
  insertEntry: (...args: unknown[]) => insertEntryMock(...args),
  insertContactLine: (...args: unknown[]) => insertContactLineMock(...args),
}));
vi.mock('../store/actions/deleteBlock', () => ({
  deleteSection: (...args: unknown[]) => deleteSectionMock(...args),
  deleteContactLine: (...args: unknown[]) => deleteContactLineMock(...args),
}));
vi.mock('../store/actions/setEntryHiddenField', () => ({
  setEntryHiddenField: (...args: unknown[]) => setEntryHiddenFieldMock(...args),
}));

// ─── helpers ──────────────────────────────────────────────────────────────
const makeDoc = (text: string): SingleLineDoc => ({
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: text ? [{ type: 'text', text }] : undefined,
  }],
});

function buildResume(opts: {
  contactLines?: Array<{ value: string }>;
  sections?: Array<{
    id: string; heading: string;
    entries: Array<{
      id: string; title: string; meta: string;
      bullets: Array<{ id: string; text: string }>;
    }>;
  }>;
}): ResumeDoc {
  return {
    schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
    header: {
      id: 'h', name: '',
      contact_lines: (opts.contactLines ?? []).map(c => ({ type: 'text' as const, value: c.value })),
    },
    sections: (opts.sections ?? []).map(s => ({
      id: s.id, role: 'experience' as const, heading: s.heading,
      entries: s.entries.map(e => ({
        id: e.id, title: e.title, meta: e.meta,
        bullets: e.bullets.map(b => ({
          id: b.id,
          content: { type: 'doc', content: [{
            type: 'paragraph',
            content: b.text ? [{ type: 'text', text: b.text }] : undefined,
          }] },
        })),
      })),
    })),
    metadata: {
      created_at: '', updated_at: '',
      target_company: null, target_role: null, parent_id: null,
    },
  };
}

function makeEditor(field: EditableField, content: SingleLineDoc): Editor {
  return new Editor({
    extensions: [
      SingleLineDocument,
      Paragraph,
      Text,
      Bold,
      Italic,
      SingleLineKeyboardNav.configure({ field }),
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
  insertBulletMock.mockClear();
  insertBulletMock.mockReturnValue('NEW_BULLET_ID');
  insertEntryMock.mockClear();
  insertEntryMock.mockReturnValue({
    entryId: 'NEW_ENTRY_ID', firstBulletId: 'NEW_FIRST_BULLET_ID',
  });
  insertContactLineMock.mockClear();
  insertContactLineMock.mockReturnValue(0);
  deleteSectionMock.mockClear();
  deleteContactLineMock.mockClear();
  setEntryHiddenFieldMock.mockClear();
  focusFieldWhenReady.mockClear();
  focusFieldEnd.mockClear();
  focusFieldEnd.mockReturnValue(true);
  focusNext.mockClear();
  focusPrevious.mockClear();
  forceShowMetaMock.mockClear();
  unforceShowMetaMock.mockClear();
  forceShowTitleMock.mockClear();
  unforceShowTitleMock.mockClear();
});

// ─── Enter ────────────────────────────────────────────────────────────────
describe('SingleLineKeyboardNav — Enter', () => {
  it('Enter on empty entry.title inserts bullet at start of entry and focuses it', () => {
    useResumeStore.setState({
      resume: buildResume({
        sections: [{ id: 's1', heading: 'Exp', entries: [
          { id: 'e1', title: '', meta: '', bullets: [{ id: 'b1', text: 'hi' }] },
        ]}],
      }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    const editor = makeEditor({ kind: 'entry.title', id: 'e1' }, makeDoc(''));

    expect(fireKey(editor, 'Enter')).toBe(true);

    expect(insertBulletMock).toHaveBeenCalledTimes(1);
    const call = insertBulletMock.mock.calls[0] as unknown as [string, number, unknown, unknown];
    expect(call[0]).toBe('e1');
    expect(call[1]).toBe(0);
    expect(focusFieldWhenReady).toHaveBeenCalledWith({
      kind: 'bullet.content', id: 'NEW_BULLET_ID',
    });
    editor.destroy();
  });

  it('Enter on non-empty entry.title still inserts a new bullet at start of the entry', () => {
    useResumeStore.setState({
      resume: buildResume({
        sections: [{ id: 's1', heading: 'Exp', entries: [
          { id: 'e1', title: 'Acme', meta: '', bullets: [] },
        ]}],
      }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    const editor = makeEditor({ kind: 'entry.title', id: 'e1' }, makeDoc('Acme'));

    expect(fireKey(editor, 'Enter')).toBe(true);
    expect(insertBulletMock).toHaveBeenCalledTimes(1);
    const call = insertBulletMock.mock.calls[0] as unknown as [string, number, unknown, unknown];
    expect(call[1]).toBe(0);
    editor.destroy();
  });

  it('Enter on entry.meta inserts a bullet at start of that entry', () => {
    useResumeStore.setState({
      resume: buildResume({
        sections: [{ id: 's1', heading: 'Exp', entries: [
          { id: 'e1', title: '', meta: '2020', bullets: [] },
        ]}],
      }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    const editor = makeEditor({ kind: 'entry.meta', id: 'e1' }, makeDoc('2020'));

    expect(fireKey(editor, 'Enter')).toBe(true);

    expect(insertBulletMock).toHaveBeenCalledTimes(1);
    const call = insertBulletMock.mock.calls[0] as unknown as [string, number, unknown, unknown];
    expect(call[0]).toBe('e1');
    expect(call[1]).toBe(0);
    expect(focusFieldWhenReady).toHaveBeenCalledWith({
      kind: 'bullet.content', id: 'NEW_BULLET_ID',
    });
    editor.destroy();
  });

  it('Enter on section.heading inserts a new entry with a bullet and focuses the bullet', () => {
    useResumeStore.setState({
      resume: buildResume({
        sections: [{ id: 's1', heading: 'Exp', entries: [] }],
      }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    const editor = makeEditor({ kind: 'section.heading', id: 's1' }, makeDoc('Exp'));

    expect(fireKey(editor, 'Enter')).toBe(true);

    expect(insertEntryMock).toHaveBeenCalledTimes(1);
    const call = insertEntryMock.mock.calls[0] as unknown as [string, number, unknown];
    expect(call[0]).toBe('s1');
    expect(call[1]).toBe(0);
    expect(focusFieldWhenReady).toHaveBeenCalledWith({
      kind: 'bullet.content', id: 'NEW_FIRST_BULLET_ID',
    });
    editor.destroy();
  });

  it('Enter on header.contact[i] inserts a new contact line at i+1 and focuses it', () => {
    useResumeStore.setState({
      resume: buildResume({
        contactLines: [{ value: 'a' }, { value: 'b' }],
      }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    insertContactLineMock.mockReturnValue(2);
    const editor = makeEditor({ kind: 'header.contact', index: 1 }, makeDoc('b'));

    expect(fireKey(editor, 'Enter')).toBe(true);
    expect(insertContactLineMock).toHaveBeenCalledTimes(1);
    const call = insertContactLineMock.mock.calls[0] as unknown as [number, unknown];
    expect(call[0]).toBe(2);
    expect(focusFieldWhenReady).toHaveBeenCalledWith({
      kind: 'header.contact', index: 2,
    });
    editor.destroy();
  });

  it('Enter on header.name (no contact lines) inserts a contact line at index 0', () => {
    useResumeStore.setState({
      resume: buildResume({ contactLines: [] }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    insertContactLineMock.mockReturnValue(0);
    const editor = makeEditor({ kind: 'header.name' }, makeDoc(''));

    expect(fireKey(editor, 'Enter')).toBe(true);
    expect(insertContactLineMock).toHaveBeenCalledTimes(1);
    const call = insertContactLineMock.mock.calls[0] as unknown as [number, unknown];
    expect(call[0]).toBe(0);
    expect(focusFieldWhenReady).toHaveBeenCalledWith({
      kind: 'header.contact', index: 0,
    });
    editor.destroy();
  });

  it('Enter on header.name (with existing contact lines) does NOT insert and focuses contact[0]', () => {
    useResumeStore.setState({
      resume: buildResume({ contactLines: [{ value: 'a' }] }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    const editor = makeEditor({ kind: 'header.name' }, makeDoc(''));

    expect(fireKey(editor, 'Enter')).toBe(true);
    expect(insertContactLineMock).not.toHaveBeenCalled();
    expect(focusFieldWhenReady).toHaveBeenCalledWith({
      kind: 'header.contact', index: 0,
    });
    editor.destroy();
  });
});

// ─── Backspace ────────────────────────────────────────────────────────────
describe('SingleLineKeyboardNav — Backspace', () => {
  it('Backspace on empty entry.title flags the title as user-hidden and focuses prev end', () => {
    // New UX: empty title + Backspace = user explicitly hides the row.
    // The entry itself stays — hide is reversible via Tab from the previous
    // field and persists across reload via EntryBlock.hiddenFields.
    useResumeStore.setState({
      resume: buildResume({
        sections: [{ id: 's1', heading: 'Exp', entries: [
          { id: 'e0', title: 'Prev', meta: '', bullets: [{ id: 'b0', text: 'something' }] },
          { id: 'e1', title: '', meta: '', bullets: [] },
        ]}],
      }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    const editor = makeEditor({ kind: 'entry.title', id: 'e1' }, makeDoc(''));

    expect(fireKey(editor, 'Backspace')).toBe(true);
    expect(setEntryHiddenFieldMock).toHaveBeenCalledTimes(1);
    const call = setEntryHiddenFieldMock.mock.calls[0] as unknown as [
      string, 'title' | 'meta', boolean, unknown,
    ];
    expect(call[0]).toBe('e1');
    expect(call[1]).toBe('title');
    expect(call[2]).toBe(true);
    // Previous = last bullet of previous entry
    expect(focusFieldEnd).toHaveBeenCalledWith({
      kind: 'bullet.content', id: 'b0',
    });
    editor.destroy();
  });

  it('Backspace on empty entry.title even when entry has bullets only HIDES (does not destroy bullets)', () => {
    // The entry's bullets are preserved — only the title row is hidden.
    useResumeStore.setState({
      resume: buildResume({
        sections: [{ id: 's1', heading: 'Exp', entries: [
          { id: 'e1', title: '', meta: '', bullets: [{ id: 'b1', text: 'still here' }] },
        ]}],
      }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    const editor = makeEditor({ kind: 'entry.title', id: 'e1' }, makeDoc(''));

    expect(fireKey(editor, 'Backspace')).toBe(true);
    expect(setEntryHiddenFieldMock).toHaveBeenCalledTimes(1);
    const call = setEntryHiddenFieldMock.mock.calls[0] as unknown as [
      string, 'title' | 'meta', boolean, unknown,
    ];
    expect(call[0]).toBe('e1');
    expect(call[1]).toBe('title');
    expect(call[2]).toBe(true);
    // Previous of entry.title (first entry of section) = section.heading
    expect(focusFieldEnd).toHaveBeenCalledWith({
      kind: 'section.heading', id: 's1',
    });
    editor.destroy();
  });

  it('Backspace on empty entry.meta flags meta as user-hidden and focuses entry.title', () => {
    useResumeStore.setState({
      resume: buildResume({
        sections: [{ id: 's1', heading: 'Exp', entries: [
          { id: 'e1', title: 'Acme', meta: '', bullets: [] },
        ]}],
      }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    const editor = makeEditor({ kind: 'entry.meta', id: 'e1' }, makeDoc(''));

    expect(fireKey(editor, 'Backspace')).toBe(true);
    expect(setEntryHiddenFieldMock).toHaveBeenCalledTimes(1);
    const call = setEntryHiddenFieldMock.mock.calls[0] as unknown as [
      string, 'title' | 'meta', boolean, unknown,
    ];
    expect(call[0]).toBe('e1');
    expect(call[1]).toBe('meta');
    expect(call[2]).toBe(true);
    expect(deleteSectionMock).not.toHaveBeenCalled();
    expect(focusFieldEnd).toHaveBeenCalledWith({
      kind: 'entry.title', id: 'e1',
    });
    editor.destroy();
  });

  it('Backspace on empty header.contact[i] (i>0) deletes the line and focuses contact[i-1] end', () => {
    useResumeStore.setState({
      resume: buildResume({
        contactLines: [{ value: 'a' }, { value: '' }],
      }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    const editor = makeEditor({ kind: 'header.contact', index: 1 }, makeDoc(''));

    expect(fireKey(editor, 'Backspace')).toBe(true);
    expect(deleteContactLineMock).toHaveBeenCalledTimes(1);
    const delCall = deleteContactLineMock.mock.calls[0] as unknown as [number, unknown];
    expect(delCall[0]).toBe(1);
    expect(focusFieldEnd).toHaveBeenCalledWith({
      kind: 'header.contact', index: 0,
    });
    editor.destroy();
  });

  it('Backspace on empty header.contact[0] deletes the line and focuses header.name end', () => {
    useResumeStore.setState({
      resume: buildResume({
        contactLines: [{ value: '' }],
      }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    const editor = makeEditor({ kind: 'header.contact', index: 0 }, makeDoc(''));

    expect(fireKey(editor, 'Backspace')).toBe(true);
    expect(deleteContactLineMock).toHaveBeenCalledTimes(1);
    const delCall = deleteContactLineMock.mock.calls[0] as unknown as [number, unknown];
    expect(delCall[0]).toBe(0);
    expect(focusFieldEnd).toHaveBeenCalledWith({ kind: 'header.name' });
    editor.destroy();
  });

  it('Backspace on empty section.heading (section empty) deletes the section and focuses prev end', () => {
    useResumeStore.setState({
      resume: buildResume({
        sections: [
          { id: 's0', heading: 'First', entries: [] },
          { id: 's1', heading: '', entries: [] },
        ],
      }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    const editor = makeEditor({ kind: 'section.heading', id: 's1' }, makeDoc(''));

    expect(fireKey(editor, 'Backspace')).toBe(true);
    expect(deleteSectionMock).toHaveBeenCalledTimes(1);
    const delCall = deleteSectionMock.mock.calls[0] as unknown as [string, unknown];
    expect(delCall[0]).toBe('s1');
    // Previous section had no entries → fall back to its own heading
    expect(focusFieldEnd).toHaveBeenCalledWith({
      kind: 'section.heading', id: 's0',
    });
    editor.destroy();
  });

  it('Backspace on empty section.heading (section has entries) is a no-op (no delete); just focuses prev end', () => {
    // Conservative rule: a section with entries holds real user content. We
    // refuse to nuke it on a single Backspace and only move focus instead.
    useResumeStore.setState({
      resume: buildResume({
        sections: [
          { id: 's0', heading: 'First', entries: [] },
          { id: 's1', heading: '', entries: [
            { id: 'e1', title: 'X', meta: '', bullets: [] },
          ] },
        ],
      }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    const editor = makeEditor({ kind: 'section.heading', id: 's1' }, makeDoc(''));

    expect(fireKey(editor, 'Backspace')).toBe(true);
    expect(deleteSectionMock).not.toHaveBeenCalled();
    // Previous section had no entries → fall back to its own heading
    expect(focusFieldEnd).toHaveBeenCalledWith({
      kind: 'section.heading', id: 's0',
    });
    editor.destroy();
  });

  it('Backspace on non-empty entry.title at start returns false (no delete, no focus shift)', () => {
    useResumeStore.setState({
      resume: buildResume({
        sections: [{ id: 's1', heading: 'Exp', entries: [
          { id: 'e1', title: 'Acme', meta: '', bullets: [] },
        ]}],
      }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    const editor = makeEditor({ kind: 'entry.title', id: 'e1' }, makeDoc('Acme'));
    editor.commands.focus();
    editor.commands.setTextSelection(1); // start of paragraph

    fireKey(editor, 'Backspace');
    expect(setEntryHiddenFieldMock).not.toHaveBeenCalled();
    expect(focusFieldEnd).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('Backspace mid-text returns false (no delete, no focus shift)', () => {
    useResumeStore.setState({
      resume: buildResume({
        sections: [{ id: 's1', heading: 'Exp', entries: [
          { id: 'e1', title: 'Acme', meta: '', bullets: [] },
        ]}],
      }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    const editor = makeEditor({ kind: 'entry.title', id: 'e1' }, makeDoc('Acme'));
    editor.commands.focus();
    editor.commands.setTextSelection(3); // middle

    fireKey(editor, 'Backspace');
    expect(setEntryHiddenFieldMock).not.toHaveBeenCalled();
    expect(focusFieldEnd).not.toHaveBeenCalled();
    editor.destroy();
  });
});

// ─── Tab ──────────────────────────────────────────────────────────────────
describe('SingleLineKeyboardNav — Tab', () => {
  it('Tab from entry.title calls forceShowMeta and focusFieldWhenReady on entry.meta', () => {
    useResumeStore.setState({
      resume: buildResume({
        sections: [{ id: 's1', heading: 'Exp', entries: [
          { id: 'e1', title: 'Acme', meta: '', bullets: [] },
        ]}],
      }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    const editor = makeEditor({ kind: 'entry.title', id: 'e1' }, makeDoc('Acme'));

    expect(fireKey(editor, 'Tab')).toBe(true);
    expect(forceShowMetaMock).toHaveBeenCalledTimes(1);
    expect(forceShowMetaMock).toHaveBeenCalledWith('e1');
    expect(focusFieldWhenReady).toHaveBeenCalledWith({
      kind: 'entry.meta', id: 'e1',
    });
    editor.destroy();
  });

  it('Tab from section.heading calls forceShowTitle on first entry and focusFieldWhenReady on entry.title', () => {
    useResumeStore.setState({
      resume: buildResume({
        sections: [{ id: 's1', heading: 'Exp', entries: [
          { id: 'e1', title: '', meta: '', bullets: [] },
          { id: 'e2', title: 'X', meta: '', bullets: [] },
        ]}],
      }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    const editor = makeEditor({ kind: 'section.heading', id: 's1' }, makeDoc('Exp'));

    expect(fireKey(editor, 'Tab')).toBe(true);
    expect(forceShowTitleMock).toHaveBeenCalledTimes(1);
    expect(forceShowTitleMock).toHaveBeenCalledWith('e1');
    expect(focusFieldWhenReady).toHaveBeenCalledWith({
      kind: 'entry.title', id: 'e1',
    });
    editor.destroy();
  });

  it('Tab from section.heading on a section with no entries returns false (does nothing)', () => {
    useResumeStore.setState({
      resume: buildResume({
        sections: [{ id: 's1', heading: 'Exp', entries: [] }],
      }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    const editor = makeEditor({ kind: 'section.heading', id: 's1' }, makeDoc('Exp'));

    expect(fireKey(editor, 'Tab')).toBe(false);
    expect(forceShowTitleMock).not.toHaveBeenCalled();
    expect(focusFieldWhenReady).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('Tab from entry.meta calls forceShowTitle on next entry and focusFieldWhenReady on next entry.title', () => {
    useResumeStore.setState({
      resume: buildResume({
        sections: [{ id: 's1', heading: 'Exp', entries: [
          { id: 'e1', title: 'A', meta: '', bullets: [] },
          { id: 'e2', title: '', meta: '', bullets: [] },
        ]}],
      }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    const editor = makeEditor({ kind: 'entry.meta', id: 'e1' }, makeDoc(''));

    expect(fireKey(editor, 'Tab')).toBe(true);
    expect(forceShowTitleMock).toHaveBeenCalledTimes(1);
    expect(forceShowTitleMock).toHaveBeenCalledWith('e2');
    expect(focusFieldWhenReady).toHaveBeenCalledWith({
      kind: 'entry.title', id: 'e2',
    });
    editor.destroy();
  });

  it('Tab from entry.meta with no following entry returns false', () => {
    useResumeStore.setState({
      resume: buildResume({
        sections: [{ id: 's1', heading: 'Exp', entries: [
          { id: 'e1', title: 'A', meta: '', bullets: [] },
        ]}],
      }),
      bulletMeta: {},
    });
    _resetTransactionCounter();
    const editor = makeEditor({ kind: 'entry.meta', id: 'e1' }, makeDoc(''));

    expect(fireKey(editor, 'Tab')).toBe(false);
    expect(forceShowTitleMock).not.toHaveBeenCalled();
    editor.destroy();
  });
});
