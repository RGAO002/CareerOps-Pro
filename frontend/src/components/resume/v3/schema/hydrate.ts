import type { Schema } from '@tiptap/pm/model';
import type { GroupsState } from '../plugins/GroupOps';
import type { ResumeDocV3, ResumeRow } from './types';

export function hydrateInitialState(doc: ResumeDocV3, schema: Schema): { docJSON: unknown; groups: GroupsState } {
  // Build PM doc JSON from rows.
  const content = doc.rows.map((row) => rowToPMNodeJSON(row, schema));
  const docJSON = { type: 'doc', content };

  // Build groups state.
  const groups: GroupsState = { byId: new Map(doc.groups.map((g) => [g.id, g])) };
  return { docJSON, groups };
}

export function rowToPMNodeJSON(row: ResumeRow, schema: Schema) {
  const attrs: Record<string, unknown> = { id: row.id };
  if ('semanticGroupId' in row && row.semanticGroupId) attrs.semanticGroupId = row.semanticGroupId;
  // align — per-row text alignment. Pulled from row.align (v2 alignments map
  // round-trip lives in v2Adapter); for plain-text rows we also accept
  // legacy row.content.align below.
  if (row.align) attrs.align = row.align;

  // The PM node type name is derived from kind (e.g. 'header.name' → 'header_name').
  const nodeName = row.kind.replace('.', '_');
  if (!schema.nodes[nodeName]) throw new Error(`Unknown row kind: ${row.kind} (PM node ${nodeName})`);

  let content: unknown[];
  if (row.kind === 'plain' || row.kind === 'bullet') {
    // RichText is persisted as { type:'doc', content:[{type:'paragraph',content:[inline...]}, ...] }.
    // The PM `plain` / `bullet` row has `content: 'inline*'` (no paragraph wrapper allowed inside).
    // Adapter UNWRAPS: extract inline content from each paragraph child of the persisted doc,
    // concatenate them into the row's inline content. Multi-paragraph persisted content is
    // flattened with no separator (or insert a hardBreak mark if you want to preserve breaks).
    const docContent = (row.content.content as { type: string; content?: unknown[] }[]) ?? [];
    const inline: unknown[] = [];
    for (const child of docContent) {
      if (child.type === 'paragraph' && child.content) {
        inline.push(...child.content);
      } else if (child.type === 'text') {
        inline.push(child);   // tolerate persisted shape without paragraph wrapper
      }
    }
    content = inline;   // empty inline ([]) is valid for `inline*`
  } else if (row.kind === 'header.contact') {
    const c = row.content;
    const text = c.type === 'text' ? c.value : c.label;
    content = text ? [{ type: 'text', text }] : [];
    if (c.type === 'link') attrs.linkUrl = c.url;     // PM mark; M3 will refine
  } else {
    content = row.content.text ? [{ type: 'text', text: row.content.text }] : [];
    if ('align' in row.content && row.content.align) attrs.align = row.content.align;
  }
  return { type: nodeName, attrs, content };
}
