"""Pydantic models for People Search."""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class ParsedCriteria(BaseModel):
    """Structured criteria extracted from a free-form query."""

    gender: Optional[str] = None  # "male" | "female" | None
    age_min: Optional[int] = None
    age_max: Optional[int] = None
    schools: list[str] = Field(default_factory=list)        # e.g. ["北京四中"]
    employers_past: list[str] = Field(default_factory=list)  # e.g. ["Amazon"]
    employers_current: list[str] = Field(default_factory=list)
    roles: list[str] = Field(default_factory=list)           # e.g. ["backend engineer", "founder"]
    location_hints: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)        # any extra signal
    raw_query: str = ""


class Evidence(BaseModel):
    """One source snippet that supports a candidate."""

    source: str              # "duckduckgo" | "github" | "web"
    url: str
    title: str = ""
    snippet: str = ""


class Candidate(BaseModel):
    """A ranked candidate person."""

    name: str
    headline: Optional[str] = None         # e.g. "Founder @ X · ex-Amazon"
    confidence: int = 0                    # 0-100
    reasoning: str = ""                    # why we think this is them
    profile_links: dict[str, str] = Field(default_factory=dict)
    # ^ {"linkedin": "...", "github": "...", "twitter": "...", "website": "..."}
    emails: list[str] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)


class SearchResponse(BaseModel):
    """Top-level response shape returned to the frontend."""

    query: str
    parsed: ParsedCriteria
    candidates: list[Candidate]
    stats: dict
