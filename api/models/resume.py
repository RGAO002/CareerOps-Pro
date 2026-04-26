# api/models/resume.py
"""Pydantic models for the Resume Editor v1 API."""
from typing import Any, Literal, Optional
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
