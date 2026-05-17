"""
Role-family filter — decides whether a job belongs in the target pool.

Target audience: international students (need work visa sponsorship) looking
for entry-to-mid software / data / product / design roles in North America.

Algorithm (priority order — first match wins):
    1. Title DROP keyword     → drop  (e.g. "Sales Engineer" caught here)
    2. Title KEEP_SPECIFIC    → keep  (e.g. "Software Engineering, Customer Success"
                                       — overrides dept-drop because title is unambiguous)
    3. Department DROP keyword → drop (e.g. anything in dept "Sales", "Finance", "People")
    4. Title KEEP_GENERIC     → keep  (catch-alls: "engineer", "developer", etc.)
    5. Otherwise              → drop  (no signal — be conservative, keep pool clean)

Why two KEEP tiers:
    KEEP_SPECIFIC contains compound terms that uniquely identify a target role
    ("software engineer", "data scientist"). When such a term appears in the
    title, we can trust it overrides any dept-level drop signal — sometimes
    real SWE roles live in "Customer Success" or "Cloud Operations" depts.
    KEEP_GENERIC is just "engineer", "developer", etc. — too broad to override
    a dept-drop, since "Sales Engineer" / "Operations Manager" would slip in.

Implementation:
    - Substring match (case-insensitive). Listed keywords are verbose enough
      to avoid false hits.
    - Greenhouse departments sometimes carry a numeric prefix
      ("112 Order Fulfillment"); we strip it before matching.

Audit hooks:
    `evaluate(title, department)` returns (keep, reason) so a dry-run pruner
    can report exactly which keyword fired on each row.
"""
from __future__ import annotations

import re

# ────────────────────────────────────────────────────────────────────
# DROP — anything matching here is rejected, regardless of KEEP hits.
# Listed keywords must be specific enough that an exact substring match
# (case-insensitive) won't trip on a legitimate target role.
# ────────────────────────────────────────────────────────────────────

DROP_TITLE_KEYWORDS = (
    # Healthcare / clinical
    "physician", "nurse practitioner", "np/pa", "registered nurse",
    "rn ", " rn,", "therapist", "clinician", "pharmacist",
    "dental", "medical assistant", "phlebotomist", "physical therapy",
    "physician assistant", "pa - ", "ma - ",
    # Sales / GTM (cover the long tail of titles)
    "sales", "account executive", "account manager",
    "business development", "bdr ", " bdr", "sdr ", " sdr",
    "customer success", "customer service",
    "sales development", "outside sales", "inside sales", "channel partner",
    "sales engineer", "sales engineering",
    "presales", "pre-sales", "pre sales",
    "solutions engineer", "solutions architect", "solutions consultant",
    "field engineer",
    "go to market", "go-to-market", "gtm strategy", "gtm operations",
    "renewals manager", "retention specialist",
    # Marketing / Comms / PR
    "marketing", "brand strategist", "content marketing", "growth marketing",
    "seo specialist", "social media manager", "communications manager",
    "public relations", "pr manager", "events manager", "event planner",
    "campaign manager", "demand generation",
    # Operations / Admin / Logistics / Hourly
    "office manager", "executive assistant", "receptionist", "administrative",
    "warehouse", "fulfillment", "shopper", "driver", "delivery associate",
    "order picker", "operational controls", "facilities",
    "barista", "cashier", "stocker", "cook",
    "personal trainer", "fitness instructor",
    # NB: "server" intentionally NOT here — collides with "server engineer",
    # "server-side", "server networking" which are legitimate SWE titles.
    # Finance / Accounting
    "accountant", "auditor", "payroll", "controller", "treasurer",
    "financial analyst", "finance manager", "fp&a",
    "tax manager", "bookkeeping",
    # Legal / Compliance
    "attorney", "paralegal", "general counsel", "compliance officer",
    "regulatory affairs", "regulatory specialist",
    # HR / Talent / People
    "recruiter", "talent acquisition", "people partner", "hr business partner",
    "hrbp", "talent partner", "compensation analyst", "benefits administrator",
    # Insurance / Healthcare admin
    "claims adjuster", "claims specialist", "underwriter",
    "medicare", "medicaid", "insurance verification",
    # Education
    "instructor", "professor", "teacher", "tutor",
    # Senior leadership way out of student scope (kept separate so we can flip later)
    "vp of", " vp,", "chief executive", "chief financial", "chief marketing",
    "chief revenue", "chief operating", "general manager",
)

