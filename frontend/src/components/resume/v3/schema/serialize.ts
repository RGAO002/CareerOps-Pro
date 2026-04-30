import type { EditorState } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { groupsPluginKey } from '../plugins/GroupsPlugin';
import { gcUnreferencedGroups } from '../plugins/GroupOps';
import type { GroupId, ResumeDocV3, ResumeRow, RowId, SemanticGroup } from './types';

export function serializeEditorState(state: EditorState): ResumeDocV3 {
  const rows: ResumeRow[] = [];
  const referencedGroupIds = new Set<GroupId>();
  state.doc.forEach((node) => {
    rows.push(pmNodeToRow(node));
    const gid = node.attrs.semanticGroupId as GroupId | undefined;
    if (gid) referencedGroupIds.add(gid);
  });

  // Save-time GC. Plugin state is monotonic-grow / orphan-tolerant during a
  // session; serialization is the ONLY GC point so persisted JSON stays clean.
  // Walk groups, also expand parentSectionGroupId references (an entry's parent
  // section group must be kept even if no row directly references it via
  // semanticGroupId — but in this v3 model section groups ARE always directly
  // referenced by their section.heading row, so this is mostly defensive).
  const groupsState = groupsPluginKey.getState(state) ?? { byId: new Map() };
  const gcedState = gcUnreferencedGroups(groupsState, referencedGroupIds);
  // After GC, also clear dangling parentSectionGroupId on entry groups
  // whose parent section was GC'd. (gcUnreferencedGroups already does this.)
  const groups: SemanticGroup[] = Array.from(gcedState.byId.values());

  return { schemaVersion: 3, rows, groups };
}

function pmNodeToRow(node: PMNode): ResumeRow {
  const kind = node.type.name.replace('_', '.') as ResumeRow['kind'];
  const id = node.attrs.id as RowId;
  const semanticGroupId = (node.attrs.semanticGroupId ?? undefined) as GroupId | undefined;

  if (kind === 'plain' || kind === 'bullet') {
    // The PM row has `content: 'inline*'` (raw inline children, no paragraph wrapper).
    // For persisted RichText, we synthesize a {type:'doc', content:[{type:'paragraph', content: inline}]}
    // wrapper so the persisted JSON is a valid ProseMirror doc and is portable across
    // different content rules (e.g. clipboard, AI prompt context, future schemas).
    // Empty inline content persists as { type:'doc', content: [] } (no paragraph) to keep
    // round-trip byte-identical with the empty-row input shape from hydrateInitialState.
    const inline = node.content.toJSON() as unknown[];
    const persisted = inline.length === 0
      ? []
      : [{ type: 'paragraph', content: inline }];
    return {
      id,
      kind,
      content: { type: 'doc', content: persisted },
      ...(semanticGroupId ? { semanticGroupId } : {}),
    } as ResumeRow;
  }
  if (kind === 'header.contact') {
    const text = node.textContent;
    const linkUrl = node.attrs.linkUrl as string | undefined;
    const content = linkUrl ? { type: 'link' as const, label: text, url: linkUrl } : { type: 'text' as const, value: text };
    return { id, kind, content };
  }
  // Plain-text kinds.
  const text = node.textContent;
  const align = node.attrs.align as ResumeRow extends { content: { align?: infer A } } ? A : undefined;
  const base: { text: string; align?: typeof align } = { text };
  if (align) base.align = align;
  return { id, kind, content: base, ...(semanticGroupId ? { semanticGroupId } : {}) } as ResumeRow;
}
