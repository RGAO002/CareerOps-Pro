// frontend/src/components/resume/v2/tokens/layout-tokens.ts
//
// SINGLE SOURCE OF TRUTH. Forbidden in implementation files: hardcoded
// derived px integers (643, 912, 816, 1056). Always parseToPx() in JS,
// always calc() in CSS.

export const PAGE_SPEC = {
  WIDTH: '8.5in',
  HEIGHT: '11in',
  MARGIN: {
    top: '0.75in',
    right: '0.9in',
    bottom: '0.75in',
    left: '0.9in',
  },
} as const;

export const ATOM_SPEC = {
  GAP: '12px',
} as const;

export const SCREEN_GAP = '16px';
export const PRINT_GAP = '0px';

export const PX_PER_INCH = 96;

export function parseToPx(spec: string): number {
  const trimmed = spec.trim();
  if (trimmed.endsWith('in')) return parseFloat(trimmed) * PX_PER_INCH;
  if (trimmed.endsWith('px')) return parseFloat(trimmed);
  if (trimmed.endsWith('cm')) return parseFloat(trimmed) * (PX_PER_INCH / 2.54);
  if (trimmed === '0') return 0;
  throw new Error(`parseToPx: unknown unit in "${spec}"`);
}
