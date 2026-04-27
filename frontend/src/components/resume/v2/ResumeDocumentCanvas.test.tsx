import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ResumeDocumentCanvas } from './ResumeDocumentCanvas';
import { MINIMAL_SINGLE_COLUMN } from './templates/minimal-single-column';
import type { ResumeDoc } from './types';

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
  header: { id: 'h', name: 'X', contact_lines: [] },
  sections: [{ id: 's1', role: 'experience', heading: 'Exp', entries: [
    { id: 'e1', title: 'T', meta: 'M', bullets: [
      { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] } },
    ]},
  ]}],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

describe('ResumeDocumentCanvas', () => {
  it('renders without crash in edit mode', () => {
    const { container } = render(
      <ResumeDocumentCanvas resume={RESUME} template={MINIMAL_SINGLE_COLUMN} mode="edit" />
    );
    expect(container.querySelector('[data-canvas-root]')).toBeTruthy();
    expect(container.querySelector('[data-mode="edit"]')).toBeTruthy();
  });

  it('renders without crash in export mode', () => {
    const { container } = render(
      <ResumeDocumentCanvas resume={RESUME} template={MINIMAL_SINGLE_COLUMN} mode="export" />
    );
    expect(container.querySelector('[data-mode="export"]')).toBeTruthy();
    expect(container.querySelector('.interaction-layer')).toBeFalsy();
  });

  it('renders without crash in measure mode', () => {
    const { container } = render(
      <ResumeDocumentCanvas resume={RESUME} template={MINIMAL_SINGLE_COLUMN} mode="measure" />
    );
    expect(container.querySelector('[data-mode="measure"]')).toBeTruthy();
  });
});
