"""
JD-side structured-field extractor.

Reads `title` + `description_text` and emits four high-leverage signals that
are missing from raw ATS data:

    level                 intern | new_grad | junior | mid | senior | staff | principal | ''
    years_min             integer (e.g. "5+ years" → 5) or None
    work_type             remote | hybrid | onsite | ''
    sponsorship_signal    friendly | unfriendly | ''

Why regex (not LLM) for this:
    These four fields key on a small set of recognizable phrases that JD
    writers use almost verbatim. Regex is deterministic, free, fast, and
    auditable. We accept a small false-negative rate ("we cover sponsorship
    needs when appropriate") in exchange for zero per-row LLM cost on the
    hot path.

The sponsorship_signal field deserves special attention — it's the product's
core differentiator. Two halves:

    UNFRIENDLY (high precision):
        "no sponsorship", "do not sponsor", "unable to sponsor",
        "must be authorized to work in the US without sponsorship",
        "us citizen only", "permanent residents only"
    FRIENDLY:
        "we sponsor", "sponsorship available", "h-1b transfer welcome",
        "h1b transfer", "visa sponsorship offered"

A JD that says nothing → "" (unknown). The downstream UX surfaces this as
"sponsorship status: unknown — verify with employer".
"""
from __future__ import annotations

import re
from typing import Optional

# ─────────────────────────────────────────────────────
# LEVEL — title is checked first (more reliable than JD body).
# ─────────────────────────────────────────────────────

# Order matters: longer/more specific patterns first.
# "Staff" beats "Senior" beats "Mid"; "Intern"/"New Grad" beat them all.
_LEVEL_TITLE_PATTERNS = [
    ("intern",     re.compile(r"\b(intern|internship|co[-\s]?op)\b", re.I)),
    ("new_grad",   re.compile(r"\b(new\s*grad(?:uate)?|university\s*grad|early\s*career|associate\s*\(.*new.*grad)\b", re.I)),
    ("principal",  re.compile(r"\b(principal|distinguished|fellow)\b", re.I)),
    ("staff",      re.compile(r"\bstaff\b", re.I)),
    ("senior",     re.compile(r"\b(senior|sr\.?|lead)\b", re.I)),
    ("junior",     re.compile(r"\b(junior|jr\.?|entry[-\s]?level)\b", re.I)),
    ("mid",        re.compile(r"\b(mid[-\s]?level|mid)\b", re.I)),
]

# JD body fallback for level when title doesn't say.
_LEVEL_BODY_PATTERNS = [
    ("intern",     re.compile(r"\b(intern(ship)?\s+(role|position|opportunity)|summer\s+intern)\b", re.I)),
    ("new_grad",   re.compile(r"\b(new\s*grad(?:uate)?|recent\s+graduate|university\s+graduate)\b", re.I)),
]


def _extract_level(title: str, body: str) -> str:
    for level, pat in _LEVEL_TITLE_PATTERNS:
        if pat.search(title):
            return level
    for level, pat in _LEVEL_BODY_PATTERNS:
        if pat.search(body):
            return level
    return ""


# ─────────────────────────────────────────────────────
# YEARS_MIN — minimum years of experience required.
# ─────────────────────────────────────────────────────

# Cover the common phrasings:
#   "5+ years", "5 years", "5-7 years", "minimum 5 years", "at least 5 years",
#   "8 or more years of relevant experience"
_YEARS_PATTERNS = [
    re.compile(r"(?:minimum|at\s+least|min\.?)\s+of\s+(\d{1,2})\s*\+?\s*(?:years|yrs)\b", re.I),
    re.compile(r"(?:minimum|at\s+least|min\.?)\s+(\d{1,2})\s*\+?\s*(?:years|yrs)\b", re.I),
    re.compile(r"(\d{1,2})\s*\+\s*(?:years|yrs)\b", re.I),
    re.compile(r"(\d{1,2})\s*-\s*\d{1,2}\s*(?:years|yrs)\b", re.I),
    re.compile(r"(\d{1,2})\s+(?:or\s+more\s+)?years?\s+(?:of\s+)?(?:professional\s+|relevant\s+)?(?:experience|exp)\b", re.I),
]


def _extract_years_min(body: str) -> Optional[int]:
    """Return the smallest plausible years-of-experience number found in JD.

    Picks the smallest match (a JD often lists multiple — "3+ years SWE,
    5+ years Python" — and the floor is what counts as 'minimum required').
    Caps at 25 to filter out things like "we have 50 years of history".
    """
    found: list[int] = []
    for pat in _YEARS_PATTERNS:
        for m in pat.finditer(body):
            try:
                n = int(m.group(1))
                if 0 < n <= 25:
                    found.append(n)
            except (ValueError, IndexError):
                pass
    return min(found) if found else None


