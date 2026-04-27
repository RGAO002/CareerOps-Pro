import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { BulletField } from './BulletField';
import { useResumeStore } from '../store/useResumeStore';
import { _resetTransactionCounter } from '../store/source-of-truth';
import type { ProseMirrorBulletDoc } from '../types';

const makeContent = (text: string): ProseMirrorBulletDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined }],
});

beforeEach(() => {
  useResumeStore.setState({
    resume: {
      schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
      header: { id: 'h', name: '', contact_lines: [] },
      sections: [{ id: 's', role: 'experience', heading: 'Exp', entries: [
        { id: 'e1', title: '', meta: '', bullets: [
          { id: 'b1', content: makeContent('initial') },
        ]},
      ]}],
      metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
    },
    bulletMeta: {},
  });
  _resetTransactionCounter();
});

describe('BulletField', () => {
  it('renders initial content', () => {
    const { container } = render(
      <BulletField bulletId="b1" entryId="e1" content={makeContent('hello')} mode="edit" />
    );
    expect(container.textContent).toContain('hello');
  });

  it('export mode is not editable', () => {
    const { container } = render(
      <BulletField bulletId="b1" entryId="e1" content={makeContent('x')} mode="export" />
    );
    const ed = container.querySelector('[contenteditable]');
    expect(ed?.getAttribute('contenteditable')).toBe('false');
  });

  it('measure mode renders without error', () => {
    expect(() => render(
      <BulletField bulletId="b1" entryId="e1" content={makeContent('m')} mode="measure" />
    )).not.toThrow();
  });
});
