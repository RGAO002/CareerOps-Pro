import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ContactLinesField } from './ContactLinesField';
import { useResumeStore } from '../store/useResumeStore';
import { _resetTransactionCounter } from '../store/source-of-truth';
import type { ContactItem } from '../types';

beforeEach(() => {
  useResumeStore.setState({
    resume: {
      schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
      header: { id: 'h', name: '', contact_lines: [] },
      sections: [],
      metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
    },
    bulletMeta: {},
  });
  _resetTransactionCounter();
});

const items: ContactItem[] = [
  { type: 'text', value: 'a@b.com' },
  { type: 'link', label: 'GH', url: 'https://x.com' },
];

describe('ContactLinesField', () => {
  it('renders text + link', () => {
    const { container } = render(<ContactLinesField index={0} items={items} mode="edit" />);
    expect(container.textContent).toContain('a@b.com');
    expect(container.textContent).toContain('GH');
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://x.com');
  });
});
