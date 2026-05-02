import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Local minimal type — Task 3.1 will add the canonical ResumeFileV3 to types.ts.
// We don't depend on it here so this test is self-contained.
interface ResumeFileV3 {
  schema_version: number;
  id: string;
  title: string;
  rows: { kind: string }[];
  groups: { kind: string }[];
}

describe('canonical v3 fixture round-trip in TS', () => {
  it('parses cleanly into ResumeFileV3', () => {
    const path = resolve(__dirname, '../../../../../../../tests/migration/fixtures/v3/canonical-all-kinds.json');
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as ResumeFileV3;
    expect(raw.schema_version).toBe(3);
    expect(raw.rows.length).toBe(9);
    expect(raw.groups.length).toBe(2);
    // All 7 row kinds.
    const kinds = new Set(raw.rows.map(r => r.kind));
    expect(kinds.size).toBe(7);
  });
});
