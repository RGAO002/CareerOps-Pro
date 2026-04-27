// frontend/src/components/resume/v2/atoms/EntryRowInteractionOverlay.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { EntryRowInteractionOverlay } from './EntryRowInteractionOverlay';
import { useResumeStore } from '../store/useResumeStore';
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
});
