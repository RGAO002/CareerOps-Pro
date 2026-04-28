// frontend/src/components/resume/v2/store/header-order.ts
//
// Resolve the effective render order of header rows. A header has two kinds
// of rows: the name row (key 'name') and one row per contact_lines entry
// (key 'contact:N' where N is the array index). The optional `row_order`
// field on HeaderBlock lets the user reorder rows via drag without changing
// `contact_lines` order (which would break alignment indexing).
//
// When `row_order` is undefined, the natural order is used:
//   ['name', 'contact:0', 'contact:1', ...]
// When set, we filter out any keys that no longer point to a real row (e.g.
// the user deleted a contact line) so render code never sees a dangling key.

import type { HeaderBlock } from '../types';

export function effectiveHeaderRowOrder(header: HeaderBlock): string[] {
  if (header.row_order) {
    return header.row_order.filter((k) => {
      if (k === 'name') return true;
      const m = /^contact:(\d+)$/.exec(k);
      if (!m) return false;
      const idx = parseInt(m[1], 10);
      return idx >= 0 && idx < header.contact_lines.length;
    });
  }
  return ['name', ...header.contact_lines.map((_, i) => `contact:${i}`)];
}