# ─────────────────────────────────────────────────────
# WORK_TYPE — remote / hybrid / onsite.
# Title and location_raw are passed in too; many ATSes only encode this
# in the location string ("Remote - US") not the JD body.
# ─────────────────────────────────────────────────────

_REMOTE_RE = re.compile(
    r"\b(fully\s*remote|100%\s*remote|remote[-\s]first|remote\s*role|"
    r"work\s*from\s*home|wfh)\b",
    re.I,
)
_HYBRID_RE = re.compile(r"\bhybrid\b", re.I)
_ONSITE_RE = re.compile(
    r"\b(on[-\s]?site|in[-\s]?office|in[-\s]?person|"
    r"(?:\d+\s*days?\s*(?:in|at)\s*the\s*office))\b",
    re.I,
)


def _extract_work_type(title: str, location: str, body: str) -> str:
    """Resolve the most-specific work_type. Hybrid > Remote > Onsite when
    multiple signals are present (a "Hybrid (remote-friendly)" JD is hybrid).
    """
    blob = f"{title}\n{location}\n{body}"
    if _HYBRID_RE.search(blob):
        return "hybrid"
    if _REMOTE_RE.search(blob) or "remote" in location.lower():
        return "remote"
    if _ONSITE_RE.search(blob):
        return "onsite"
    return ""


# ─────────────────────────────────────────────────────
# SPONSORSHIP_SIGNAL — the diff in this product.
# ─────────────────────────────────────────────────────

# "United States" or "U.S." or "US" — used in many of the patterns below.
_US = r"(?:u\.?s\.?(?:a)?|united\s+states)"

_UNFRIENDLY_PATTERNS = [
    # ── Direct: "not provide/offer/sponsor sponsorship" family ──
    re.compile(
        r"\b(?:not\s+(?:provid(?:e|ing)|offer(?:ing)?|sponsor(?:ing)?))\s+"
        r"(?:visa\s+)?sponsorship\b",
        re.I,
    ),
    re.compile(
        r"\b(?:do(?:es)?|will|are|is)\s+not\s+"
        r"(?:provid(?:e|ing)|offer(?:ing)?|sponsor(?:ing)?)\s+"
        r"(?:visa\s+)?sponsorship\b",
        re.I,
    ),
    re.compile(r"\b(?:we\s+)?(?:do|will|can)\s+not\s+sponsor\b", re.I),
    re.compile(r"\bcannot\s+sponsor\b", re.I),
    re.compile(r"\bunable\s+to\s+(?:offer|provide|sponsor)\b.*?sponsorship\b", re.I),
    re.compile(r"\bsponsorship\s+(?:is\s+)?not\s+(?:offered|available|provided|currently|considered)\b", re.I),
    re.compile(r"\bnot\s+able\s+to\s+(?:offer|provide|sponsor)\s+(?:visa\s+)?sponsorship\b", re.I),
    re.compile(r"\bnot\s+(?:in\s+a\s+position\s+to\s+|prepared\s+to\s+)sponsor\b", re.I),
    re.compile(r"\bunwilling\s+to\s+sponsor\b", re.I),
    re.compile(r"\bno\s+(?:visa\s+)?(?:sponsorship|c2c|h-?1b|relocation\s+(?:and|or)\s+visa\s+support|visa\s+support)\b", re.I),
    # ── "without sponsorship" / "without requiring sponsorship" ──
    re.compile(r"\bwithout\s+(?:requiring\s+|the\s+need\s+for\s+|current\s+or\s+future\s+)?(?:visa\s+|company\s+|employer\s+)?sponsorship\b", re.I),
    # ── "must be authorized to work in the US ..." family ──
    re.compile(
        rf"\b(?:must\s+be\s+|are\s+)?(?:legally\s+|currently\s+)?authorized\s+to\s+work\s+in\s+(?:the\s+)?{_US}"
        r"(?:\s+without|\s+on\s+a\s+permanent\s+basis|\s+with\s+no|\s+now\s+and\s+in\s+the\s+future|"
        r"\s+for\s+any\s+employer|\s+permanently)",
        re.I,
    ),
    # "able to work in the US without sponsorship"
    re.compile(rf"\bable\s+to\s+work\s+in\s+(?:the\s+)?{_US}\s+without\s+(?:requiring\s+)?(?:current\s+or\s+future\s+)?(?:visa\s+)?sponsorship\b", re.I),
    # ── Citizen / permanent-resident requirements ──
    # "must be a U.S. citizen / national / person"
    re.compile(rf"\bmust\s+be\s+(?:a\s+)?{_US}\s+(?:citizen|national|person)\b", re.I),
    # "U.S. citizens or permanent residents (only|are required|will be considered|may apply)"
    re.compile(
        rf"\b{_US}?\s*citizens?\s+(?:or|and|/)\s+"
        r"(?:permanent\s+residents?|green\s+card\s+holders?|lawful\s+permanent\s+residents?|nationals?)"
        r"(?:\s+only|\s+are\s+(?:required|preferred|eligible)|\s+may\s+apply|\s+will\s+be\s+considered)?\b",
        re.I,
    ),
    re.compile(rf"\b(?:applicants?\s+must\s+be\s+|candidates?\s+must\s+be\s+){_US}?\s*citizens?\b", re.I),
    re.compile(rf"\b(?:open\s+to\s+|hiring\s+only\s+|only\s+hiring\s+){_US}?\s*citizens?\b", re.I),
    re.compile(rf"\b{_US}?\s*citizens?\s+only\b", re.I),
    # ── Security clearance ──
    re.compile(r"\b(?:active\s+)?(?:secret|top[-\s]?secret|ts/sci|public\s+trust)\s+(?:security\s+)?clearance\b", re.I),
    re.compile(r"\b(?:secret|ts/sci)[-\s]?clearance\s+required\b", re.I),
    re.compile(r"\bsecurity\s+clearance\s+(?:is\s+)?required\b", re.I),
]

