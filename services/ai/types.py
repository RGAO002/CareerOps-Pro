"""Suggestion + run-state TypedDicts mirroring spec § 5.1.

Discriminated union on `op` field. `before`/`after` payload differs per op so
concurrency checks have what they need (parent's children-id list for
insert/delete/move, not just the affected block).
"""
from __future__ import annotations
from typing import Literal, TypedDict, Union, Optional

# ----- Block / Field -------------------------------------------------------

BlockId = str
TipTapDoc = dict  # passthrough; v2 uses ProseMirror-shape JSON


class FieldHeaderName(TypedDict):
    kind: Literal["header.name"]


class FieldHeaderContact(TypedDict):
    kind: Literal["header.contact"]
    index: int


class FieldSectionHeading(TypedDict):
    kind: Literal["section.heading"]
    id: BlockId


class FieldEntryTitle(TypedDict):
    kind: Literal["entry.title"]
    id: BlockId


class FieldEntryMeta(TypedDict):
    kind: Literal["entry.meta"]
    id: BlockId


class FieldBulletContent(TypedDict):
    kind: Literal["bullet.content"]
    id: BlockId


EditableField = Union[
    FieldHeaderName, FieldHeaderContact, FieldSectionHeading,
    FieldEntryTitle, FieldEntryMeta, FieldBulletContent,
]

# bullet content is TipTapDoc; everything else is plain string
BlockContent = Union[TipTapDoc, str]


class BulletSnapshot(TypedDict):
    kind: Literal["bullet"]
    id: BlockId
    content: TipTapDoc


class EntrySnapshot(TypedDict):
    kind: Literal["entry"]
    id: BlockId
    title: str
    meta: str
    bullets: list  # list[BulletSnapshot]


class SectionSnapshot(TypedDict):
    kind: Literal["section"]
    id: BlockId
    heading: str
    role: str
    entries: list  # list[EntrySnapshot]


BlockSnapshot = Union[BulletSnapshot, EntrySnapshot, SectionSnapshot]

# ----- Suggestion variants -------------------------------------------------

SuggestionStatus = Literal[
    "streaming", "pending", "accepted", "rejected", "superseded",
]


class _SuggestionBase(TypedDict, total=False):
    id: str
    runId: str
    agentId: str
    resumeId: str
    status: SuggestionStatus
    createdAt: int
    appliedAt: Optional[int]
    rejectedAt: Optional[int]
    supersededAt: Optional[int]
    source: dict


class UpdateSuggestion(_SuggestionBase):
    op: Literal["update"]
    field: EditableField
    before: BlockContent
    after: BlockContent


class InsertSuggestion(_SuggestionBase):
    op: Literal["insert"]
    parentId: BlockId
    atIndex: int
    beforeChildIds: list  # list[BlockId]
    insertedBlock: BlockSnapshot


class DeleteSuggestion(_SuggestionBase):
    op: Literal["delete"]
    parentId: BlockId
    blockId: BlockId
    beforeChildIds: list
    deletedBlock: BlockSnapshot


class MoveSuggestion(_SuggestionBase):
    op: Literal["move"]
    blockId: BlockId
    fromParentId: BlockId
    fromIndex: int
    fromBeforeChildIds: list
    toParentId: BlockId
    toIndex: int
    toBeforeChildIds: list


Suggestion = Union[UpdateSuggestion, InsertSuggestion, DeleteSuggestion, MoveSuggestion]
