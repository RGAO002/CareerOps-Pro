"""Pydantic models for the v3 resume schema.

Mirrors the frontend TypeScript types in
`frontend/src/components/resume/v3/schema/types.ts`. v3 is a flat row list
plus a separate semantic groups list — see spec
`docs/superpowers/specs/2026-05-02-v3-only-resume-design.md`.
"""
from typing import Annotated, Any, List, Literal, Optional, Union

from pydantic import BaseModel, Field


# ---------- content shapes ----------

class PlainText(BaseModel):
    text: str
    align: Optional[Literal["left", "center", "right"]] = None


class ContactItemText(BaseModel):
    type: Literal["text"]
    value: str


class ContactItemLink(BaseModel):
    type: Literal["link"]
    label: str
    url: str


ContactItem = Annotated[
    Union[ContactItemText, ContactItemLink],
    Field(discriminator="type"),
]


# RichText is a ProseMirror doc JSON. We keep it loose (`dict[str, Any]`)
# because the inline content is determined by the PM schema and may evolve
# independently of this validator.
RichText = dict[str, Any]


# ---------- rows ----------

class HeaderNameRow(BaseModel):
    id: str
    kind: Literal["header.name"]
    content: PlainText
    align: Optional[Literal["left", "center", "right"]] = None


class HeaderContactRow(BaseModel):
    id: str
    kind: Literal["header.contact"]
    content: ContactItem
    align: Optional[Literal["left", "center", "right"]] = None


class SectionHeadingRow(BaseModel):
    id: str
    kind: Literal["section.heading"]
    content: PlainText
    align: Optional[Literal["left", "center", "right"]] = None
    semanticGroupId: str


class EntryTitleRow(BaseModel):
    id: str
    kind: Literal["entry.title"]
    content: PlainText
    align: Optional[Literal["left", "center", "right"]] = None
    semanticGroupId: str


class EntryMetaRow(BaseModel):
    id: str
    kind: Literal["entry.meta"]
    content: PlainText
    align: Optional[Literal["left", "center", "right"]] = None
    semanticGroupId: str


class PlainRow(BaseModel):
    id: str
    kind: Literal["plain"]
    content: RichText
    align: Optional[Literal["left", "center", "right"]] = None
    # NOTE: spec § 2.2 — plain rows may carry semanticGroupId for
    # backward compat, but the runtime treats it as null and computes
    # effectiveGid lazily. We accept either presence or absence.
    semanticGroupId: Optional[str] = None


class BulletRow(BaseModel):
    id: str
    kind: Literal["bullet"]
    content: RichText
    align: Optional[Literal["left", "center", "right"]] = None
    semanticGroupId: Optional[str] = None


ResumeRow = Annotated[
    Union[
        HeaderNameRow,
        HeaderContactRow,
        SectionHeadingRow,
        EntryTitleRow,
        EntryMetaRow,
        PlainRow,
        BulletRow,
    ],
    Field(discriminator="kind"),
]


# ---------- groups ----------

SectionRoleV3 = Literal[
    "experience", "education", "skills", "projects",
    "awards", "publications", "volunteer", "summary", "custom",
]


class SectionGroup(BaseModel):
    id: str
    kind: Literal["section"]
    role: SectionRoleV3
    label: Optional[str] = None


class EntryGroup(BaseModel):
    id: str
    kind: Literal["entry"]
    parentSectionGroupId: Optional[str] = None


SemanticGroup = Annotated[
    Union[SectionGroup, EntryGroup],
    Field(discriminator="kind"),
]


# ---------- top-level doc ----------

class ResumeMetadataV3(BaseModel):
    created_at: str
    updated_at: str
    target_company: Optional[str] = None
    target_role: Optional[str] = None
    parent_id: Optional[str] = None


class ResumeV3(BaseModel):
    schema_version: Literal[3] = 3
    id: str
    title: str
    template_id: str = "minimal-single-column"
    rows: List[ResumeRow] = Field(default_factory=list)
    groups: List[SemanticGroup] = Field(default_factory=list)
    metadata: ResumeMetadataV3
    # Per-row alignments may also live at row.align; this map is for
    # back-compat with v2 alignments[fieldKey] consumers.
    alignments: Optional[dict[str, str]] = None
