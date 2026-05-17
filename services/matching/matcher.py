"""
Two-stage matcher: hard filter → vector recall → rerank.

Public entry point: ``match(resume_id, preferences, top_k=20)``.

Latency budget on the current 3742-row pool:
    Step 1 (SQL hard filter):   <  10 ms
    Step 1.5 (resume embed):       150-400 ms (one OpenAI call)
    Step 2 (vector search):     <  30 ms
    Step 3 (rerank):            <  10 ms
    Total:                      ~ 200-450 ms (dominated by network embed call)
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Optional

import numpy as np

from services.matching import embed as _embed
from services.matching.embed import DB_PATH, compose_resume_text
from services.matching.hard_filter import build_where_clause
from services.matching.rerank import rerank


def _load_resume(resume_id: str, db_path: Path) -> dict:
    conn = sqlite3.connect(str(db_path))
    try:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT id, name, role, resume_data FROM resumes WHERE id = ?",
            (resume_id,),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        raise ValueError(f"resume not found: {resume_id}")
    data = json.loads(row["resume_data"])
    data.setdefault("name", row["name"])
    data.setdefault("role", row["role"])
    return data


def _flatten_skills_list(resume_data: dict) -> list[str]:
    """Same flattening logic embed.py uses, surfaced here so rerank can
    receive a flat list for keyword-overlap scoring.
    """
    skills = resume_data.get("skills")
    if not skills:
        return []
    if isinstance(skills, list):
        return [str(s) for s in skills if s]
    if isinstance(skills, dict):
        out: list[str] = []
        for v in skills.values():
            if isinstance(v, list):
                out.extend(str(s) for s in v if s)
            elif isinstance(v, str):
                out.append(v)
        return out
    return [str(skills)]


def match(
    resume_id: str,
    preferences: Optional[dict] = None,
    top_k: int = 20,
    recall_k: int = 100,
    db_path: Path = DB_PATH,
    return_pool_size: bool = False,
) -> list[dict] | tuple[list[dict], int]:
    """Run the full pipeline and return top_k jobs with score breakdown.

    Args:
        resume_id: row id in resumes table.
        preferences: optional dict, see hard_filter.build_where_clause for
                     accepted keys. Pass None for no hard filtering.
        top_k:    final number of recommendations to return.
        recall_k: candidates surfaced by Step 2 to feed into Step 3 rerank.
                  Only matters when recall_k < #pool; for our 3742-row pool
                  it's almost always cheaper to just rerank everything that
                  passed the hard filter.
        return_pool_size: if True, returns (results, pool_size_after_hard_filter)
                          so the caller can show "ranked X out of Y eligible".
    """
    preferences = preferences or {}

    # ── Step 1: hard filter ──
    where_extra, params = build_where_clause(preferences)

    # ── Step 1.5: load candidate pool (one query) ──
    ids, matrix, rows = _embed.load_pool_matrix(
        where_extra=where_extra, params=params, db_path=db_path,
    )
    if not ids:
        return []

    # ── Step 1.6: embed the resume + preferences ──
    resume_data = _load_resume(resume_id, db_path)
    resume_text = compose_resume_text(resume_data, preferences)
    resume_vec = _embed.embed_texts([resume_text])[0]   # shape (1536,)

    # ── Step 2: vector recall (single matrix multiply) ──
    # text-embedding-3-small returns L2-normalized vectors → dot product
    # IS cosine similarity, no extra normalization required.
    sims = matrix @ resume_vec                   # shape (N,)
    if recall_k < len(sims):
        # argpartition is O(N); we don't care about the exact ordering of
        # the discarded tail, only about the top recall_k.
        top_idx = np.argpartition(-sims, recall_k)[:recall_k]
    else:
        top_idx = np.arange(len(sims))

    # ── Step 3: build candidate dicts + rerank ──
    candidates = []
    for i in top_idx:
        r = rows[i]
        candidates.append({
            "id": r["id"],
            "title": r["title"],
            "company": r["display_name"],
            "industry": r["industry"] or "",
            "location": r["location_raw"] or "",
            "location_tier": r["location_tier"] or "",
            "level": r["level"] or "",
            "work_type": r["work_type"] or "",
            "sponsorship_signal": r["sponsorship_signal"] or "",
            "apply_url": r["apply_url"] or "",
            "posted_at": r["posted_at"],
            "first_seen_at": r["first_seen_at"],
            "h1b_lca_count_3y": r["h1b_lca_count_3y"] or 0,
            "uscis_h1b_approvals_3y": r["uscis_h1b_approvals_3y"] or 0,
            "uscis_h1b_approvals_1y": r["uscis_h1b_approvals_1y"] or 0,
            "description_text": r["description_text"] or "",
            "has_jd": bool(r["description_text"]),
            "cosine": float(sims[i]),
        })

    skills = _flatten_skills_list(resume_data)
    needs_sponsorship = bool(preferences.get("needs_sponsorship"))
    rerank(candidates, skills, needs_sponsorship)

    # Trim heavy fields before returning to keep JSON small.
    out = []
    for c in candidates[:top_k]:
        c.pop("description_text", None)
        out.append(c)
    if return_pool_size:
        return out, len(rows)
    return out
