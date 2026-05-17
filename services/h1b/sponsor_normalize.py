"""
Employer name normalization.

Maps raw DOL/ATS company strings into a canonical form so we can match
"Google LLC", "Google Inc", "Alphabet Inc" to the same ``companies`` row.

Example:
    normalize_employer_name("JPMorgan Chase & Co.") -> "jpmorgan chase"
    normalize_employer_name("Google LLC")           -> "google"
    normalize_employer_name("Two Sigma Investments, LP") -> "two sigma investments"

Kept deliberately simple: strip corporate suffixes, punctuation, collapse
whitespace, lowercase. Phase 2 will add rapidfuzz for fuzzy matching on top
of this normalized form.
"""
from __future__ import annotations

import re

_CORP_SUFFIXES = [
    "llc", "inc", "incorporated", "corp", "corporation",
    "ltd", "limited", "lp", "llp", "plc", "gmbh",
    "holdings", "group", "na", "usa", "us",
]

# \b(suffix)\b optionally followed by a period.
_CORP_RE = re.compile(
    r"\b(?:" + "|".join(_CORP_SUFFIXES) + r")\b\.?",
    re.IGNORECASE,
)
_PUNCT_RE = re.compile(r"[^\w\s]")
_WS_RE = re.compile(r"\s+")


def normalize_employer_name(name: str) -> str:
    """Normalize a company name to a matching-friendly canonical form."""
    if not name:
        return ""
    s = name.lower()
    s = _CORP_RE.sub("", s)
    s = _PUNCT_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s
