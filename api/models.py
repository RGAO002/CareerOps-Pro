"""
Pydantic request/response schemas for the API.
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ── Resume ──────────────────────────────────────────────

class ResumeOut(BaseModel):
    id: str
    name: str
    role: str = ""
    filename: str
    resume_data: dict
    created_at: str
    updated_at: str


class ResumeListItem(BaseModel):
    id: str
    name: str
    role: str = ""
    filename: str
    created_at: str
    updated_at: str


# ── Jobs ────────────────────────────────────────────────

class JobCreate(BaseModel):
    company: str
    title: str
    location: str = ""
    work_type: str = ""
    url: str = ""
    jd_summary: str = ""
    jd_text: str = ""
    requirements: list = Field(default_factory=list)
    match_score: int = 0
    gaps: list = Field(default_factory=list)
    tailoring_tips: list = Field(default_factory=list)
    status: str = "to_tailor"
    notes: str = ""
    resume_id: Optional[str] = None


class JobUpdate(BaseModel):
    company: Optional[str] = None
    title: Optional[str] = None
    location: Optional[str] = None
    work_type: Optional[str] = None
    url: Optional[str] = None
    jd_summary: Optional[str] = None
    jd_text: Optional[str] = None
    requirements: Optional[list] = None
    match_score: Optional[int] = None
    gaps: Optional[list] = None
    tailoring_tips: Optional[list] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    resume_id: Optional[str] = None


class JobOut(BaseModel):
    id: str
    resume_id: Optional[str] = None
    company: str
    title: str
    location: str = ""
    work_type: str = ""
    url: str = ""
    jd_summary: str = ""
    jd_text: str = ""
    requirements: list = Field(default_factory=list)
    match_score: int = 0
    gaps: list = Field(default_factory=list)
    tailoring_tips: list = Field(default_factory=list)
    status: str = "to_tailor"
    notes: str = ""
    created_at: str
    updated_at: str


# ── Tailored Resume ────────────────────────────────────

class TailoredResumeOut(BaseModel):
    id: str
    job_id: str
    resume_id: str
    tailored_data: dict
    changes_summary: str = ""
    status: str = "pending"
    error: Optional[str] = None
    created_at: str


# ── Batch Tailor ────────────────────────────────────────

class BatchTailorRequest(BaseModel):
    resume_id: str
    job_ids: list[str]
    model_choice: str = "gpt-4o"
    api_key: Optional[str] = None
    user_instructions: str = ""


# ── Chat / Natural Language ─────────────────────────────

class ChatCommand(BaseModel):
    message: str
    resume_id: Optional[str] = None
    model_choice: str = "gpt-4o"
    api_key: Optional[str] = None


# ── Job from URL/Text ───────────────────────────────────

class JobFromURL(BaseModel):
    url: str
    resume_id: Optional[str] = None
    model_choice: str = "gpt-4o"
    api_key: Optional[str] = None


class JobFromText(BaseModel):
    jd_text: str
    resume_id: Optional[str] = None
    model_choice: str = "gpt-4o"
    api_key: Optional[str] = None


class JobSearchRequest(BaseModel):
    query: str
    resume_id: Optional[str] = None
    model_choice: str = "gpt-4o"
    api_key: Optional[str] = None
    max_results: int = 8


# ── Public Jobs (NYC H1B pool) ──────────────────────────

class PublicCompanySummary(BaseModel):
    id: int
    slug: str
    display_name: str
    industry: str = ""
    is_bodyshop: bool = False
    h1b_lca_count_1y: int = 0
    h1b_lca_count_3y: int = 0
    hq_city: str = ""
    hq_state: str = ""


class PublicJobListItem(BaseModel):
    id: int
    title: str
    company: PublicCompanySummary
    location_raw: str = ""
    location_tier: str = ""
    work_type: str = ""
    department: str = ""
    employment_type: str = ""
    apply_url: str
    posted_at: Optional[str] = None
    first_seen_at: Optional[str] = None
    last_seen_at: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    salary_currency: str = "USD"
    description_preview: str = ""
    source: str = ""
    # Newly extracted fields — surface to the UI for badges/filters.
    level: str = ""
    years_min: Optional[int] = None
    sponsorship_signal: str = ""


class PublicJobDetail(PublicJobListItem):
    description_html: str = ""
    description_text: str = ""
    requirements: list = Field(default_factory=list)


class PublicJobsResponse(BaseModel):
    total: int
    offset: int
    limit: int
    jobs: list[PublicJobListItem]


class PublicStats(BaseModel):
    total_active_jobs: int
    total_nyc_jobs: int
    total_companies: int
    last_refresh_at: Optional[str] = None
    jobs_posted_last_7d: int = 0
    tier_counts: dict = Field(default_factory=dict)


class TrackPublicJobRequest(BaseModel):
    resume_id: Optional[str] = None


class ReportListingRequest(BaseModel):
    reason: str
    note: Optional[str] = None


# ── Matching ───────────────────────────────────────────

class MatchPreferences(BaseModel):
    """Optional filters that hard-prune the candidate pool before vector search.

    All fields are optional; missing fields apply no filter on that dimension.
    """
    levels: Optional[list[str]] = None              # intern|new_grad|junior|mid|senior|staff|principal
    location_tiers: Optional[list[str]] = None      # nyc_core|nj_close|ny_suburb|remote_nyc_hq
    work_types: Optional[list[str]] = None          # hybrid|remote|onsite
    needs_sponsorship: bool = False
    only_with_jd: bool = False
    exclude_companies: Optional[list[str]] = None


class MatchRequest(BaseModel):
    resume_id: str
    preferences: Optional[MatchPreferences] = None
    top_k: int = Field(default=20, ge=1, le=100)


class MatchScoreParts(BaseModel):
    cosine: float
    skill: float
    sponsor: float
    recency: float


class MatchResultItem(BaseModel):
    id: int
    title: str
    company: str
    industry: str = ""
    location: str = ""
    location_tier: str = ""
    level: str = ""
    work_type: str = ""
    sponsorship_signal: str = ""
    apply_url: str = ""
    posted_at: Optional[str] = None
    h1b_lca_count_3y: int = 0
    uscis_h1b_approvals_3y: int = 0
    uscis_h1b_approvals_1y: int = 0
    has_jd: bool = False
    score: float
    score_parts: MatchScoreParts
    reasons: list[str] = Field(default_factory=list)


class MatchResponse(BaseModel):
    results: list[MatchResultItem]
    pool_size: int   # how many jobs passed the hard filter
