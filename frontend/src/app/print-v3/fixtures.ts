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

// ---------------------------------------------------------------------------
// T42 — fixtures for performance / IME / edge-case e2e specs.
// ---------------------------------------------------------------------------

/** Empty doc — schemaVersion only, no rows, no groups. */
const emptyDoc: ResumeDocV3 = {
  schemaVersion: 3,
  rows: [],
  groups: [],
};

/** Single-row doc — only header.name. */
const singleRowDoc: ResumeDocV3 = {
  schemaVersion: 3,
  rows: [
    { id: 'r-name' as RowId, kind: 'header.name', content: { text: 'Single Row Doc' } },
  ],
  groups: [],
};

/** All 9 SectionRoles, one heading + one bullet each. */
function buildAllRolesDoc(): ResumeDocV3 {
  const roles = [
    'experience', 'education', 'skills', 'projects',
    'awards', 'publications', 'volunteer', 'summary', 'custom',
  ] as const;
  const rows: ResumeDocV3['rows'] = [
    { id: 'r-name' as RowId, kind: 'header.name', content: { text: 'All Roles Tester' } },
  ];
  const groups: ResumeDocV3['groups'] = [];
  roles.forEach((role, i) => {
    const sgid = `gS${i}` as GroupId;
    const egid = `gE${i}` as GroupId;
    groups.push({ id: sgid, kind: 'section', role });
    groups.push({ id: egid, kind: 'entry', parentSectionGroupId: sgid });
    rows.push({
      id: `r-s${i}-h` as RowId,
      kind: 'section.heading',
      content: { text: String(role).toUpperCase() },
      semanticGroupId: sgid,
    });
    rows.push({
      id: `r-s${i}-b0` as RowId,
      kind: 'bullet',
      content: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: `Sample bullet for ${role}` }],
        }],
      },
      semanticGroupId: egid,
    });
  });
  return { schemaVersion: 3, rows, groups };
}
const allRolesDoc: ResumeDocV3 = buildAllRolesDoc();

/** 50-row doc — single section with many bullets. */
function buildFiftyRowDoc(): ResumeDocV3 {
  const rows: ResumeDocV3['rows'] = [
    { id: 'r-name' as RowId, kind: 'header.name', content: { text: 'Fifty Row Doc' } },
    { id: 'r-exp-h' as RowId, kind: 'section.heading', content: { text: 'EXPERIENCE' }, semanticGroupId: 'gS0' as GroupId },
    { id: 'r-exp-title' as RowId, kind: 'entry.title', content: { text: 'Senior Engineer' }, semanticGroupId: 'gE0' as GroupId },
  ];
  for (let i = 0; i < 47; i++) {
    rows.push({
      id: `r-b${i}` as RowId,
      kind: 'bullet',
      content: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: `Bullet ${i}: did something useful with measurable impact.` }],
        }],
      },
      semanticGroupId: 'gE0' as GroupId,
    });
  }
  return {
    schemaVersion: 3,
    rows,
    groups: [
      { id: 'gS0' as GroupId, kind: 'section', role: 'experience' },
      { id: 'gE0' as GroupId, kind: 'entry', parentSectionGroupId: 'gS0' as GroupId },
    ],
  };
}
const fiftyRowDoc: ResumeDocV3 = buildFiftyRowDoc();

/** 30-row doc — initial-paint test. */
function buildThirtyRowDoc(): ResumeDocV3 {
  const rows: ResumeDocV3['rows'] = [
    { id: 'r-name' as RowId, kind: 'header.name', content: { text: 'Thirty Row Doc' } },
    { id: 'r-exp-h' as RowId, kind: 'section.heading', content: { text: 'EXPERIENCE' }, semanticGroupId: 'gS0' as GroupId },
  ];
  for (let i = 0; i < 28; i++) {
    rows.push({
      id: `r-b${i}` as RowId,
      kind: 'bullet',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: `Bullet ${i}` }] }],
      },
      semanticGroupId: 'gE0' as GroupId,
    });
  }
  return {
    schemaVersion: 3,
    rows,
    groups: [
      { id: 'gS0' as GroupId, kind: 'section', role: 'experience' },
      { id: 'gE0' as GroupId, kind: 'entry', parentSectionGroupId: 'gS0' as GroupId },
    ],
  };
}
const thirtyRowDoc: ResumeDocV3 = buildThirtyRowDoc();

/** 5-page doc — many sections × entries × bullets to overflow into 5 pages. */
function buildFivePageDoc(): ResumeDocV3 {
  const rows: ResumeDocV3['rows'] = [
    { id: 'r-name' as RowId, kind: 'header.name', content: { text: 'Five Page Doc' } },
    { id: 'r-contact' as RowId, kind: 'header.contact', content: { type: 'text', value: 'tester@example.com' } },
  ];
  const groups: ResumeDocV3['groups'] = [];
  const sectionRoles = ['experience', 'projects', 'education', 'awards'] as const;
  const ENTRIES_PER_SECTION = 4;
  const BULLETS_PER_ENTRY = 8;
  for (let s = 0; s < sectionRoles.length; s++) {
    const sgid = `gS${s}` as GroupId;
    groups.push({ id: sgid, kind: 'section', role: sectionRoles[s] });
    rows.push({
      id: `r-s${s}-h` as RowId,
      kind: 'section.heading',
      content: { text: sectionRoles[s].toUpperCase() },
      semanticGroupId: sgid,
    });
    for (let e = 0; e < ENTRIES_PER_SECTION; e++) {
      const egid = `gE${s}_${e}` as GroupId;
      groups.push({ id: egid, kind: 'entry', parentSectionGroupId: sgid });
      rows.push({
        id: `r-s${s}-e${e}-title` as RowId,
        kind: 'entry.title',
        content: { text: `Entry ${e + 1} for ${sectionRoles[s]}` },
        semanticGroupId: egid,
      });
      rows.push({
        id: `r-s${s}-e${e}-meta` as RowId,
        kind: 'entry.meta',
        content: { text: `Org ${e + 1} — ${2018 + e} - ${2020 + e}` },
        semanticGroupId: egid,
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
                text: `Bullet ${b + 1}: accomplished a notable thing with measurable impact and clarity for reviewers reading this resume aloud.`,
              }],
            }],
          },
          semanticGroupId: egid,
        });
      }
    }
  }
  return { schemaVersion: 3, rows, groups };
}
const fivePageDoc: ResumeDocV3 = buildFivePageDoc();

// Registry of fixture name → doc. The /print-v3 page reads ?fixture=<name>
// and looks up the doc here. Default = 'twoSections' (T34 default).
export const FIXTURES: Record<string, ResumeDocV3> = {
  twoSections,
  threePage: threePageFixture,
  empty: emptyDoc,
  singleRow: singleRowDoc,
  allRoles: allRolesDoc,
  fiftyRow: fiftyRowDoc,
  thirtyRow: thirtyRowDoc,
  fivePage: fivePageDoc,
};

export type FixtureName = keyof typeof FIXTURES;

export function resolveFixture(name: string | null | undefined): ResumeDocV3 {
  if (name && Object.prototype.hasOwnProperty.call(FIXTURES, name)) {
    return FIXTURES[name];
  }
  return FIXTURES.twoSections;
}
