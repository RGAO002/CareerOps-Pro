// frontend/src/components/resume/v2/store/source-of-truth.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeOrigin, isOriginatedBy, _resetTransactionCounter } from './source-of-truth';

beforeEach(() => _resetTransactionCounter());

describe('source-of-truth', () => {
  it('makeOrigin assigns monotonic transaction ids', () => {
    const a = makeOrigin('tiptap', 'ed-1');
    const b = makeOrigin('tiptap', 'ed-1');
    expect(b.transactionId).toBeGreaterThan(a.transactionId);
  });
  it('isOriginatedBy matches editor id', () => {
    const o = makeOrigin('tiptap', 'ed-A');
    expect(isOriginatedBy(o, 'ed-A')).toBe(true);
    expect(isOriginatedBy(o, 'ed-B')).toBe(false);
  });
  it('returns false when origin has no editorId', () => {
    const o = makeOrigin('drag-reorder');
    expect(isOriginatedBy(o, 'ed-A')).toBe(false);
  });
});
