// Tags `.row` elements under a v3 canvas root with
// `data-template-col="sidebar" | "main"` based on each row's effective gid
// → group → section role. Used by the Fullstack template's two-column
// layout. CSS in templates/fullstack.css consumes the attribute via
// `[data-template-col=...]` selectors.
//
// Caveat: this is an experimental two-column attempt on top of a v3
// schema that fundamentally describes a single-column row stream. It
// breaks the PaginationPlugin (which assumes vertical accumulation) and
// reorders content visually without touching the source order. Useful
// for "let me see what it looks like" — not production-ready.

import type { EditorView } from '@tiptap/pm/view';
import { effectiveGidsFromState } from '../schema/effectiveGid';
import { groupsPluginKey } from '../plugins/GroupsPlugin';

/** Section roles that should be placed in the LEFT sidebar. */
const SIDEBAR_ROLES = new Set(['skills', 'education', 'awards', 'publications']);

export function applyTemplateColumns(view: EditorView, enabled: boolean): void {
  const rowEls = Array.from(
    view.dom.querySelectorAll<HTMLElement>(':scope > div > .row'),
  );
  if (!enabled) {
    for (const el of rowEls) el.removeAttribute('data-template-col');
    return;
  }

  const groupsState = groupsPluginKey.getState(view.state);
  const effGids = effectiveGidsFromState(view.state);

  for (let i = 0; i < rowEls.length; i++) {
    const el = rowEls[i];
    const kind = el.getAttribute('data-row-kind') ?? '';

    // Headers always go to the sidebar (Fullstack-style).
    if (kind === 'header.name' || kind === 'header.contact') {
      el.setAttribute('data-template-col', 'sidebar');
      continue;
    }

    // Resolve this row's section role:
    //   - section.heading: stored gid points at section group → role
    //   - everything else: effective gid → group; if entry → look up
    //     parent section group → role. If section directly → role.
    const gid = effGids[i] ?? null;
    let role: string | null = null;
    if (gid && groupsState) {
      const grp = groupsState.byId.get(gid as never);
      if (grp) {
        if (grp.kind === 'section') {
          role = grp.role;
        } else if (grp.kind === 'entry' && grp.parentSectionGroupId) {
          const parent = groupsState.byId.get(grp.parentSectionGroupId);
          if (parent && parent.kind === 'section') role = parent.role;
        }
      }
    }

    if (role && SIDEBAR_ROLES.has(role)) {
      el.setAttribute('data-template-col', 'sidebar');
    } else {
      el.setAttribute('data-template-col', 'main');
    }
  }
}
