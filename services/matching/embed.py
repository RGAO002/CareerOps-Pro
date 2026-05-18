"""
Embedding production for jobs and resumes.

Why these compose templates:
    The embedding is only as good as the text we feed it. We deliberately do
    NOT dump full JD bodies (most of which is boilerplate that dilutes the
    semantic signal) — we hand-pick the high-signal fields and concatenate
    them in a fixed order. A 30-word "fingerprint" beats a 3000-word JD for
    matching most of the time.

    Same principle on the resume side: we don't embed the raw PDF text. We
    extract role / skills / recent titles / educations / preferences and
    compose a compact target.

OpenAI model choice:
    text-embedding-3-small (1536 dim) — $0.02 / 1M tokens, fast, strong on
    short technical text. At 3742 jobs ~30 tokens each ~$0.002/full pool.

Storage:
    Each embedding is float32 numpy serialized to bytes (6144 bytes / row).
    Stored in job_listings.embedding BLOB. NULL means "not yet computed".
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Iterable, Optional

import numpy as np
from openai import OpenAI

from services.sync_db import get_sync_db

# Keep DB_PATH for backward compatibility with code that imports it.
DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "careeops.db"

EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM = 1536
BATCH_SIZE = 100  # OpenAI accepts up to ~2048 but smaller batches are easier
                  # to recover from on transient failures.


# ────────────────────────────────────────────────────────────────────
# Text composition — the "fingerprint" templates.
# ────────────────────────────────────────────────────────────────────

def compose_job_text(row: dict) -> str:
    """Build a compact match-text from a job_listings row.

    Order matters slightly — embedding models give earlier tokens a small
    weight bias. We lead with title + company because that's the strongest
    signal a human would judge by.
    """
    title = (row["title"] or "").strip()
    company = (row.get("display_name") if isinstance(row, dict) else row["display_name"]) or ""
    industry = (row.get("industry") if isinstance(row, dict) else row["industry"]) or ""
    level = row["level"] or ""
    years_min = row["years_min"]
    work_type = row["work_type"] or ""
    location = row["location_raw"] or ""
    department = row["department"] or ""

    parts: list[str] = []
    if title:
        parts.append(title)
    if company:
        parts.append(f"at {company}")
    if industry:
        parts.append(f"({industry})")
    if level:
        parts.append(f"| {level} level")
    if years_min:
        parts.append(f"{years_min}+ years")
    if work_type:
        parts.append(f"| {work_type}")
    if location:
        parts.append(f"| location: {location}")
    if department and department.lower() not in title.lower():
        parts.append(f"| dept: {department}")
    return " ".join(parts)


def _flatten_skills(skills) -> list[str]:
    """Normalize the resume `skills` field which can be:
       - a list of strings
       - a dict like {"languages": ["Python", "JS"], "tools": ["Docker"]}
       - an empty dict / None
    """
    if not skills:
        return []
    if isinstance(skills, list):
        return [str(s).strip() for s in skills if s]
    if isinstance(skills, dict):
        out: list[str] = []
        for v in skills.values():
            if isinstance(v, list):
                out.extend(str(s).strip() for s in v if s)
            elif isinstance(v, str):
                out.append(v.strip())
        return out
    return [str(skills).strip()]


def _experience_titles(experience: list) -> list[str]:
    out: list[str] = []
    for e in (experience or [])[:5]:  # cap at 5 most recent
        if isinstance(e, dict):
            role = (e.get("role") or e.get("title") or "").strip()
            company = (e.get("company") or "").strip()
            if role and company:
                out.append(f"{role} at {company}")
            elif role:
                out.append(role)
    return out


def compose_resume_text(
    resume_data: dict,
    preferences: Optional[dict] = None,
) -> str:
    """Build the resume's match-fingerprint.

    `preferences` is the user's explicit search prefs ({levels, locations,
    work_types, ...}). It steers the embedding toward what the user
    *wants*, not just what they *have* — important when a senior is
    intentionally looking for a transition into a new domain.
    """
    role = (resume_data.get("role") or "").strip()
    summary = (resume_data.get("summary") or "").strip()
    skills = _flatten_skills(resume_data.get("skills"))
    titles = _experience_titles(resume_data.get("experience"))
    educations = []
    for e in (resume_data.get("education") or [])[:2]:
        if isinstance(e, dict):
            d = (e.get("degree") or "").strip()
            s = (e.get("school") or "").strip()
            if d and s:
                educations.append(f"{d}, {s}")
            elif d:
                educations.append(d)

    parts: list[str] = []
    if role:
        parts.append(f"Target role: {role}")
    if summary:
        parts.append(f"Summary: {summary[:300]}")
    if skills:
        parts.append(f"Skills: {', '.join(skills[:20])}")
    if titles:
        parts.append(f"Recent: {' | '.join(titles)}")
    if educations:
        parts.append(f"Education: {' / '.join(educations)}")

    if preferences:
        prefs_bits = []
        for key in ("levels", "role_families", "industries"):
            vals = preferences.get(key) or []
            if vals:
                prefs_bits.append(f"{key}={','.join(vals)}")
        if prefs_bits:
            parts.append(f"Looking for: {' '.join(prefs_bits)}")

    return "\n".join(parts) or "Software Engineer"  # safety fallback


# ────────────────────────────────────────────────────────────────────
# OpenAI client + batching
# ────────────────────────────────────────────────────────────────────

_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    """Lazy singleton — avoid demanding the key at import time so callers
    that only need text-composition helpers can import freely.
    """
    global _client
    if _client is None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "OPENAI_API_KEY env var not set. Embedding requires OpenAI access; "
                "set it in your shell or .env before calling embed_*()."
            )
        _client = OpenAI(api_key=api_key)
    return _client


def embed_texts(texts: list[str]) -> np.ndarray:
    """Batch-embed a list of texts. Returns shape (N, EMBED_DIM) float32.

    Empty / whitespace-only inputs are mapped to a zero vector so the caller
    can keep its ordering; downstream code should treat zero-vec rows as
    "could not embed".
    """
    if not texts:
        return np.zeros((0, EMBED_DIM), dtype=np.float32)

    out = np.zeros((len(texts), EMBED_DIM), dtype=np.float32)
    nonempty = [(i, t.strip()) for i, t in enumerate(texts) if t and t.strip()]
    if not nonempty:
        return out

    client = _get_client()
    for batch_start in range(0, len(nonempty), BATCH_SIZE):
        batch = nonempty[batch_start:batch_start + BATCH_SIZE]
        inputs = [t for _, t in batch]
        resp = client.embeddings.create(model=EMBED_MODEL, input=inputs)
        for (orig_idx, _), data in zip(batch, resp.data):
            out[orig_idx] = np.asarray(data.embedding, dtype=np.float32)
    return out


# ────────────────────────────────────────────────────────────────────
# Storage helpers — float32 BLOB <-> numpy
# ────────────────────────────────────────────────────────────────────

def vec_to_blob(vec: np.ndarray) -> bytes:
    """Pack a 1D float32 vector to bytes for SQLite BLOB storage."""
    if vec.dtype != np.float32:
        vec = vec.astype(np.float32)
    return vec.tobytes()


def blob_to_vec(blob: bytes) -> np.ndarray:
    return np.frombuffer(blob, dtype=np.float32)


# ────────────────────────────────────────────────────────────────────
# Pool-level batch operation
# ────────────────────────────────────────────────────────────────────

_JOB_SELECT_COLS = (
    "jl.id, jl.title, jl.level, jl.years_min, jl.work_type, "
    "jl.location_raw, jl.department, "
    "c.display_name, c.industry"
)


def compute_all_embeddings(
    only_missing: bool = True,
    db_path: Path = DB_PATH,
    batch: int = BATCH_SIZE,
) -> dict:
    """Compute and store embeddings for active job_listings.

    Args:
        only_missing: if True, skip rows that already have an embedding.
                      if False, recompute everything (e.g. after changing
                      the compose template).
    """
    conn = get_sync_db()
    try:
        where = "jl.is_active = 1"
        if only_missing:
            where += " AND jl.embedding IS NULL"
        rows = conn.execute(
            f"SELECT {_JOB_SELECT_COLS} "
            f"FROM job_listings jl JOIN companies c ON c.id = jl.company_id "
            f"WHERE {where}"
        ).fetchall()

        if not rows:
            return {"computed": 0, "skipped": "nothing to do"}

        texts = [compose_job_text(r) for r in rows]
        ids = [r["id"] for r in rows]

        total = 0
        for batch_start in range(0, len(texts), batch):
            chunk_ids = ids[batch_start:batch_start + batch]
            chunk_texts = texts[batch_start:batch_start + batch]
            vecs = embed_texts(chunk_texts)
            for jl_id, vec in zip(chunk_ids, vecs):
                conn.execute(
                    "UPDATE job_listings SET embedding = ? WHERE id = ?",
                    (vec_to_blob(vec), jl_id),
                )
            conn.commit()
            total += len(chunk_ids)
            print(f"[embed] {total:,} / {len(rows):,} done", flush=True)

        return {"computed": total, "model": EMBED_MODEL, "dim": EMBED_DIM}
    finally:
        conn.close()


def load_pool_matrix(
    where_extra: str = "",
    params: Iterable = (),
    db_path: Path = None,
) -> tuple[list[int], np.ndarray, list[dict]]:
    """Load all (id, embedding, full row) for active jobs that have an
    embedding AND match `where_extra`.

    Returns: (ids, matrix shape=(N, 1536), rows)
    """
    conn = get_sync_db()
    try:
        where = "jl.is_active = 1 AND jl.embedding IS NOT NULL"
        if where_extra:
            where += f" AND {where_extra}"
        cols = (
            "jl.id, jl.title, jl.level, jl.years_min, jl.work_type, "
            "jl.location_raw, jl.location_tier, jl.sponsorship_signal, "
            "jl.apply_url, jl.posted_at, jl.first_seen_at, "
            "jl.description_text, jl.embedding, "
            "c.display_name, c.industry, c.h1b_lca_count_3y, "
            "c.uscis_h1b_approvals_3y, c.uscis_h1b_approvals_1y"
        )
        rows = conn.execute(
            f"SELECT {cols} FROM job_listings jl JOIN companies c ON c.id = jl.company_id "
            f"WHERE {where}",
            tuple(params) if params else None,
        ).fetchall()
        if not rows:
            return [], np.zeros((0, EMBED_DIM), dtype=np.float32), []
        ids = [r["id"] for r in rows]
        matrix = np.vstack([blob_to_vec(bytes(r["embedding"])) for r in rows])
        return ids, matrix, rows
    finally:
        conn.close()
