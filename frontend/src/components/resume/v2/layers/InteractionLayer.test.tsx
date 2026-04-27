import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { InteractionLayer } from './InteractionLayer';
import { useResumeStore } from '../store/useResumeStore';
import { normalizeTemplate } from '../layout/normalize-template';
import { MINIMAL_SINGLE_COLUMN } from '../templates/minimal-single-column';
import type { LayoutAtom, AtomId, AtomLayout } from '../types';

beforeEach(() => {
  useResumeStore.setState({
    resume: {
      schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
      header: { id: 'h', name: '', contact_lines: [] },
      sections: [{ id: 's1', role: 'experience', heading: 'Exp', entries: [
        { id: 'e1', title: '', meta: '', bullets: [] },
      ]}],
      metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
    },
    bulletMeta: {},
  });
});

describe('InteractionLayer', () => {
  it('renders drag handles for section + entry', () => {
    const T = normalizeTemplate(MINIMAL_SINGLE_COLUMN);
    const atoms: LayoutAtom[] = [
      { kind: 'section-heading', id: 's1', sourceBlockId: 's1', keepWithNext: true },
      { kind: 'entry', id: 'e1', sourceBlockId: 'e1', keepWithNext: false },
    ];
    const layouts = new Map<AtomId, AtomLayout>([
      ['s1', { pageIndex: 0, xWithinPage: 0, yWithinPage: 0, width: 100, height: 30 }],
      ['e1', { pageIndex: 0, xWithinPage: 0, yWithinPage: 50, width: 100, height: 100 }],
    ]);
    const { container } = render(<InteractionLayer atoms={atoms} layouts={layouts} template={T} />);
    const handles = container.querySelectorAll('button[aria-label="Drag to reorder"]');
    expect(handles.length).toBe(2);
  });
});
