// Branded types so we don't accidentally pass a row id where a group id is expected.
export type RowId = string & { readonly __brand: 'RowId' };
export type GroupId = string & { readonly __brand: 'GroupId' };

export type Align = 'left' | 'center' | 'right';

export interface PlainText {
  text: string;
  align?: Align;
}

// ProseMirror doc JSON — opaque shape from PM. Rich-text rows use this.
export type ProseMirrorDocJSON = {
  type: 'doc';
  content: unknown[];
};

export type ContactItem =
  | { type: 'text'; value: string }
  | { type: 'link'; label: string; url: string };

export type RichText = ProseMirrorDocJSON;

export type RowKind =
  | 'header.name'
  | 'header.contact'
  | 'section.heading'
  | 'entry.title'
  | 'entry.meta'
  | 'plain'
  | 'bullet';

// Per-row text alignment. Applies to the row's content; lives at the row level
// in the v3 doc shape and as a PM node attr in the editor. Round-trips to v2's
// `alignments[fieldKey]` map via v2Adapter.
export type ResumeRow =
  | { id: RowId; kind: 'header.name';     content: PlainText;   align?: Align }
  | { id: RowId; kind: 'header.contact';  content: ContactItem; align?: Align }
  | { id: RowId; kind: 'section.heading'; content: PlainText;   align?: Align; semanticGroupId: GroupId }
  | { id: RowId; kind: 'entry.title';     content: PlainText;   align?: Align; semanticGroupId: GroupId }
  | { id: RowId; kind: 'entry.meta';      content: PlainText;   align?: Align; semanticGroupId: GroupId }
  | { id: RowId; kind: 'plain';           content: RichText;    align?: Align; semanticGroupId?: GroupId }
  | { id: RowId; kind: 'bullet';          content: RichText;    align?: Align; semanticGroupId?: GroupId };

export type SectionRole =
  | 'experience' | 'education' | 'skills' | 'projects'
  | 'awards' | 'publications' | 'volunteer' | 'summary' | 'custom';

export type SemanticGroup =
  | { id: GroupId; kind: 'section'; role: SectionRole; label?: string }
  | { id: GroupId; kind: 'entry';   parentSectionGroupId?: GroupId };

export interface ResumeDocV3 {
  schemaVersion: 3;
  rows: ResumeRow[];
  groups: SemanticGroup[];
}

// GroupOp — operations on the GroupsPlugin state, applied via PM transaction meta.
export type GroupOp =
  | { type: 'create'; group: SemanticGroup }
  | { type: 'delete'; groupId: GroupId }
  | { type: 'updateRole';   groupId: GroupId; role: SectionRole; label?: string }
  | { type: 'updateParent'; groupId: GroupId; parentSectionGroupId?: GroupId };