DROP_DEPARTMENT_KEYWORDS = (
    "sales", "marketing", "people", "talent",
    "finance", "legal", "compliance",
    "operations", "fulfillment", "support",
    "insurance", "community", "facilities",
    "human resources", "customer success", "customer service",
    "communications", "public policy",
    "clinical", "medical", "physician",
)

# ────────────────────────────────────────────────────────────────────
# KEEP_SPECIFIC — compound terms that uniquely identify a target role.
# A match here OVERRIDES dept-drop. Use this list only for terms that are
# unambiguously target roles regardless of department. Bare words go in
# KEEP_GENERIC instead.
# ────────────────────────────────────────────────────────────────────

KEEP_TITLE_SPECIFIC = (
    # Software engineering
    "software engineer", "software developer", "software architect",
    "software engineering",  # for "Software Engineering, Customer Success" etc.
    "frontend engineer", "front-end engineer", "backend engineer", "back-end engineer",
    "fullstack engineer", "full-stack engineer", "full stack engineer",
    "mobile engineer", "ios engineer", "android engineer",
    "platform engineer", "infrastructure engineer", "systems engineer",
    "devops", "site reliability", "sre engineer",
    "cloud engineer", "operations engineer",  # rescues "Cloud Operations Engineer"
    "security engineer", "appsec", "infosec engineer",
    "incident response", "detection engineer", "detection &", "detection and",
    "member of technical staff", "technical staff",
    # Data
    "data engineer", "data scientist", "data science", "data analyst",
    "analytics engineer",
    "business intelligence", "bi engineer", "bi developer",
    "machine learning", "ml engineer", "ml scientist",
    "ai engineer", "ai researcher",
    "applied scientist", "research scientist", "research engineer",
    "computer vision", "nlp engineer", "nlp scientist",
    "robotics engineer", "robotics software",
    # Product / Design / TPM
    "product manager", "product management", "product designer",
    "ux designer", "ui designer", "ux engineer",
    "design engineer", "technical product manager",
    "product design",
    "engineering program manager", "technical program manager", "tpm",
    # Hardware / specialized
    "firmware engineer", "embedded engineer",
    "hardware engineer", "chip designer", "fpga", "asic",
    # QA / SET
    "qa engineer", "quality engineer", "test engineer", "sdet",
    # Bare swe abbreviations (precise enough)
    "swe ", " swe", "swe,",
)

# ────────────────────────────────────────────────────────────────────
# KEEP_GENERIC — single catch-all words. Only consulted AFTER the
# dept-drop check, so "Sales Engineer" (dept Sales → drop) is correctly
# rejected, while "Senior Engineer" in dept "Engineering" survives.
# ────────────────────────────────────────────────────────────────────

KEEP_TITLE_GENERIC = (
    "engineer", "developer", "scientist", "researcher",
    "designer", "architect", "programmer",
)


_DEPT_PREFIX_RE = re.compile(r"^\s*\d+\s+")


def _normalize_dept(department: str) -> str:
    """Strip Instacart-style numeric prefixes like '112 Order Fulfillment'."""
    return _DEPT_PREFIX_RE.sub("", department or "").lower()


def evaluate(title: str, department: str = "") -> tuple[bool, str]:
    """Decide whether a job should enter the target pool.

    Priority: title-drop → title-keep-specific → dept-drop → title-keep-generic.

    Returns: (keep, reason)
        keep == True  → "title-keep:<matched keyword>"
        keep == False → "title-drop:<kw>" | "dept-drop:<kw>" | "no-match"
    """
    t = (title or "").lower()
    d = _normalize_dept(department)

    for kw in DROP_TITLE_KEYWORDS:
        if kw in t:
            return False, f"title-drop:{kw.strip()}"

    for kw in KEEP_TITLE_SPECIFIC:
        if kw in t:
            return True, f"title-keep:{kw.strip()}"

    for kw in DROP_DEPARTMENT_KEYWORDS:
        if kw in d:
            return False, f"dept-drop:{kw}"

    for kw in KEEP_TITLE_GENERIC:
        if kw in t:
            return True, f"title-keep:{kw}"

    return False, "no-match"


def should_keep(title: str, department: str = "") -> bool:
    """Boolean wrapper for the common case in ingest hot path."""
    keep, _ = evaluate(title, department)
    return keep
