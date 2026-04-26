// frontend/src/components/resume/v2/templates/registry.test.ts
import { describe, it, expect } from 'vitest';
import { getTemplate, TEMPLATES } from './registry';

describe('template registry', () => {
  it('returns minimal-single-column by id', () => {
    expect(getTemplate('minimal-single-column').id).toBe('minimal-single-column');
  });
  it('falls back to minimal-single-column for unknown id', () => {
    expect(getTemplate('does-not-exist').id).toBe('minimal-single-column');
  });
  it('exports exactly one template in v2', () => {
    expect(Object.keys(TEMPLATES)).toEqual(['minimal-single-column']);
  });
});
