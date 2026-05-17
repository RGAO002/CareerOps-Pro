"""
Lightweight rerank — adds business knowledge on top of pure vector similarity.

Every signal here is intentionally cheap (no LLM, no extra IO). They each
nudge the score by a small amount; the cosine similarity from STEP 2 still
dominates.

Final score formula:
    final = w_cos    * cosine
          + w_skill  * skill_overlap_jaccard
          + w_sponsor* sponsor_bonus
          + w_recency* recency_bonus
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Iterable, Optional

import numpy as np

WEIGHTS = {
    "cosine":  0.70,
    "skill":   0.15,
    "sponsor": 0.10,
    "recency": 0.05,
}

# Snake-case-ish tokenization for skill matching. Handles "C++" and "C#" as
# single tokens (otherwise '+'/'#' get stripped and they'd collide with "C").
_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9+#.\-]*")


def _tokenize(text: str) -> set[str]:
    """Lowercase tokens. Used for cheap keyword overlap, not real NLP."""
    return {m.group(0).lower() for m in _TOKEN_RE.finditer(text or "")}


def skill_overlap(resume_skills: Iterable[str], job_text: str) -> float:
    """Jaccard-like ratio of resume skills present in the job text.

    Returns: 0.0 to 1.0. Higher = more of the candidate's skills explicitly
    appear in the job's title + description.
    """
    skills = {s.strip().lower() for s in resume_skills if s and s.strip()}
    if not skills:
        return 0.0
    job_tokens = _tokenize(job_text)
    hits = sum(1 for s in skills if s in job_tokens)
    return hits / len(skills)


def sponsor_bonus(signal: str, needs_sponsorship: bool) -> float:
    """Translate sponsorship_signal into a [0,1] reward.

    Only meaningful if the user actually needs sponsorship — otherwise a
    candidate isn't penalized for an unfriendly job (they can take it).

    Signal hierarchy (most → least confident):
        'friendly'        — JD itself says they sponsor (highest trust)
        'company_history' — JD silent, but USCIS shows the company has
                            10+ verified H-1B approvals in last 3y
        ''                — no info either way (silent + no history)
        'unfriendly'      — JD explicitly rules out sponsorship
    """
    if not needs_sponsorship:
        return 0.5  # neutral
    if signal == "friendly":
        return 1.0
    if signal == "company_history":
        return 0.85  # gov-verified company sponsor history, just below explicit JD
    if signal == "unfriendly":
        return 0.0
    # Truly silent: JD said nothing AND company has no H-1B track record.
    return 0.3


def recency_bonus(posted_at: Optional[str], first_seen_at: Optional[str]) -> float:
    """Newer = better. Falls off linearly over 90 days, clipped to [0, 1].

    Uses posted_at when present (real ATS-supplied date); otherwise
    first_seen_at (when WE first ingested it). Either way the fallback to
    "we don't know" maps to the median bonus 0.5 — neither rewards nor
    punishes the row.
    """
    s = posted_at or first_seen_at
    if not s:
        return 0.5
    try:
        # Accept "YYYY-MM-DD" or full ISO timestamps.
        dt = datetime.fromisoformat(s[:19].replace("Z", "+00:00")) if "T" in s else \
             datetime.fromisoformat(s[:10])
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return 0.5
    age_days = (datetime.now(timezone.utc) - dt).days
    if age_days <= 0:
        return 1.0
    if age_days >= 90:
        return 0.0
    return 1.0 - (age_days / 90.0)


def explain(c: dict, needs_sponsorship: bool) -> list[str]:
    """Generate human-readable "why we recommended this" bullets from a
    candidate's score_parts. Deterministic, no LLM. Returns 0-4 short strings.
    """
    reasons: list[str] = []
    sp = c.get("score_parts") or {}
    cos = sp.get("cosine", 0.0)
    skill = sp.get("skill", 0.0)
    spon = sp.get("sponsor", 0.0)
    rec = sp.get("recency", 0.0)

    # Strongest signal first.
    if cos >= 0.75:
        reasons.append("Strong semantic match with your resume")
    elif cos >= 0.55:
        reasons.append("Decent semantic match with your resume")

    if skill >= 0.5:
        reasons.append(f"Matches {int(skill * 100)}% of your listed skills")
    elif skill >= 0.25:
        reasons.append("Some of your skills appear in this role")

    if needs_sponsorship:
        signal_raw = c.get("sponsorship_signal") or ""
        approvals_3y = c.get("uscis_h1b_approvals_3y") or c.get("h1b_lca_count_3y") or 0
        if signal_raw == "friendly":
            reasons.append("Sponsorship explicitly offered (per JD)")
        elif signal_raw == "company_history" and approvals_3y >= 10:
            reasons.append(
                f"Company sponsored {approvals_3y:,} H-1B approvals in 3y (USCIS)"
            )
        elif signal_raw == "unfriendly":
            reasons.append("⚠ Sponsorship explicitly NOT offered")
        elif spon < 0.5:
            reasons.append("⚠ No sponsorship history found for this company")

    if rec >= 0.95:
        reasons.append("Posted in the last few days")
    elif rec >= 0.7:
        reasons.append("Recent posting")
    elif rec <= 0.05:
        reasons.append("⚠ Posting may be stale (90+ days old)")

    return reasons


def rerank(
    candidates: list[dict],
    resume_skills: list[str],
    needs_sponsorship: bool,
    weights: Optional[dict] = None,
) -> list[dict]:
    """Apply weighted scoring to candidates from STEP 2.

    Each candidate dict is mutated to include:
        score          float — final blended score
        score_parts    dict — breakdown for debugging / UI tooltip
    Returns the same list, sorted by `score` desc.
    """
    w = {**WEIGHTS, **(weights or {})}
    for c in candidates:
        cosine = c.get("cosine", 0.0)
        # Build a haystack from title + JD body (which may be empty for
        # simplify-sourced jobs — that's fine, cosine still carries it).
        haystack = " ".join([
            c.get("title") or "",
            c.get("description_text") or "",
        ])
        skill = skill_overlap(resume_skills, haystack)
        sp = sponsor_bonus(c.get("sponsorship_signal") or "", needs_sponsorship)
        rec = recency_bonus(c.get("posted_at"), c.get("first_seen_at"))

        c["score"] = (
            w["cosine"]  * cosine
            + w["skill"]   * skill
            + w["sponsor"] * sp
            + w["recency"] * rec
        )
        c["score_parts"] = {
            "cosine":  round(float(cosine), 3),
            "skill":   round(float(skill), 3),
            "sponsor": round(float(sp), 3),
            "recency": round(float(rec), 3),
        }
        c["reasons"] = explain(c, needs_sponsorship)
    candidates.sort(key=lambda x: -x["score"])
    return candidates
