// frontend/src/components/resume/v2/atoms/AtomRenderer.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { AtomRenderer } from './AtomRenderer';
import { useResumeStore } from '../store/useResumeStore';
import type { ResumeDoc, LayoutAtom } from '../types';

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
  header: { id: 'h', name: 'A', contact_lines: [{ type: 'text', value: 'a@b.com' }] },
  sections: [{ id: 's1', role: 'experience', heading: 'Exp', entries: [
    { id: 'e1', title: 'Eng', meta: 'Now', bullets: [
      { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'did stuff' }] }] } },
    ]},
  ]}],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

const RESUME_WITH_EMPTY_ROWS: ResumeDoc = {
  schema_version: 2, id: 'r2', title: '', template_id: 'minimal-single-column',
  header: { id: 'h2', name: '', contact_lines: [] },
  sections: [{ id: 's1', role: 'experience', heading: 'Exp', entries: [
    // Both title and meta empty; one bullet with content.
    { id: 'e1', title: '', meta: '', bullets: [
      { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'shipped it' }] }] } },
    ]},
  ]}],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

beforeEach(() => {
  useResumeStore.setState({ resume: RESUME, bulletMeta: {} });
});

describe('AtomRenderer dispatch', () => {
  it('renders header atom', () => {
    const atom: LayoutAtom = { kind: 'header', id: 'h', sourceBlockId: 'h', keepWithNext: false };
    const { container } = render(<AtomRenderer atom={atom} resume={RESUME} mode="export" />);
    expect(container.textContent).toContain('A');
    expect(container.textContent).toContain('a@b.com');
  });
  it('renders section-heading atom', () => {
    const atom: LayoutAtom = { kind: 'section-heading', id: 's1', sourceBlockId: 's1', keepWithNext: true };
    const { container } = render(<AtomRenderer atom={atom} resume={RESUME} mode="export" />);
    expect(container.textContent).toContain('Exp');
  });
  it('renders entry atom with bullets', () => {
    const atom: LayoutAtom = { kind: 'entry', id: 'e1', sourceBlockId: 'e1', keepWithNext: false };
    const { container } = render(<AtomRenderer atom={atom} resume={RESUME} mode="export" />);
    expect(container.textContent).toContain('Eng');
    expect(container.textContent).toContain('did stuff');
  });
});

describe('Entry/Header empty-row rendering by mode', () => {
  beforeEach(() => {
    useResumeStore.setState({ resume: RESUME_WITH_EMPTY_ROWS, bulletMeta: {} });
  });

  it('EXPORT mode: empty entry.title and entry.meta are NOT rendered (no DOM editor wrapper)', () => {
    const atom: LayoutAtom = { kind: 'entry', id: 'e1', sourceBlockId: 'e1', keepWithNext: false };
    const { container } = render(
      <AtomRenderer atom={atom} resume={RESUME_WITH_EMPTY_ROWS} mode="export" />,
    );
    expect(container.querySelector('.resume-entry-title')).toBeNull();
    expect(container.querySelector('.resume-entry-meta')).toBeNull();
    // Bullet content still renders — bullets are always present (deliberate
    // empty bullets are explicit user choices; this one has content anyway).
    expect(container.textContent).toContain('shipped it');
  });

  it('EDIT mode: empty entry.title and entry.meta DO render (placeholder guidance)', () => {
    const atom: LayoutAtom = { kind: 'entry', id: 'e1', sourceBlockId: 'e1', keepWithNext: false };
    const { container } = render(
      <AtomRenderer atom={atom} resume={RESUME_WITH_EMPTY_ROWS} mode="edit" />,
    );
    expect(container.querySelector('.resume-entry-title')).not.toBeNull();
    expect(container.querySelector('.resume-entry-meta')).not.toBeNull();
  });

  it('EDIT mode entry rows are wrapped with data-row-field-key for hover detection', () => {
    const atom: LayoutAtom = { kind: 'entry', id: 'e1', sourceBlockId: 'e1', keepWithNext: false };
    const { container } = render(
      <AtomRenderer atom={atom} resume={RESUME_WITH_EMPTY_ROWS} mode="edit" />,
    );
    expect(container.querySelector('[data-row-field-key="entry.title:e1"]')).not.toBeNull();
    expect(container.querySelector('[data-row-field-key="entry.meta:e1"]')).not.toBeNull();
  });

  it('EXPORT mode: empty header.name and empty contact line are NOT rendered', () => {
    const atom: LayoutAtom = { kind: 'header', id: 'h2', sourceBlockId: 'h2', keepWithNext: false };
    const { container } = render(
      <AtomRenderer atom={atom} resume={RESUME_WITH_EMPTY_ROWS} mode="export" />,
    );
    expect(container.querySelector('.resume-name')).toBeNull();
    expect(container.querySelector('.resume-contact-line')).toBeNull();
  });

  it('EDIT mode: header rows always render even when empty', () => {
    const atom: LayoutAtom = { kind: 'header', id: 'h2', sourceBlockId: 'h2', keepWithNext: false };
    const { container } = render(
      <AtomRenderer atom={atom} resume={RESUME_WITH_EMPTY_ROWS} mode="edit" />,
    );
    expect(container.querySelector('.resume-name')).not.toBeNull();
    expect(container.querySelector('.resume-contact-line')).not.toBeNull();
  });
});
