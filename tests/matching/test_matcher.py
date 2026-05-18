"""
End-to-end test for the two-stage matcher.

OpenAI is mocked — every embed_texts call returns a deterministic vector
derived from a hash of the input. This lets us assert the *pipeline* works
(hard filter, vector recall, rerank ordering) without paying for or
depending on a live API.

The fake embedder is designed so that texts containing the same lowercase
tokens get similar vectors — close to how real embeddings behave.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from services.matching import embed as embed_mod  # noqa: E402
from services.matching import matcher as matcher_mod  # noqa: E402
from services.matching.embed import (  # noqa: E402
    blob_to_vec,
    compose_job_text,
    compose_resume_text,
    vec_to_blob,
)
from services.matching.hard_filter import build_where_clause  # noqa: E402
from services.matching.rerank import (  # noqa: E402
    recency_bonus,
    skill_overlap,
    sponsor_bonus,
)


# ────────────────────────────────────────────────────────────────────
# Fake embedder — deterministic, token-aware
# ────────────────────────────────────────────────────────────────────

def _fake_embed_texts(texts: list[str]) -> np.ndarray:
    """Produce vectors where shared tokens → similar vectors.

    Trick: each token contributes a fixed unit-vector "atom"; the embedding
    is the L2-normalized sum of atoms. Texts with overlapping tokens end up
    pointing in similar directions — same property the real model has.
    """
    rng_for_token = {}
    out = np.zeros((len(texts), embed_mod.EMBED_DIM), dtype=np.float32)
    for i, t in enumerate(texts):
        toks = (t or "").lower().split()
        if not toks:
            continue
        v = np.zeros(embed_mod.EMBED_DIM, dtype=np.float32)
        for tok in toks:
            if tok not in rng_for_token:
                seed = int(hashlib.sha256(tok.encode()).hexdigest()[:8], 16)
                rng = np.random.default_rng(seed)
                atom = rng.standard_normal(embed_mod.EMBED_DIM).astype(np.float32)
                atom /= np.linalg.norm(atom) + 1e-9
                rng_for_token[tok] = atom
            v += rng_for_token[tok]
        n = np.linalg.norm(v)
        if n > 0:
            out[i] = v / n
    return out


# ────────────────────────────────────────────────────────────────────
# Fixture DB
# ────────────────────────────────────────────────────────────────────

def _make_db() -> Path:
    fd = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    fd.close()
    db_path = Path(fd.name)
    conn = sqlite3.connect(str(db_path))
    conn.executescript("""
        CREATE TABLE companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE, display_name TEXT NOT NULL,
            normalized_name TEXT NOT NULL, industry TEXT,
            ats_vendor TEXT, h1b_lca_count_3y INTEGER DEFAULT 0
        );
        CREATE TABLE job_listings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            external_id TEXT NOT NULL, source TEXT NOT NULL,
            title TEXT NOT NULL,
            location_raw TEXT DEFAULT '', location_tier TEXT DEFAULT '',
            work_type TEXT DEFAULT '', department TEXT DEFAULT '',
            description_text TEXT DEFAULT '',
            apply_url TEXT NOT NULL,
            posted_at TEXT, first_seen_at TIMESTAMP,
            level TEXT DEFAULT '', years_min INTEGER, sponsorship_signal TEXT DEFAULT '',
            embedding BLOB,
            is_active INTEGER DEFAULT 1,
            UNIQUE(source, external_id)
        );
        CREATE TABLE resumes (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT DEFAULT '',
            filename TEXT NOT NULL, resume_data JSON NOT NULL
        );
    """)

    # Two companies.
    conn.execute(
        "INSERT INTO companies (slug, display_name, normalized_name, industry, "
        "ats_vendor, h1b_lca_count_3y) VALUES "
        "('stripe', 'Stripe', 'stripe', 'fintech', 'greenhouse', 142)"
    )
    conn.execute(
        "INSERT INTO companies (slug, display_name, normalized_name, industry, "
        "ats_vendor, h1b_lca_count_3y) VALUES "
        "('dentalcorp', 'DentalCorp', 'dentalcorp', 'healthcare', 'external', 0)"
    )
    stripe_id = conn.execute("SELECT id FROM companies WHERE slug='stripe'").fetchone()[0]
    dental_id = conn.execute("SELECT id FROM companies WHERE slug='dentalcorp'").fetchone()[0]

    # 4 jobs we'll embed:
    jobs = [
        # 1. Stripe Backend SWE Intern in NYC, sponsor friendly. The TARGET match
        #    for our test resume.
        (stripe_id, "j-001", "simplify", "Software Engineer Intern, Backend",
         "New York, NY", "nyc_core", "hybrid",
         "https://example.com/stripe-001",
         "intern", "friendly"),
        # 2. Stripe Senior PM. Senior level → should get hard-filtered out
        #    when prefs ask for intern only.
        (stripe_id, "j-002", "greenhouse", "Senior Product Manager, Payments",
         "San Francisco, CA", "", "remote",
         "https://example.com/stripe-002",
         "senior", "friendly"),
        # 3. Stripe ML Engineer Intern, REMOTE. With work_type=hybrid filter
        #    this should be filtered out.
        (stripe_id, "j-003", "simplify", "Machine Learning Engineer Intern",
         "Remote", "", "remote",
         "https://example.com/stripe-003",
         "intern", "friendly"),
        # 4. DentalCorp Software Intern. Should appear (no hard filter dropping
        #    it) but score lower than Stripe due to weaker token overlap and
        #    no sponsorship friendliness.
        (dental_id, "j-004", "simplify", "Software Engineer Intern",
         "Boston, MA", "", "hybrid",
         "https://example.com/dental-004",
         "intern", ""),
    ]
    for j in jobs:
        conn.execute(
            "INSERT INTO job_listings (company_id, external_id, source, title, "
            "location_raw, location_tier, work_type, apply_url, level, "
            "sponsorship_signal, posted_at, first_seen_at, is_active) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2025-04-01', '2025-04-01', 1)",
            j,
        )
    conn.commit()

    # Test resume — backend SWE intern candidate.
    resume_data = {
        "name": "Test User",
        "role": "Software Engineer Intern",
        "summary": "Backend developer with Python and PostgreSQL experience.",
        "skills": {
            "languages": ["Python", "JavaScript"],
            "tools": ["PostgreSQL", "Docker", "Redis", "FastAPI"],
        },
        "experience": [
            {"company": "ACME", "role": "Software Engineer Intern",
             "date": "2024", "bullets": ["Built backend services in Python"]},
        ],
        "education": [{"school": "NYU", "degree": "BS Computer Science"}],
        "projects": [],
    }
    conn.execute(
        "INSERT INTO resumes (id, name, role, filename, resume_data) "
        "VALUES (?, ?, ?, ?, ?)",
        ("test-resume-1", "Test User", "Software Engineer Intern", "test.pdf",
         json.dumps(resume_data)),
    )
    conn.commit()
    conn.close()
    return db_path


# ────────────────────────────────────────────────────────────────────
# Unit tests
# ────────────────────────────────────────────────────────────────────

def test_compose_job_text():
    row = {
        "title": "Senior Software Engineer, Backend",
        "level": "senior", "years_min": 5,
        "work_type": "hybrid", "location_raw": "New York, NY",
        "department": "Engineering",
        "display_name": "Stripe", "industry": "fintech",
    }
    text = compose_job_text(row)
    for token in ["Senior Software Engineer", "Stripe", "fintech",
                  "senior level", "5+ years", "hybrid", "New York"]:
        assert token in text, f"{token!r} missing from {text!r}"
    print(f"  ✓ job text: {text!r}")


def test_compose_resume_text():
    data = {
        "role": "ML Engineer",
        "summary": "ML platform builder.",
        "skills": {"langs": ["Python"], "ml": ["PyTorch", "JAX"]},
        "experience": [{"company": "AI Co", "role": "Senior ML Engineer"}],
        "education": [{"school": "MIT", "degree": "MS"}],
    }
    prefs = {"levels": ["senior"], "role_families": ["ml"]}
    text = compose_resume_text(data, prefs)
    for token in ["ML Engineer", "Python", "PyTorch", "Senior ML Engineer",
                  "MIT", "Looking for", "senior"]:
        assert token in text, f"{token!r} missing"
    print("  ✓ resume text composed correctly")


def test_compose_resume_text_handles_empty():
    text = compose_resume_text({"name": "X"})
    assert text  # never empty (fallback to "Software Engineer")
    print("  ✓ empty resume → safe fallback")


def test_blob_roundtrip():
    v = np.array([1.5, -0.5, 3.14], dtype=np.float32)
    assert np.array_equal(blob_to_vec(vec_to_blob(v)), v)
    print("  ✓ blob<->vec roundtrip")


def test_hard_filter_compose():
    sql, params = build_where_clause({
        "levels": ["intern", "new_grad"],
        "location_tiers": ["nyc_core"],
        "work_types": ["hybrid", "remote"],
        "needs_sponsorship": True,
        "exclude_companies": ["BadCorp"],
    })
    assert "jl.level IN (?,?)" in sql
    assert "jl.location_tier IN (?)" in sql
    assert "jl.work_type IN (?,?)" in sql
    assert "sponsorship_signal != 'unfriendly'" in sql
    assert "c.display_name NOT LIKE ?" in sql
    assert params == ["intern", "new_grad", "nyc_core", "hybrid", "remote", "%BadCorp%"]
    print("  ✓ hard filter SQL composition")


def test_hard_filter_empty_prefs():
    sql, params = build_where_clause({})
    assert sql == ""
    assert params == []
    sql, params = build_where_clause(None)
    assert sql == ""
    assert params == []
    print("  ✓ empty prefs → no extra filter")


def test_skill_overlap():
    assert skill_overlap(["python", "react"], "Python developer building React apps") == 1.0
    assert skill_overlap(["python", "react", "rust"],
                          "Python developer building React apps") == 2 / 3
    assert skill_overlap([], "anything") == 0.0
    print("  ✓ skill overlap math")


def test_sponsor_bonus():
    # When sponsorship needed:
    assert sponsor_bonus("friendly", True) == 1.0
    assert sponsor_bonus("unfriendly", True) == 0.0
    assert sponsor_bonus("", True) == 0.4
    # When not needed: neutral.
    assert sponsor_bonus("friendly", False) == 0.5
    assert sponsor_bonus("unfriendly", False) == 0.5
    print("  ✓ sponsor bonus")


def test_recency_bonus():
    from datetime import datetime, timedelta, timezone
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    old = (datetime.now(timezone.utc) - timedelta(days=200)).strftime("%Y-%m-%d")
    assert recency_bonus(today, None) >= 0.99
    assert 0.95 <= recency_bonus(yesterday, None) <= 1.0
    assert recency_bonus(old, None) == 0.0
    assert recency_bonus(None, None) == 0.5
    assert recency_bonus("not a date", None) == 0.5
    print("  ✓ recency bonus")


# ────────────────────────────────────────────────────────────────────
# Pipeline test
# ────────────────────────────────────────────────────────────────────

def _populate_embeddings(db_path: Path) -> None:
    """Compute (fake-)embeddings for every active job in the test DB."""
    with patch.object(embed_mod, "embed_texts", side_effect=_fake_embed_texts), \
         patch.object(embed_mod, "DB_PATH", db_path):
        embed_mod.compute_all_embeddings(only_missing=False, db_path=db_path)


def test_full_pipeline_intern_in_nyc():
    db_path = _make_db()
    try:
        _populate_embeddings(db_path)

        prefs = {
            "levels": ["intern"],
            "location_tiers": ["nyc_core"],
            "work_types": ["hybrid"],
            "needs_sponsorship": True,
        }

        with patch.object(embed_mod, "embed_texts", side_effect=_fake_embed_texts), \
             patch.object(embed_mod, "DB_PATH", db_path), \
             patch.object(matcher_mod, "DB_PATH", db_path):
            results = matcher_mod.match(
                resume_id="test-resume-1",
                preferences=prefs,
                top_k=10,
                db_path=db_path,
            )

        # Hard-filter expectations:
        #   j-001 (intern + nyc_core + hybrid)              → KEEP
        #   j-002 (senior; wrong level)                     → DROP
        #   j-003 (intern but remote not hybrid + non-nyc)  → DROP
        #   j-004 (intern + Boston not nyc_core)            → DROP
        # → only j-001 passes hard filter.
        assert len(results) == 1, [r["title"] for r in results]
        top = results[0]
        assert top["company"] == "Stripe", top
        assert top["title"] == "Software Engineer Intern, Backend", top
        assert "score" in top and top["score"] > 0
        assert "score_parts" in top
        assert top["score_parts"]["sponsor"] == 1.0
        print(f"  ✓ pipeline: top match = {top['company']} / {top['title']}")
        print(f"    score breakdown: {top['score_parts']}")
    finally:
        db_path.unlink(missing_ok=True)


def test_full_pipeline_relaxed_prefs():
    """Without hard filters, all 4 jobs should appear and Stripe SWE Intern
    should still beat the others (token overlap with the resume is highest)."""
    db_path = _make_db()
    try:
        _populate_embeddings(db_path)

        with patch.object(embed_mod, "embed_texts", side_effect=_fake_embed_texts), \
             patch.object(embed_mod, "DB_PATH", db_path), \
             patch.object(matcher_mod, "DB_PATH", db_path):
            results = matcher_mod.match(
                resume_id="test-resume-1",
                preferences={"needs_sponsorship": True},
                top_k=10,
                db_path=db_path,
            )

        # All 4 jobs should appear (no hard filter).
        assert len(results) == 4, [r["title"] for r in results]

        # The Stripe SWE Intern should be #1 — strongest token overlap with
        # resume + sponsor friendly.
        top = results[0]
        assert top["company"] == "Stripe"
        assert "Backend" in top["title"]
        print(f"  ✓ relaxed: top = {top['title']} @ Stripe (cosine={top['score_parts']['cosine']})")

        # The DentalCorp job should be near the bottom — same level, but
        # weaker semantic overlap and no sponsor signal.
        dental = next(r for r in results if r["company"] == "DentalCorp")
        assert dental["score_parts"]["sponsor"] == 0.4   # silent → 0.4
        print(f"  ✓ DentalCorp position: {results.index(dental) + 1}/4 (sponsor=0.4)")
    finally:
        db_path.unlink(missing_ok=True)


def test_recall_only_runs_active_with_embedding():
    """Jobs without an embedding are invisible to the matcher even if
    they pass the hard filter — important guarantee for safety."""
    db_path = _make_db()
    try:
        # Embed only j-001 and j-004; leave j-002, j-003 with NULL embedding.
        with patch.object(embed_mod, "embed_texts", side_effect=_fake_embed_texts), \
             patch.object(embed_mod, "DB_PATH", db_path):
            conn = sqlite3.connect(str(db_path))
            try:
                rows = conn.execute(
                    "SELECT jl.id, jl.title, jl.level, jl.years_min, jl.work_type, "
                    "jl.location_raw, jl.department, c.display_name, c.industry "
                    "FROM job_listings jl JOIN companies c ON c.id = jl.company_id "
                    "WHERE jl.external_id IN ('j-001','j-004')"
                ).fetchall()
            finally:
                conn.close()
            texts = [compose_job_text(dict(zip(
                ['id','title','level','years_min','work_type','location_raw',
                 'department','display_name','industry'], r))) for r in rows]
            vecs = _fake_embed_texts(texts)
            conn = sqlite3.connect(str(db_path))
            try:
                for r, v in zip(rows, vecs):
                    conn.execute(
                        "UPDATE job_listings SET embedding = ? WHERE id = ?",
                        (vec_to_blob(v), r[0]),
                    )
                conn.commit()
            finally:
                conn.close()

        with patch.object(embed_mod, "embed_texts", side_effect=_fake_embed_texts), \
             patch.object(embed_mod, "DB_PATH", db_path), \
             patch.object(matcher_mod, "DB_PATH", db_path):
            results = matcher_mod.match(
                resume_id="test-resume-1",
                preferences={},  # no hard filter
                db_path=db_path,
            )
        titles = [r["title"] for r in results]
        # j-002 and j-003 must NOT appear (no embedding stored).
        assert all("Senior Product Manager" not in t for t in titles), titles
        assert all("Machine Learning" not in t for t in titles), titles
        assert len(results) == 2, titles
        print("  ✓ jobs without embedding are invisible to matcher")
    finally:
        db_path.unlink(missing_ok=True)


if __name__ == "__main__":
    print("test_compose_job_text"); test_compose_job_text()
    print("test_compose_resume_text"); test_compose_resume_text()
    print("test_compose_resume_text_handles_empty"); test_compose_resume_text_handles_empty()
    print("test_blob_roundtrip"); test_blob_roundtrip()
    print("test_hard_filter_compose"); test_hard_filter_compose()
    print("test_hard_filter_empty_prefs"); test_hard_filter_empty_prefs()
    print("test_skill_overlap"); test_skill_overlap()
    print("test_sponsor_bonus"); test_sponsor_bonus()
    print("test_recency_bonus"); test_recency_bonus()
    print("test_full_pipeline_intern_in_nyc"); test_full_pipeline_intern_in_nyc()
    print("test_full_pipeline_relaxed_prefs"); test_full_pipeline_relaxed_prefs()
    print("test_recall_only_runs_active_with_embedding"); test_recall_only_runs_active_with_embedding()
    print("\nALL TESTS PASSED")
