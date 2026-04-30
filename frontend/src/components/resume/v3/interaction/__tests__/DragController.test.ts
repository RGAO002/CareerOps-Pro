// frontend/src/components/resume/v3/interaction/__tests__/DragController.test.ts
//
// T28 — DragController tests.
//
// Coverage targets the contracts in the task spec:
//   C7  — pre-drag listener is on the .row-handle element (not window/document
//          with capture). Window listeners are only registered AFTER drag has
//          started, on pointermove/pointerup/pointercancel/keydown.
//   C8  — drop dispatches via dispatchWithGroups (single PM transaction),
//          NEVER directly via view.dispatch for group changes.
//   F4  — drop tolerates orphan group state — works even if a dragged row's
//          parentSectionGroupId points at a missing group.
//   F5  — every group mutation goes through dispatchWithGroups.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSchema } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { Text } from '@tiptap/extension-text';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Link } from '@tiptap/extension-link';
import { EditorState, type Transaction } from '@tiptap/pm/state';
import { history } from '@tiptap/pm/history';

import { v3RowExtensions } from '../../schema/pmSchema';
import { createGroupsPlugin } from '../../plugins/GroupsPlugin';
import type { GroupId, GroupOp, RowId } from '../../schema/types';

import { DragController, DRAG_THRESHOLD_PX } from '../DragController';
import * as DispatchModule from '../dispatchWithGroups';

// ----- shared schema/state setup -----

const TestDoc = Document.extend({
  content: '(header_name | header_contact | section_heading | entry_title | entry_meta | plain | bullet)+',
});
const schema = getSchema([TestDoc, Text, Bold, Italic, Link, ...v3RowExtensions]);

interface RowSpec { kind: string; id: string; gid?: string | null; text?: string }

function makeState(rows: RowSpec[], groupOps: GroupOp[] = []): EditorState {
  const content = rows.map((r) => {
    const attrs: Record<string, unknown> = { id: r.id };
    if (r.gid !== undefined) attrs.semanticGroupId = r.gid;
    return schema.nodes[r.kind].create(attrs, r.text ? schema.text(r.text) : null);
  });
  let state = EditorState.create({
    schema,
    doc: schema.node('doc', null, content),
    plugins: [history(), createGroupsPlugin()],
  });
  if (groupOps.length > 0) state = state.apply(state.tr.setMeta('groupOps', groupOps));
  return state;
}

// Minimal EditorView stub adequate for DragController.
function makeView(state: EditorState) {
  const cur = { state, dispatchedTrs: [] as Transaction[] };
  const view = {
    get state() { return cur.state; },
    dispatch: vi.fn((tr: Transaction) => {
      cur.dispatchedTrs.push(tr);
      cur.state = cur.state.apply(tr);
    }),
  };
  return { view: view as unknown as import('@tiptap/pm/view').EditorView, log: cur };
}

