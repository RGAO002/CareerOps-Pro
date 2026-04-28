// frontend/src/components/resume/v2/store/actions/structural.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useResumeStore } from '../useResumeStore';
import { makeOrigin, _resetTransactionCounter } from '../source-of-truth';
import { moveSection } from './moveSection';
import { moveEntry } from './moveEntry';
import { moveBullet } from './moveBullet';
import {
  insertBullet, insertEntry, insertSection, insertContactLine,
} from './insertBlock';
import {
  deleteBullet, deleteEntry, deleteSection, deleteContactLine,
} from './deleteBlock';
import { duplicateBullet, duplicateEntry, duplicateSection } from './duplicateBlock';
import { setBulletKind } from './setBulletKind';
import { moveHeaderRow } from './moveHeaderRow';
import type { ResumeDoc } from '../../types';

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: 't', template_id: 'minimal-single-column',
  header: { id: 'h', name: 'A', contact_lines: [] },
  sections: [
    { id: 's1', role: 'experience', heading: 'Exp', entries: [
      { id: 'e1', title: 'E1', meta: 'M', bullets: [
        { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
      ] },
    ] },
    { id: 's2', role: 'skills', heading: 'Skills', entries: [] },
  ],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

beforeEach(() => {
  useResumeStore.setState({ resume: structuredClone(RESUME), bulletMeta: {} });
  _resetTransactionCounter();
});

describe('move actions', () => {
  it('moveSection reorders', () => {
    moveSection('s1', null, makeOrigin('drag-reorder'));
    const ids = useResumeStore.getState().resume!.sections.map(s => s.id);
    expect(ids).toEqual(['s2', 's1']);
  });
  it('moveEntry across sections', () => {
    moveEntry('e1', 's2', 0, makeOrigin('drag-reorder'));
    expect(useResumeStore.getState().resume!.sections[0].entries).toHaveLength(0);
    expect(useResumeStore.getState().resume!.sections[1].entries[0].id).toBe('e1');
  });
  it('moveEntry to an invalid blank target does not delete source content', () => {
    moveEntry('e1', 'missing-section', 0, makeOrigin('drag-reorder'));
    const resume = useResumeStore.getState().resume!;
    expect(resume.sections[0].entries.map(e => e.id)).toEqual(['e1']);
    expect(resume.sections[0].entries[0].title).toBe('E1');
  });
  it('moveBullet within entry preserves order semantics', () => {
    insertBullet('e1', 1, { type: 'doc', content: [{ type: 'paragraph' }] }, makeOrigin('paste'));
    const r = useResumeStore.getState().resume!;
    const newBulletId = r.sections[0].entries[0].bullets[1].id;
    moveBullet(newBulletId, 'e1', 0, makeOrigin('drag-reorder'));
    expect(useResumeStore.getState().resume!.sections[0].entries[0].bullets[0].id).toBe(newBulletId);
  });
  it('moveBullet into a valid blank entry preserves source content', () => {
    const { entryId: blankEntryId } = insertEntry('s2', 0, makeOrigin('paste'));
    moveBullet('b1', blankEntryId, 0, makeOrigin('drag-reorder'));
    const resume = useResumeStore.getState().resume!;
    const sourceEntry = resume.sections[0].entries[0];
    const targetEntry = resume.sections[1].entries.find(e => e.id === blankEntryId)!;
    expect(sourceEntry.bullets.map(b => b.id)).toEqual([]);
    expect(targetEntry.bullets[0].id).toBe('b1');
  });
  it('moveBullet to an invalid blank target does not delete source content', () => {
    moveBullet('b1', 'missing-entry', 0, makeOrigin('drag-reorder'));
    const resume = useResumeStore.getState().resume!;
    expect(resume.sections[0].entries[0].bullets.map(b => b.id)).toEqual(['b1']);
  });
});

describe('insert actions', () => {
  it('insertSection adds at end when beforeId=null', () => {
    insertSection('education', null, makeOrigin('tiptap'));
    expect(useResumeStore.getState().resume!.sections.map(s => s.role))
      .toEqual(['experience', 'skills', 'education']);
  });
  it('insertEntry assigns a new uuid and returns the first bullet id', () => {
    const { entryId, firstBulletId } = insertEntry('s1', 0, makeOrigin('tiptap'));
    expect(entryId).toBeTruthy();
    expect(firstBulletId).toBeTruthy();
    expect(useResumeStore.getState().resume!.sections[0].entries[0].id).toBe(entryId);
    expect(useResumeStore.getState().resume!.sections[0].entries[0].bullets[0].id).toBe(firstBulletId);
  });
  it('insertBullet at index', () => {
    insertBullet('e1', 0, { type: 'doc', content: [{ type: 'paragraph' }] }, makeOrigin('paste'));
    expect(useResumeStore.getState().resume!.sections[0].entries[0].bullets).toHaveLength(2);
  });

  it('insertBullet without kind defaults to bullet (kind field absent)', () => {
    insertBullet('e1', 0, { type: 'doc', content: [{ type: 'paragraph' }] }, makeOrigin('paste'));
    const newBullet = useResumeStore.getState().resume!.sections[0].entries[0].bullets[0];
    expect(newBullet.kind).toBeUndefined();
  });

  it('insertBullet with kind="plain" produces a plain bullet', () => {
    insertBullet('e1', 0, { type: 'doc', content: [{ type: 'paragraph' }] }, makeOrigin('paste'), 'plain');
    const newBullet = useResumeStore.getState().resume!.sections[0].entries[0].bullets[0];
    expect(newBullet.kind).toBe('plain');
  });

  it('insertBullet with kind="bullet" omits the kind field (back-compat default)', () => {
    insertBullet('e1', 0, { type: 'doc', content: [{ type: 'paragraph' }] }, makeOrigin('paste'), 'bullet');
    const newBullet = useResumeStore.getState().resume!.sections[0].entries[0].bullets[0];
    expect(newBullet.kind).toBeUndefined();
  });
});

describe('delete actions', () => {
  it('deleteSection removes by id', () => {
    deleteSection('s1', makeOrigin('tiptap'));
    expect(useResumeStore.getState().resume!.sections.map(s => s.id)).toEqual(['s2']);
  });
  it('deleteEntry removes by id', () => {
    deleteEntry('e1', makeOrigin('tiptap'));
    expect(useResumeStore.getState().resume!.sections[0].entries).toEqual([]);
  });
  it('deleteBullet removes by id', () => {
    deleteBullet('b1', makeOrigin('tiptap'));
    expect(useResumeStore.getState().resume!.sections[0].entries[0].bullets).toEqual([]);
  });
});

describe('contact_lines actions', () => {
  it('insertContactLine adds a blank text item at index, shifting following items', () => {
    useResumeStore.setState({
      resume: {
        ...structuredClone(RESUME),
        header: {
          id: 'h', name: 'A',
          contact_lines: [{ type: 'text', value: 'a' }, { type: 'text', value: 'b' }],
        },
      },
      bulletMeta: {},
    });
    const i = insertContactLine(1, makeOrigin('tiptap'));
    expect(i).toBe(1);
    const lines = useResumeStore.getState().resume!.header.contact_lines;
    expect(lines.map(l => (l.type === 'text' ? l.value : l.label)))
      .toEqual(['a', '', 'b']);
  });

  it('insertContactLine clamps the index when out of range', () => {
    const i = insertContactLine(99, makeOrigin('tiptap'));
    expect(i).toBe(0);
    expect(useResumeStore.getState().resume!.header.contact_lines).toHaveLength(1);
  });

  it('deleteContactLine removes the item at the given index', () => {
    useResumeStore.setState({
      resume: {
        ...structuredClone(RESUME),
        header: {
          id: 'h', name: 'A',
          contact_lines: [
            { type: 'text', value: 'a' },
            { type: 'text', value: 'b' },
            { type: 'text', value: 'c' },
          ],
        },
      },
      bulletMeta: {},
    });
    deleteContactLine(1, makeOrigin('tiptap'));
    const lines = useResumeStore.getState().resume!.header.contact_lines;
    expect(lines.map(l => (l.type === 'text' ? l.value : l.label)))
      .toEqual(['a', 'c']);
  });

  it('deleteContactLine no-ops on out-of-range index', () => {
    deleteContactLine(99, makeOrigin('tiptap'));
    // The default RESUME has zero contact lines.
    expect(useResumeStore.getState().resume!.header.contact_lines).toEqual([]);
  });

  it('deleteContactLine shifts header.contact alignment keys down', () => {
    useResumeStore.setState({
      resume: {
        ...structuredClone(RESUME),
        header: {
          id: 'h', name: 'A',
          contact_lines: [
            { type: 'text', value: 'a' },
            { type: 'text', value: 'b' },
            { type: 'text', value: 'c' },
          ],
        },
        alignments: {
          'header.contact:0': 'right',
          'header.contact:1': 'center',
          'header.contact:2': 'right',
          'header.name': 'center',
        },
      },
      bulletMeta: {},
    });
    deleteContactLine(1, makeOrigin('tiptap'));
    const a = useResumeStore.getState().resume!.alignments;
    expect(a).toEqual({
      'header.contact:0': 'right',
      'header.contact:1': 'right',
      'header.name': 'center',
    });
  });
});

describe('duplicate actions reassign all ids', () => {
  it('duplicateBullet new id, content equal', () => {
    const newId = duplicateBullet('b1', makeOrigin('tiptap'))!;
    expect(newId).not.toBe('b1');
    const bullets = useResumeStore.getState().resume!.sections[0].entries[0].bullets;
    expect(bullets).toHaveLength(2);
    expect(bullets[1].id).toBe(newId);
  });
  it('duplicateEntry recursively reassigns bullet ids', () => {
    const newEntryId = duplicateEntry('e1', makeOrigin('tiptap'))!;
    const entries = useResumeStore.getState().resume!.sections[0].entries;
    expect(entries).toHaveLength(2);
    expect(entries[1].id).toBe(newEntryId);
    expect(entries[1].bullets[0].id).not.toBe('b1');
  });
  it('duplicateSection recursively reassigns entry + bullet ids', () => {
    const newSectionId = duplicateSection('s1', makeOrigin('tiptap'))!;
    const sections = useResumeStore.getState().resume!.sections;
    expect(sections).toHaveLength(3);
    expect(sections[1].id).toBe(newSectionId);
    expect(sections[1].entries[0].id).not.toBe('e1');
    expect(sections[1].entries[0].bullets[0].id).not.toBe('b1');
  });
});

describe('setBulletKind', () => {
  it('flips an absent-kind bullet to plain (sets the kind field)', () => {
    setBulletKind('b1', 'plain', makeOrigin('tiptap'));
    const b = useResumeStore.getState().resume!.sections[0].entries[0].bullets[0];
    expect(b.kind).toBe('plain');
  });

  it('flips a plain bullet back to bullet (drops the kind field for clean JSON)', () => {
    setBulletKind('b1', 'plain', makeOrigin('tiptap'));
    setBulletKind('b1', 'bullet', makeOrigin('tiptap'));
    const b = useResumeStore.getState().resume!.sections[0].entries[0].bullets[0];
    expect(b.kind).toBeUndefined();
  });

  it('is undoable: undo restores the previous kind', () => {
    setBulletKind('b1', 'plain', makeOrigin('tiptap'));
    expect(useResumeStore.getState().resume!.sections[0].entries[0].bullets[0].kind).toBe('plain');
    useResumeStore.getState().undo();
    const b = useResumeStore.getState().resume!.sections[0].entries[0].bullets[0];
    expect(b.kind).toBeUndefined();
  });

  it.skip('__moveHeaderRow_block__', () => {});
});

describe('moveHeaderRow', () => {
  beforeEach(() => {
    useResumeStore.setState({
      resume: {
        ...structuredClone(RESUME),
        header: {
          id: 'h', name: 'A',
          contact_lines: [{ type: 'text', value: 'a' }],
        },
      },
      bulletMeta: {},
    });
  });

  it('moves name to after contact:0 (writes row_order)', () => {
    moveHeaderRow('name', 1, makeOrigin('drag-reorder'));
    const order = useResumeStore.getState().resume!.header.row_order;
    expect(order).toEqual(['contact:0', 'name']);
  });

  it('no-ops when the resulting order matches the current effective order', () => {
    const before = useResumeStore.getState().resume!;
    // 'name' is already at index 0 by default — moving to 0 is a no-op.
    moveHeaderRow('name', 0, makeOrigin('drag-reorder'));
    const after = useResumeStore.getState().resume!;
    expect(after).toBe(before);
  });

  it('is undoable: undo restores previous order', () => {
    moveHeaderRow('name', 1, makeOrigin('drag-reorder'));
    expect(useResumeStore.getState().resume!.header.row_order)
      .toEqual(['contact:0', 'name']);
    useResumeStore.getState().undo();
    expect(useResumeStore.getState().resume!.header.row_order).toBeUndefined();
  });

  it('clamps insertAtIndex past the end', () => {
    moveHeaderRow('name', 99, makeOrigin('drag-reorder'));
    expect(useResumeStore.getState().resume!.header.row_order)
      .toEqual(['contact:0', 'name']);
  });

  it('no-ops on unknown rowKey', () => {
    const before = useResumeStore.getState().resume!;
    moveHeaderRow('contact:99', 0, makeOrigin('drag-reorder'));
    const after = useResumeStore.getState().resume!;
    expect(after).toBe(before);
  });
});

describe('_setBulletKindNoOp', () => {
  it('no-ops when the bullet already has the requested kind', () => {
    // Initial kind is absent → 'bullet' default. setBulletKind('bullet')
    // should not modify the bullet (no undo entry created — undo would
    // restore the same state anyway, but more importantly nothing changed).
    const before = useResumeStore.getState().resume!;
    setBulletKind('b1', 'bullet', makeOrigin('tiptap'));
    const after = useResumeStore.getState().resume!;
    // Same reference → no setState happened
    expect(after).toBe(before);
  });
});

describe('forcedId (additive — for AI apply use only)', () => {
  it('insertBullet uses forcedId when provided', () => {
    const id = insertBullet('e1', 1, { type: 'doc', content: [{ type: 'paragraph' }] }, makeOrigin('paste'), undefined, 'forced-bid-1');
    expect(id).toBe('forced-bid-1');
    const r = useResumeStore.getState().resume!;
    const e1 = r.sections[0].entries.find(e => e.id === 'e1')!;
    expect(e1.bullets.find(b => b.id === 'forced-bid-1')).toBeTruthy();
  });

  it('insertBullet generates id when forcedId omitted (existing behavior unchanged)', () => {
    const id = insertBullet('e1', 0, { type: 'doc', content: [{ type: 'paragraph' }] }, makeOrigin('paste'));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);  // uuid v4
  });

  it('insertEntry uses forcedEntryId + forcedFirstBulletId when provided', () => {
    const { entryId, firstBulletId } = insertEntry('s1', 0, makeOrigin('paste'), 'forced-eid', 'forced-fid');
    expect(entryId).toBe('forced-eid');
    expect(firstBulletId).toBe('forced-fid');
    const r = useResumeStore.getState().resume!;
    expect(r.sections[0].entries[0].id).toBe('forced-eid');
    expect(r.sections[0].entries[0].bullets[0].id).toBe('forced-fid');
  });

  it('insertEntry generates ids when forced params omitted (existing behavior unchanged)', () => {
    const { entryId, firstBulletId } = insertEntry('s1', 0, makeOrigin('paste'));
    expect(entryId).toMatch(/^[0-9a-f]{8}-/i);
    expect(firstBulletId).toMatch(/^[0-9a-f]{8}-/i);
  });
});
