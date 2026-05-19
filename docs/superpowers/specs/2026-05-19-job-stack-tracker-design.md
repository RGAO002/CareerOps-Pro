# Job Stack + Tracker — Design Spec
_2026-05-19_

## Goal

Replace the post-upload flow with a single focused workflow:

```
Landing (/) → upload PDF → /jobs?from_upload=1&resume={id}  [Job Stack]
                                        ↓ "Save N to Tracker"
                                     /tracker               [Tracker]
                                        ↓ "Editor →"
                             /resume/{id}?job={jobId}       [Editor]
```

Design principle: one decision per screen, no distractions, no sidebar.

---

## Architecture decisions (Plan A)

- Replace `/jobs` content entirely — no Sidebar, no Assistant overlay.
- New `/tracker` route (standalone, no sidebar).
- `LandingHero` upload callback redirects to `/jobs?from_upload=1&resume={id}` instead of staying on homepage Dashboard.
- `PdfUploader` (at `/upload`) redirects to `/jobs?from_upload=1&resume={id}` instead of `/resume/{id}`.

---

## Files to create

| Path | Purpose |
|---|---|
| `frontend/src/app/tracker/page.tsx` | Tracker route (server shell) |
| `frontend/src/components/jobs/JobStackPage.tsx` | Full Job Stack page |
| `frontend/src/components/jobs/JobRow.tsx` | Single row component |
| `frontend/src/components/jobs/ResumeThumb.tsx` | 148px tailored resume mini-doc |
| `frontend/src/components/tracker/TrackerPage.tsx` | Full Tracker page |
| `frontend/src/components/tracker/TrackerRow.tsx` | Single tracker row |
| `frontend/src/components/tracker/MiniDoc.tsx` | Resume preview (small + large popout) |
| `frontend/src/components/tracker/StatusMenu.tsx` | Editable status dropdown |

---

## Files to modify

| Path | Change |
|---|---|
| `frontend/src/components/jobs/JobsShell.tsx` | Remove Sidebar/Assistant, render `JobStackPage` |
| `frontend/src/components/landing/LandingHero.tsx` | After parse, `router.push('/jobs?from_upload=1&resume={id}')` |
| `frontend/src/components/upload/PdfUploader.tsx` | Change redirect to `/jobs?from_upload=1&resume={id}` |

---

## Job Stack page anatomy

**Top bar (56px):** Logo + "CareerOps Pro" wordmark. Right: ghost "Re-upload" button.

**Stepper band:** Upload ✓ → **Choose role** → Refine & send. 48px circles, terracotta for current with pulse ring.

**Page header:**
- `READY TO APPLY` badge (green glow dot)
- H1: `We found {N} roles for you, and tailored your resume for each.` (Instrument Serif italic)
- Source resume pill (top-right)

**Job list (max-width 1100, single rounded card):**
Each row (~110px): left tier strip (hover) · logo (36px) · job info · Apply pill · tier+match ring · ResumeThumb (148px).

**Bottom CTA:** Terracotta gradient "Save {N} to Tracker" button with pulse + shimmer animation.

**Entrance animation (from_upload=1):** Header fade-up → rows cascade (60ms stagger) → CTA fade-up at 1.2s.

---

## Tracker page anatomy

**Top bar:** Logo + "Tracker" breadcrumb + "Add application" button.

**Header:** "Tracker" h1 + 4-stat strip (In play · Response % · Drafted · Top match).

**Filter tabs:** All · Saved · Applied · Interview · Offer · Rejected (status dot + count). Right: Sort dropdown.

**Table grid:** `34px 1.4fr 0.95fr 1.0fr 70px 78px 64px`
Columns: Logo · Role · Status (editable) · Next action · Apply · Editor → · Resume

**Status column:** Click → dropdown (5 statuses, color-coded), updates local state.

**Resume column (rightmost):** 50×65 thumbnail → hover reveals fixed-position 300×388 popout to the LEFT (z-index 9999, escapes scroll clipping).

**Editor button:** Ghost hairline → black solid on hover.

**Stale rows:** 2px amber left strip on rows with `stale=true`.

---

## Design tokens (add to globals.css if missing)

```css
--bg: oklch(0.97 0.008 55);
--paper: oklch(0.99 0.005 55);
--paper-pure: #fefefe;
--surface-1: oklch(0.96 0.010 50);
--surface-2: oklch(0.94 0.012 48);
--border: oklch(0.90 0.008 50);
--border-strong: oklch(0.85 0.010 50);
--foreground: oklch(0.20 0.020 45);
--muted-foreground: oklch(0.48 0.012 50);
--subtle-foreground: oklch(0.62 0.010 55);
--terracotta: oklch(0.62 0.13 38);
--terracotta-deep: oklch(0.50 0.14 35);
--positive: oklch(0.55 0.12 150);
--warn: oklch(0.65 0.13 70);
--recruit: oklch(0.62 0.14 32);
--hm: oklch(0.55 0.14 150);
--coach: oklch(0.55 0.12 260);
--ease-expo: cubic-bezier(0.2, 0.8, 0.2, 1);
```

---

## Keyframe animations (add to globals.css)

```css
@keyframes row-in { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:none } }
@keyframes fade-up { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:none } }
@keyframes step-ring { 0%,100% { transform:scale(1); opacity:0.35 } 50% { transform:scale(1.15); opacity:0.18 } }
@keyframes cta-pulse { 0%,100% { box-shadow:0 8px 28px oklch(0.62 0.13 38/0.55),0 1px 0 oklch(1 0 0/0.20) inset } 50% { box-shadow:0 12px 40px oklch(0.62 0.13 38/0.75),0 0 0 6px oklch(0.62 0.13 38/0.15),0 1px 0 oklch(1 0 0/0.20) inset } }
@keyframes cta-shimmer { 0% { left:-50% } 100% { left:140% } }
@keyframes thumb-pop { from { opacity:0; transform:scale(0.92) } to { opacity:1; transform:none } }
@keyframes pulse-dot { 0%,100% { opacity:1 } 50% { opacity:0.35 } }
```

---

## API wiring

- **Job Stack**: `useJobMatchStore.fetch(resumeId)` → `POST /api/jobs/match`. Falls back to mock data on error.
- **Tracker**: `GET /api/tracker/board` for rows. `PUT /api/tracker/status/{job_id}` for status updates.
- **Resume thumbnail**: `GET /api/tailor/result/{job_id}/thumbnail` — falls back to in-JSX mini-doc render if unavailable.

---

## Implementation order

1. CSS tokens + keyframes → `globals.css`
2. `ResumeThumb` component
3. `JobRow` (reuse existing `MatchRing`)
4. `JobStackPage` (assemble + stepper + CTA)
5. Swap `JobsShell` (remove sidebar)
6. `LandingHero` redirect
7. `PdfUploader` redirect
8. `MiniDoc` + `StatusMenu`
9. `TrackerRow` + `TrackerPage`
10. `/tracker` route
