# api/models/resume.py
"""Pydantic models for the Resume Editor v1 API."""
from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field


SnapshotTrigger = Literal["auto", "manual_save", "ai_edit", "checkpoint"]


class ResumeMeta(BaseModel):
    """Metadata about a resume — everything except the doc content."""
    id: str
    user_id: str = "current-user"  # single-user assumption in v1
    parent_id: Optional[str] = None
    is_base: bool = True
    title: str
    schema_version: int = 1
    created_at: int  # epoch ms
    updated_at: int

    # Tailoring context
    target_company: Optional[str] = None
    target_company_domain: Optional[str] = None
    target_role: Optional[str] = None

    # Data strategy (PRODUCT_NOTES §4)
    is_user_consented_for_benchmark: bool = False


class Resume(ResumeMeta):
    """Full resume record: meta + doc."""
    doc: dict[str, Any] = Field(default_factory=lambda: {"type": "doc", "content": []})


class ResumeSnapshot(BaseModel):
    """One historical snapshot of a resume."""
    id: str
    resume_id: str
    created_at: int
    trigger: SnapshotTrigger
    label: Optional[str] = None
    ai_message_id: Optional[str] = None
    diff_summary: Optional[str] = None
    doc: dict[str, Any]


class ToolCall(BaseModel):
    """One AI tool invocation. Designed to be batched (PRODUCT_NOTES §13)."""
    name: str  # e.g. "rewrite_bullet"
    arguments: dict[str, Any]


class ToolResult(BaseModel):
    """Result of one tool call."""
    name: str
    success: bool
    data: Optional[dict[str, Any]] = None
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Resume v2 schema (additive — keep v1 Resume model intact for back-compat).
#
# v2 replaces the freeform ProseMirror `doc` blob with a typed domain model:
#   ResumeV2 -> { header, sections[ -> entries[ -> bullets[ ProseMirrorDoc ] ] ] }
# Bullets still carry ProseMirror content for inline rich text, but everything
# above bullet level is structured. See docs for the migration story.
# ---------------------------------------------------------------------------


class ContactItemText(BaseModel):
    type: Literal["text"]
    value: str


class ContactItemLink(BaseModel):
    type: Literal["link"]
    label: str
    url: str


ContactItem = Union[ContactItemText, ContactItemLink]


class HeaderBlockV2(BaseModel):
    id: str
    name: str
    contact_lines: List[ContactItem] = Field(default_factory=list)


class BulletBlockV2(BaseModel):
    id: str
    content: dict[str, Any]  # ProseMirrorBulletDoc — structure enforced by frontend
    # 'bullet' (or None, the back-compat default) renders the standard marker;
    # 'plain' suppresses it. Notion-style Backspace on an empty bullet flips
    # 'bullet' → 'plain' as an outdent step before deletion. Stored as Optional
    # so legacy v2 docs (kind absent) still parse cleanly and serialize back
    # without a kind field.
    kind: Optional[Literal["bullet", "plain"]] = None
    tags: Optional[List[str]] = None
    evidence_refs: Optional[List[str]] = None


class EntryBlockV2(BaseModel):
    id: str
    title: str = ""
    meta: str = ""
    bullets: List[BulletBlockV2] = Field(default_factory=list)


SectionRole = Literal[
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
    "awards",
    "publications",
    "custom",
]


class SectionBlockV2(BaseModel):
    id: str
    role: SectionRole
    heading: str = ""
    entries: List[EntryBlockV2] = Field(default_factory=list)


class ResumeMetadataV2(BaseModel):
    created_at: str
    updated_at: str
    target_company: Optional[str] = None
    target_role: Optional[str] = None
    parent_id: Optional[str] = None


class ResumeV2(BaseModel):
    schema_version: Literal[2] = 2
    id: str
    title: str
    template_id: str = "minimal-single-column"
    header: HeaderBlockV2
    sections: List[SectionBlockV2] = Field(default_factory=list)
    metadata: ResumeMetadataV2
    # Per-field alignment for single-line fields. Keys are serialized
    # EditableField identifiers (e.g. "header.name", "section.heading:{id}").
    # Values are 'left' | 'center' | 'right' — but stored loosely as str so
    # additional alignment values can be added later without a migration.
    # Bullet alignment lives inside each bullet's ProseMirror doc, not here.
    alignments: Optional[Dict[str, str]] = None
