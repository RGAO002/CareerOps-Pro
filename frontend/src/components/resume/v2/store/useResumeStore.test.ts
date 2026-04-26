// frontend/src/components/resume/v2/store/useResumeStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useResumeStore, _pushUndo } from './useResumeStore';
import { makeOrigin, _resetTransactionCounter } from './source-of-truth';
import type { ResumeDoc, ProseMirrorBulletDoc } from '../types';

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: 't', template_id: 'minimal-single-column',
  header: { id: 'h', name: 'A', contact_lines: [] },
  sections: [{
    id: 's1', role: 'experience', heading: 'Experience', entries: [{
      id: 'e1', title: 'T', meta: 'M', bullets: [{
        id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'old' }] }] },
      }],
    }],
  }],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

beforeEach(() => {
  useResumeStore.setState({ resume: null, bulletMeta: {} });
  _resetTransactionCounter();
});

describe('useResumeStore', () => {
  it('hydrate sets resume', () => {
    useResumeStore.getState().hydrate(RESUME);
    expect(useResumeStore.getState().resume?.id).toBe('r');
  });

  it('updateBullet replaces bullet content + records origin', () => {
    useResumeStore.getState().hydrate(RESUME);
    const newContent: ProseMirrorBulletDoc = {
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'new' }] }],
    };
    useResumeStore.getState().updateBullet('b1', newContent, makeOrigin('tiptap', 'ed-1'));
    const r = useResumeStore.getState().resume!;
    const text = r.sections[0].entries[0].bullets[0].content.content[0].content?.[0];
    expect((text as any).text).toBe('new');
    expect(useResumeStore.getState().bulletMeta['b1'].origin.editorId).toBe('ed-1');
  });

  it('updateField updates entry.title', () => {
    useResumeStore.getState().hydrate(RESUME);
    useResumeStore.getState().updateField(
      { kind: 'entry.title', id: 'e1' },
      'NewTitle',
      makeOrigin('tiptap', 'ed-2'),
    );
    expect(useResumeStore.getState().resume?.sections[0].entries[0].title).toBe('NewTitle');
  });

  it('subscribeWithSelector fires only when selected slice changes', () => {
    useResumeStore.getState().hydrate(RESUME);
    let calls = 0;
    const unsub = useResumeStore.subscribe(s => s.bulletMeta['b1']?.version, () => { calls++; });
    useResumeStore.getState().updateBullet('b1',
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] },
      makeOrigin('tiptap', 'ed-A'),
    );
    expect(calls).toBe(1);
    // Updating an unrelated field should NOT fire bullet listener
    useResumeStore.getState().updateField({ kind: 'entry.title', id: 'e1' }, 'y', makeOrigin('tiptap', 'ed-B'));
    expect(calls).toBe(1);
    unsub();
  });

  it('undo restores previous resume snapshot', () => {
    useResumeStore.getState().hydrate(RESUME);
    _pushUndo('test');
    useResumeStore.getState().updateField({ kind: 'entry.title', id: 'e1' }, 'changed', makeOrigin('tiptap', 'ed-X'));
    expect(useResumeStore.getState().resume?.sections[0].entries[0].title).toBe('changed');
    useResumeStore.getState().undo();
    expect(useResumeStore.getState().resume?.sections[0].entries[0].title).toBe('T');
  });
});
