// frontend/src/components/resume/v2/tokens/layout-tokens.test.ts
import { describe, it, expect } from 'vitest';
import { parseToPx, PAGE_SPEC, PX_PER_INCH } from './layout-tokens';

describe('parseToPx', () => {
  it('parses inches', () => {
    expect(parseToPx('8.5in')).toBe(8.5 * PX_PER_INCH);
    expect(parseToPx('0.9in')).toBe(0.9 * PX_PER_INCH);
  });
  it('parses pixels', () => {
    expect(parseToPx('12px')).toBe(12);
    expect(parseToPx('16px')).toBe(16);
  });
  it('parses zero', () => {
    expect(parseToPx('0')).toBe(0);
  });
  it('parses centimeters', () => {
    expect(parseToPx('2.54cm')).toBeCloseTo(PX_PER_INCH, 2);
  });
  it('rejects unknown units', () => {
    expect(() => parseToPx('5em')).toThrow(/unknown unit/);
  });
  it('rejects malformed numbers', () => {
    expect(() => parseToPx('abcin')).toThrow(/unknown unit/);
    expect(() => parseToPx('1.2.3in')).toThrow(/unknown unit/);
    expect(() => parseToPx('  in')).toThrow(/unknown unit/);
  });
  it('rejects negative values', () => {
    expect(() => parseToPx('-1in')).toThrow(/unknown unit/);
  });
  it('parses 0px (not just bare "0")', () => {
    expect(parseToPx('0px')).toBe(0);
  });
});

describe('PAGE_SPEC', () => {
  it('is unmodifiable string spec only', () => {
    expect(PAGE_SPEC.WIDTH).toBe('8.5in');
    expect(PAGE_SPEC.MARGIN.top).toBe('0.75in');
  });
});
