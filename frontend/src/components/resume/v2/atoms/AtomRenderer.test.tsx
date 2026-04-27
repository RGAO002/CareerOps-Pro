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
