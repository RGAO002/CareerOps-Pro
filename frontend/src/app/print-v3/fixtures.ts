// T35 — fixture registry for the /print-v3 production print route.
//
// Used by the PDF e2e spec (frontend/playwright/v3/print-fidelity.spec.ts) to
// load named documents into the print canvas via `?fixture=<name>`. Keeps URL
// shape clean (vs base64 doc payloads) and the registry lives in source so
// e2e tests + manual QA share the same inputs.
//
// Adding a fixture: export it here, then add its name to FIXTURES.

import type { ResumeDocV3, GroupId, RowId } from '@/components/resume/v3/schema/types';
import { twoSections } from '@/components/resume/v3/__test_harness__/twoSections';

// 3-page production fixture — a long resume with 3 sections + many bullets,
// engineered to exceed page-1 content budget (~9.5in) and produce 3 pages
// at 0.75in top/bottom margins. Each entry has a title + meta + many bullets;
// rows alternate to exercise variable inter-row spacing (F3 path).
function buildThreePageFixture(): ResumeDocV3 {
  const rows: ResumeDocV3['rows'] = [
    { id: 'r-name' as RowId, kind: 'header.name', content: { text: 'Alex Resume Tester' } },
    { id: 'r-contact' as RowId, kind: 'header.contact', content: { type: 'text', value: 'alex@example.com — github.com/alex' } },
  ];
  const groups: ResumeDocV3['groups'] = [];

  // Build N sections × M entries × K bullets — sized to push past 2 pages.
  // ~6 sections, ~3 entries each, ~5 bullets per entry → ≈ 90+ rows.
  // Tuned to land at 3 pages at 0.75in top/bottom margins (≈9.5in content).
  // Empirically: ~30 visible rows ≈ 1 page; we want ~3 pages of content.
  const sectionRoles = ['experience', 'projects'] as const;
  const SECTIONS = sectionRoles.length;
  const ENTRIES_PER_SECTION = 3;
  const BULLETS_PER_ENTRY = 5;

  for (let s = 0; s < SECTIONS; s++) {
    const sectionGroupId = `gS${s}` as GroupId;
    groups.push({ id: sectionGroupId, kind: 'section', role: sectionRoles[s] });
    rows.push({
      id: `r-s${s}-h` as RowId,
      kind: 'section.heading',
      content: { text: sectionRoles[s].toUpperCase() },
      semanticGroupId: sectionGroupId,
    });

    for (let e = 0; e < ENTRIES_PER_SECTION; e++) {
      const entryGroupId = `gE${s}_${e}` as GroupId;
      groups.push({ id: entryGroupId, kind: 'entry', parentSectionGroupId: sectionGroupId });
      rows.push({
        id: `r-s${s}-e${e}-title` as RowId,
        kind: 'entry.title',
        content: { text: `Entry ${e + 1} for ${sectionRoles[s]} — Role / Project Name` },
        semanticGroupId: entryGroupId,
      });
      rows.push({
        id: `r-s${s}-e${e}-meta` as RowId,
        kind: 'entry.meta',
        content: { text: `Org ${e + 1}, City — Jan ${2018 + e} - Dec ${2019 + e}` },
        semanticGroupId: entryGroupId,
      });
      for (let b = 0; b < BULLETS_PER_ENTRY; b++) {
        rows.push({
          id: `r-s${s}-e${e}-b${b}` as RowId,
          kind: 'bullet',
          content: {
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: [{
                type: 'text',
                text: `Bullet ${b + 1}: accomplished a notable thing with measurable impact and clarity for reviewers reading this resume out loud.`,
              }],
            }],
          },
          semanticGroupId: entryGroupId,
        });
      }
    }
  }

  return { schemaVersion: 3, rows, groups };
}

export const threePageFixture: ResumeDocV3 = buildThreePageFixture();

// Registry of fixture name → doc. The /print-v3 page reads ?fixture=<name>
// and looks up the doc here. Default = 'twoSections' (T34 default).
export const FIXTURES: Record<string, ResumeDocV3> = {
  twoSections,
  threePage: threePageFixture,
};

export type FixtureName = keyof typeof FIXTURES;

export function resolveFixture(name: string | null | undefined): ResumeDocV3 {
  if (name && Object.prototype.hasOwnProperty.call(FIXTURES, name)) {
    return FIXTURES[name];
  }
  return FIXTURES.twoSections;
}
