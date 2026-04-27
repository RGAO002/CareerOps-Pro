// frontend/src/components/resume/v2/atoms/EntryRowInteractionOverlay.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EntryRowInteractionOverlay } from './EntryRowInteractionOverlay';
import { useResumeStore } from '../store/useResumeStore';
import * as DragController from '../interaction/DragController';
import type { ResumeDoc } from '../types';

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
  header: { id: 'h', name: 'A', contact_lines: [] },
  sections: [{ id: 's1', role: 'experience', heading: 'Exp', entries: [
    { id: 'e1', title: '', meta: '', bullets: [] },
  ]}],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

beforeEach(() => {
  useResumeStore.setState({ resume: RESUME, bulletMeta: {} });
});

describe('EntryRowInteractionOverlay', () => {
  it('renders the ⋮⋮ drag handle for an existing entry', () => {
    const { container } = render(
      <EntryRowInteractionOverlay entryId="e1" field="title" hovered={true} />,
    );
    // DragHandle renders a single button with the ⋮⋮ glyph
    const btn = container.querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toBe('⋮⋮');
  });

  it('hidden state: opacity 0 and pointer-events none (handle present but not clickable)', () => {
    const { container } = render(
      <EntryRowInteractionOverlay entryId="e1" field="meta" hovered={false} />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.opacity).toBe('0');
    expect(wrapper.style.pointerEvents).toBe('none');
  });

  it('hovered state: opacity 1 and pointer-events auto (handle is clickable)', () => {
    const { container } = render(
      <EntryRowInteractionOverlay entryId="e1" field="title" hovered={true} />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.opacity).toBe('1');
    expect(wrapper.style.pointerEvents).toBe('auto');
  });

  it('renders nothing when the entry id cannot be resolved to a section', () => {
    const { container } = render(
      <EntryRowInteractionOverlay entryId="missing-entry" field="title" hovered={true} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('overlay has explicit zIndex so contenteditable siblings cannot occlude the handle', () => {
    // Regression: without a zIndex, the EntryRowInteractionOverlay (absolute,
    // left:-28) is in the same stacking context as its sibling .resume-entry-title
    // (now position:relative via resume-styles.css). Per CSS painting order,
    // when neither has z-index, later sibling wins — so the contenteditable's
    // root paints over the overlay button and pointerdown is intercepted by
    // the editor's hidden background, swallowing the drag start.
    const { container } = render(
      <EntryRowInteractionOverlay entryId="e1" field="title" hovered={true} />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.zIndex).not.toBe('');
    expect(Number(wrapper.style.zIndex)).toBeGreaterThan(0);
  });

  it('pointerdown on handle calls startDrag (drag is wired, not swallowed)', () => {
    const startDragSpy = vi.spyOn(DragController, 'startDrag').mockImplementation(
      // Return a no-op DragSession — we only care that startDrag was invoked.
      () => ({ cancel: () => {} }),
    );
    try {
      const { container } = render(
        <EntryRowInteractionOverlay entryId="e1" field="meta" hovered={true} />,
      );
      const btn = container.querySelector('button');
      expect(btn).not.toBeNull();
      // JSDOM doesn't implement setPointerCapture; stub it so DragHandle's
      // onPointerDown handler runs to completion.
      (btn as HTMLElement & { setPointerCapture?: (id: number) => void })
        .setPointerCapture = () => {};
      fireEvent.pointerDown(btn!, { clientX: 50, clientY: 50, pointerId: 1 });
      expect(startDragSpy).toHaveBeenCalledTimes(1);
      // Verify it was called for the OWNING ENTRY (not the row).
      const call = startDragSpy.mock.calls[0];
      const block = call[2];
      expect(block).toEqual({ kind: 'entry', id: 'e1', sectionId: 's1' });
    } finally {
      startDragSpy.mockRestore();
    }
  });
});