// PointerEvent stub. jsdom 22+ supports PointerEvent constructor (most versions
// fall back to MouseEvent + extra props). We assemble a plain object that walks
// like a PointerEvent for the DragController's purposes. The controller only
// reads pointerId, clientX/Y, and calls preventDefault/stopPropagation.
interface FakePointerEvent {
  pointerId: number;
  clientX: number;
  clientY: number;
  target: EventTarget;
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
}
function fakePointer(target: EventTarget, x: number, y: number, pointerId = 1): FakePointerEvent {
  return {
    pointerId,
    clientX: x,
    clientY: y,
    target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

function makeHandle(rowId: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'row-handle';
  el.setAttribute('data-row-id', rowId);
  // setPointerCapture exists on real Element in jsdom but we stub it so we can spy.
  (el as unknown as { setPointerCapture: ReturnType<typeof vi.fn> }).setPointerCapture = vi.fn();
  (el as unknown as { releasePointerCapture: ReturnType<typeof vi.fn> }).releasePointerCapture = vi.fn();
  document.body.appendChild(el);
  return el;
}

// Stub a row's bounding rect — DragController uses cursorY vs row tops to pick
// drop target. We patch getBoundingClientRect on a synthetic DOM element
// keyed by data-row-id, which DragController will look up via querySelector.
function stubRowRect(rowId: string, top: number, height = 20): HTMLElement {
  const el = document.createElement('div');
  el.className = 'row';
  el.setAttribute('data-row-id', rowId);
  el.getBoundingClientRect = () => ({
    top, bottom: top + height, left: 0, right: 100, width: 100, height, x: 0, y: top, toJSON: () => ({}),
  } as DOMRect);
  document.body.appendChild(el);
  return el;
}

// ---- tests ----

describe('DragController (T28)', () => {
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    dispatchSpy = vi.spyOn(DispatchModule, 'dispatchWithGroups');
  });
  afterEach(() => {
    dispatchSpy.mockRestore();
    document.body.innerHTML = '';
  });

  function basicSetup() {
    // 3 plain rows, easy reorder.
    const state = makeState([
      { kind: 'plain', id: 'r1', gid: null, text: 'a' },
      { kind: 'plain', id: 'r2', gid: null, text: 'b' },
      { kind: 'plain', id: 'r3', gid: null, text: 'c' },
    ]);
    stubRowRect('r1', 0);
    stubRowRect('r2', 30);
    stubRowRect('r3', 60);
    const handle = makeHandle('r1');
    const { view, log } = makeView(state);
    const dropIndicator = vi.fn();
    const ctl = new DragController({ view, onDropIndicator: dropIndicator });
    return { state, handle, view, log, ctl, dropIndicator };
  }

  it('pointerdown on row-handle starts drag (preventDefault/stopPropagation/setPointerCapture)', () => {
    const { handle, ctl } = basicSetup();
    const ev = fakePointer(handle, 5, 5);
    ctl.onPointerDown(ev as unknown as PointerEvent, 'r1' as RowId, handle);
    expect(ev.preventDefault).toHaveBeenCalledTimes(1);
    expect(ev.stopPropagation).toHaveBeenCalledTimes(1);
    expect((handle as unknown as { setPointerCapture: ReturnType<typeof vi.fn> }).setPointerCapture)
      .toHaveBeenCalledWith(1);
    expect(ctl.isDragging()).toBe(false); // not yet active until threshold movement
  });

  it('does NOT register window pointerdown/mousedown listeners (C7)', () => {
    // We can't easily spy on EventTarget.addEventListener installations on
    // `window` cross-realm, but we can verify the controller doesn't expose
    // a "window pointerdown handler" surface and a no-drag state means no
    // window listener should have been wired (there's nothing on window).
    const { ctl } = basicSetup();
    // No drag started — no listeners registered.
    expect(ctl.hasWindowListeners()).toBe(false);
  });

  it('< 4px movement does NOT trigger drag-active state', () => {
    const { handle, ctl } = basicSetup();
    ctl.onPointerDown(fakePointer(handle, 0, 0) as unknown as PointerEvent, 'r1' as RowId, handle);
    // Tiny move below threshold.
    ctl.onPointerMove({ pointerId: 1, clientX: 1, clientY: 2 } as unknown as PointerEvent);
    expect(ctl.isDragging()).toBe(false);
  });

  it('≥ 4px movement triggers drag-active and resolves range via rangeResolver', () => {
    const { handle, ctl } = basicSetup();
    ctl.onPointerDown(fakePointer(handle, 0, 0) as unknown as PointerEvent, 'r1' as RowId, handle);
    ctl.onPointerMove({ pointerId: 1, clientX: 0, clientY: DRAG_THRESHOLD_PX + 1 } as unknown as PointerEvent);
    expect(ctl.isDragging()).toBe(true);
    const rng = ctl.getDraggedRange();
    expect(rng).not.toBeNull();
    expect(rng!.rowIds).toEqual(['r1']);
  });

  it('drag activation marks dragged rows with a CSS class', () => {
    const { handle, ctl } = basicSetup();
    ctl.onPointerDown(fakePointer(handle, 0, 0) as unknown as PointerEvent, 'r1' as RowId, handle);
    ctl.onPointerMove({ pointerId: 1, clientX: 0, clientY: 10 } as unknown as PointerEvent);
    const r1 = document.querySelector('[data-row-id="r1"]')!;
    expect(r1.classList.contains('row-dragging')).toBe(true);
  });

  it('pointerup performs atomic move via dispatchWithGroups (C8/F5)', () => {
    const { handle, ctl, view } = basicSetup();
    ctl.onPointerDown(fakePointer(handle, 0, 0) as unknown as PointerEvent, 'r1' as RowId, handle);
    ctl.onPointerMove({ pointerId: 1, clientX: 0, clientY: 70 } as unknown as PointerEvent); // beyond r3 → drop after r3
    ctl.onPointerUp({ pointerId: 1, clientX: 0, clientY: 70 } as unknown as PointerEvent);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const args = dispatchSpy.mock.calls[0];
    expect(args[0]).toBe(view);
    expect(args[1]).toHaveProperty('docOp');
  });

  it('cross-section drop emits parent updateParent groupOp', () => {
    // entry rows belonging to gE under sectionA being dragged into sectionB.
    const state = makeState(
      [
        { kind: 'section_heading', id: 'sA', gid: 'gA', text: 'A' },
        { kind: 'entry_title',     id: 'eT', gid: 'gE', text: 'EntryTitle' },
        { kind: 'bullet',          id: 'eB', gid: 'gE', text: 'EntryBullet' },
        { kind: 'section_heading', id: 'sB', gid: 'gB', text: 'B' },
        { kind: 'plain',           id: 'p1', gid: null, text: 'tail' },
      ],
      [
        { type: 'create', group: { id: 'gA' as GroupId, kind: 'section', role: 'experience' } },
        { type: 'create', group: { id: 'gB' as GroupId, kind: 'section', role: 'projects' } },
        { type: 'create', group: { id: 'gE' as GroupId, kind: 'entry', parentSectionGroupId: 'gA' as GroupId } },
      ],
    );
    stubRowRect('sA', 0);
    stubRowRect('eT', 20);
    stubRowRect('eB', 40);
    stubRowRect('sB', 60);
    stubRowRect('p1', 80);

    const handle = makeHandle('eT');
    const { view } = makeView(state);
    const ctl = new DragController({ view, onDropIndicator: () => {} });

    ctl.onPointerDown(fakePointer(handle, 0, 20) as unknown as PointerEvent, 'eT' as RowId, handle);
    ctl.onPointerMove({ pointerId: 1, clientX: 0, clientY: 90 } as unknown as PointerEvent);
    ctl.onPointerUp({ pointerId: 1, clientX: 0, clientY: 90 } as unknown as PointerEvent);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const args = dispatchSpy.mock.calls[0][1];
    expect(args.groupOps).toBeDefined();
    const ops = args.groupOps as GroupOp[];
    const updateParent = ops.find((o) => o.type === 'updateParent');
    expect(updateParent).toBeDefined();
    expect((updateParent as Extract<GroupOp, { type: 'updateParent' }>).groupId).toBe('gE');
    expect((updateParent as Extract<GroupOp, { type: 'updateParent' }>).parentSectionGroupId).toBe('gB');
  });

  it('tolerates orphan group state (F4) — moves rows even if entry group missing from plugin', () => {
    // gE absent from groups state, but rows tagged with it.
    const state = makeState(
      [
        { kind: 'section_heading', id: 'sA', gid: 'gA', text: 'A' },
        { kind: 'entry_title',     id: 'eT', gid: 'gE', text: 'EntryTitle' },
        { kind: 'plain',           id: 'p1', gid: null, text: 'tail' },
      ],
      [
        { type: 'create', group: { id: 'gA' as GroupId, kind: 'section', role: 'experience' } },
        // gE intentionally omitted — orphan.
      ],
    );
    stubRowRect('sA', 0);
    stubRowRect('eT', 20);
    stubRowRect('p1', 40);

    const handle = makeHandle('eT');
    const { view } = makeView(state);
    const ctl = new DragController({ view, onDropIndicator: () => {} });

    ctl.onPointerDown(fakePointer(handle, 0, 20) as unknown as PointerEvent, 'eT' as RowId, handle);
    ctl.onPointerMove({ pointerId: 1, clientX: 0, clientY: 50 } as unknown as PointerEvent);
    expect(() => {
      ctl.onPointerUp({ pointerId: 1, clientX: 0, clientY: 50 } as unknown as PointerEvent);
    }).not.toThrow();
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });

  it('pointercancel cancels drag (no transaction dispatched)', () => {
    const { handle, ctl } = basicSetup();
    ctl.onPointerDown(fakePointer(handle, 0, 0) as unknown as PointerEvent, 'r1' as RowId, handle);
    ctl.onPointerMove({ pointerId: 1, clientX: 0, clientY: 10 } as unknown as PointerEvent);
    expect(ctl.isDragging()).toBe(true);
    ctl.onPointerCancel({ pointerId: 1 } as unknown as PointerEvent);
    expect(ctl.isDragging()).toBe(false);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('Esc keydown during drag cancels drag (no transaction)', () => {
    const { handle, ctl } = basicSetup();
    ctl.onPointerDown(fakePointer(handle, 0, 0) as unknown as PointerEvent, 'r1' as RowId, handle);
    ctl.onPointerMove({ pointerId: 1, clientX: 0, clientY: 10 } as unknown as PointerEvent);
    ctl.onKeyDown({ key: 'Escape' } as unknown as KeyboardEvent);
    expect(ctl.isDragging()).toBe(false);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('drop emits exactly one transaction (atomicity)', () => {
    const { handle, ctl, log } = basicSetup();
    ctl.onPointerDown(fakePointer(handle, 0, 0) as unknown as PointerEvent, 'r1' as RowId, handle);
    ctl.onPointerMove({ pointerId: 1, clientX: 0, clientY: 70 } as unknown as PointerEvent);
    ctl.onPointerUp({ pointerId: 1, clientX: 0, clientY: 70 } as unknown as PointerEvent);
    // log.dispatchedTrs counts every view.dispatch — the helper batches
    // doc + group ops into a single tr, so this must equal 1.
    expect(log.dispatchedTrs.length).toBe(1);
  });

  it('drop indicator emitted while dragging, cleared on cancel/up', () => {
    const { handle, ctl, dropIndicator } = basicSetup();
    ctl.onPointerDown(fakePointer(handle, 0, 0) as unknown as PointerEvent, 'r1' as RowId, handle);
    ctl.onPointerMove({ pointerId: 1, clientX: 0, clientY: 35 } as unknown as PointerEvent);
    expect(dropIndicator).toHaveBeenCalled();
    const lastCall = dropIndicator.mock.calls[dropIndicator.mock.calls.length - 1][0];
    expect(lastCall).not.toBeNull();
    ctl.onPointerCancel({ pointerId: 1 } as unknown as PointerEvent);
    expect(dropIndicator).toHaveBeenLastCalledWith(null);
  });
});