_FRIENDLY_PATTERNS = [
    # Require explicit visa/sponsorship context — bare "we sponsor (relocation)"
    # used to false-positive, so we now demand the object word.
    re.compile(
        r"\b(?:we|our\s+company|employer)\s+(?:will\s+|do\s+|can\s+|are\s+(?:happy|willing)\s+to\s+|may\s+)?"
        r"sponsor(?:s|ing|ed)?\s+"
        r"(?:visa(?:s)?|h-?1b|work\s+(?:visa|authorization|permit)|sponsorship|qualified|eligible)",
        re.I,
    ),
    re.compile(r"\b(?:visa\s+|h-?1b\s+|employment\s+)?sponsorship\s+(?:is\s+)?(?:available|offered|provided|considered|possible|welcome)\b", re.I),
    re.compile(r"\b(?:open\s+to|willing\s+to\s+(?:offer|provide))\s+(?:visa\s+|h-?1b\s+)?sponsorship\b", re.I),
    re.compile(r"\bh-?1b\s+(?:transfer|sponsorship|visa|candidates?\s+welcome)\b", re.I),
    re.compile(r"\b(?:offer|provide)\s+(?:visa\s+|h-?1b\s+)?sponsorship\b", re.I),
    # OPT / CPT / F-1 friendly is a strong signal student-visa holders are welcome.
    # Handle "OPT and CPT students are welcome", "OPT/CPT welcome", "F-1 students welcome".
    re.compile(
        r"\b(?:opt|cpt|f-?1|stem[-\s]?opt)"
        r"(?:\s*(?:and|or|/)\s*(?:opt|cpt|f-?1))?"
        r"\s+(?:students?\s+)?(?:are\s+)?(?:welcome|considered|encouraged|eligible)\b",
        re.I,
    ),
    re.compile(r"\b(?:welcome|considering)\s+(?:opt|cpt|f-?1|h-?1b|stem[-\s]?opt)\s+(?:candidates?|students?|applicants?)\b", re.I),
    # E-Verify is a soft positive (required for H-1B sponsors).
    re.compile(r"\bwe\s+are\s+(?:an\s+)?e[-\s]?verify\s+(?:employer|company|participant)\b", re.I),
]


def _extract_sponsorship_signal(body: str) -> str:
    """unfriendly wins over friendly when both patterns match — a JD that says
    'we sponsor visas but not for this role' should be flagged unfriendly."""
    for pat in _UNFRIENDLY_PATTERNS:
        if pat.search(body):
            return "unfriendly"
    for pat in _FRIENDLY_PATTERNS:
        if pat.search(body):
            return "friendly"
    return ""


# ─────────────────────────────────────────────────────
# Combined entry point.
# ─────────────────────────────────────────────────────

def extract(title: str, description_text: str, location_raw: str = "") -> dict:
    """Run all four extractors. Returns a dict ready to feed an UPDATE.

    Caller is responsible for null-safety on the input strings.
    """
    title = title or ""
    body = description_text or ""
    loc = location_raw or ""
    return {
        "level":              _extract_level(title, body),
        "years_min":          _extract_years_min(body),
        "work_type":          _extract_work_type(title, loc, body),
        "sponsorship_signal": _extract_sponsorship_signal(body),
    }
