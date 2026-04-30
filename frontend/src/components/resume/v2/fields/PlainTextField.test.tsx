// frontend/src/components/resume/v2/fields/PlainTextField.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { PlainTextField } from './PlainTextField';
import { useResumeStore } from '../store/useResumeStore';
import { _resetTransactionCounter } from '../store/source-of-truth';

beforeEach(() => {
  useResumeStore.setState({
    resume: {
      schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
      header: { id: 'h', name: 'Foo', contact_lines: [] },
      sections: [{ id: 's', role: 'experience', heading: 'Exp', entries: [
        { id: 'e1', title: 'T', meta: '', bullets: [] }
      ]}],
      metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
    },
    bulletMeta: {},
  });
  _resetTransactionCounter();
});

describe('PlainTextField', () => {
  it('renders initial value', () => {
    const { container } = render(
      <PlainTextField fieldKey={{ kind: 'entry.title', id: 'e1' }} value="Hello" mode="edit" />
    );
    expect(container.textContent).toContain('Hello');
  });

  it('measure mode does NOT register with focus manager', () => {
    expect(() => render(
      <PlainTextField fieldKey={{ kind: 'entry.title', id: 'e1' }} value="X" mode="measure" />
    )).not.toThrow();
  });

  it('export mode renders content but is not editable', () => {
    const { container } = render(
      <PlainTextField fieldKey={{ kind: 'entry.title', id: 'e1' }} value="Y" mode="export" />
    );
    const editorEl = container.querySelector('[contenteditable]');
    expect(editorEl?.getAttribute('contenteditable')).toBe('false');
  });
});
