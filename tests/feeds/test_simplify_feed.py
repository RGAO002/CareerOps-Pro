"""
End-to-end test for services.feeds.simplify_feed against a synthetic
listings.json fixture. Validates:
    - active+visible+category+terms filtering
    - sponsorship mapping (Offers / Does Not / Citizenship Required / Other)
    - role_filter integration
    - auto-creation of unknown companies (ats_vendor='external')
    - cross-source dedup (skip if matching greenhouse row exists)
    - stale retirement (rows from previous run not seen this run → is_active=0)
    - utm tracking-param stripping
"""
from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from services.feeds import simplify_feed  # noqa: E402


def _make_test_db() -> Path:
    fd = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    fd.close()
    db_path = Path(fd.name)
    conn = sqlite3.connect(str(db_path))
    conn.executescript("""
        CREATE TABLE companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug               TEXT UNIQUE NOT NULL,
            display_name       TEXT NOT NULL,
            normalized_name    TEXT NOT NULL,
            aliases            JSON DEFAULT '[]',
            domain             TEXT,
            careers_url        TEXT,
            ats_vendor         TEXT,
            ats_slug           TEXT,
            ats_config         JSON DEFAULT '{}',
            hq_city            TEXT,
            hq_state           TEXT,
            industry           TEXT,
            is_bodyshop        INTEGER DEFAULT 0,
            is_active          INTEGER DEFAULT 1,
            h1b_lca_count_1y   INTEGER DEFAULT 0,
            h1b_lca_count_3y   INTEGER DEFAULT 0,
            last_fetched_at    TIMESTAMP,
            last_fetch_status  TEXT,
            last_fetch_error   TEXT,
            consecutive_fetch_errors INTEGER DEFAULT 0,
            created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_companies_normalized ON companies(normalized_name);

        CREATE TABLE job_listings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            external_id TEXT NOT NULL,
            source TEXT NOT NULL,
            title TEXT NOT NULL,
            location_raw TEXT DEFAULT '', location_city TEXT DEFAULT '',
            location_state TEXT DEFAULT '', location_country TEXT DEFAULT '',
            is_nyc_metro INTEGER DEFAULT 0, location_tier TEXT DEFAULT '',
            work_type TEXT DEFAULT '', department TEXT DEFAULT '',
            team TEXT DEFAULT '', employment_type TEXT DEFAULT '',
            description_html TEXT DEFAULT '', description_text TEXT DEFAULT '',
            requirements JSON DEFAULT '[]',
            salary_min REAL, salary_max REAL, salary_currency TEXT DEFAULT 'USD',
            apply_url TEXT NOT NULL,
            posted_at TEXT, updated_ats_at TEXT,
            level TEXT DEFAULT '', years_min INTEGER, sponsorship_signal TEXT DEFAULT '',
            first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_active INTEGER DEFAULT 1,
            UNIQUE(source, external_id)
        );
    """)
    # Seed one known company (Stripe) so we can exercise the existing-match path.
    conn.execute(
        "INSERT INTO companies (slug, display_name, normalized_name, ats_vendor, ats_slug) "
        "VALUES ('stripe', 'Stripe', 'stripe', 'greenhouse', 'stripe')"
    )
    # Seed one greenhouse job to exercise cross-source dedup.
    stripe_id = conn.execute("SELECT id FROM companies WHERE slug='stripe'").fetchone()[0]
    conn.execute(
        "INSERT INTO job_listings (company_id, external_id, source, title, apply_url) "
        "VALUES (?, 'gh-9999', 'greenhouse', 'Software Engineer Intern', 'https://x')",
        (stripe_id,),
    )
    conn.commit()
    conn.close()
    return db_path


def _write_fixture_listings(dest_dir: Path, repo_label: str, listings: list[dict]) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    p = dest_dir / f"{repo_label}.json"
    with open(p, "w") as f:
        json.dump(listings, f)
    return p


def _make_listing(**kwargs) -> dict:
    """Default-fill the SimplifyJobs listing schema."""
    return {
        "id": kwargs.get("id"),
        "company_name": kwargs.get("company_name", "Some Company"),
        "company_url": "https://simplify.jobs/c/x",
        "title": kwargs.get("title", "Software Engineer Intern"),
        "url": kwargs.get("url", "https://example.com/apply"),
        "category": kwargs.get("category", "Software"),
        "terms": kwargs.get("terms", ["Summer 2026"]),
        "degrees": ["Bachelor's"],
        "active": kwargs.get("active", True),
        "is_visible": kwargs.get("is_visible", True),
        "sponsorship": kwargs.get("sponsorship", "Other"),
        "locations": kwargs.get("locations", ["New York, NY"]),
        "date_posted": kwargs.get("date_posted", 1735689600),
        "date_updated": kwargs.get("date_updated", 1735689600),
        "source": "Simplify",
    }


FIXTURE_LISTINGS = [
    # 1. Stripe SWE intern — should be cross-source-dedupe'd against the
    # pre-seeded greenhouse row with the same title.
    _make_listing(
        id="simp-001", company_name="Stripe", title="Software Engineer Intern",
        url="https://job-boards.greenhouse.io/stripe/jobs/9999?utm_source=Simplify&ref=Simplify",
        sponsorship="Other",
    ),
    # 2. Anthropic ML intern — new company, should be auto-created.
    # Sponsorship "Offers Sponsorship" → friendly.
    _make_listing(
        id="simp-002", company_name="Anthropic", title="Machine Learning Intern",
        url="https://jobs.ashbyhq.com/anthropic/some-uuid?utm_source=Simplify",
        sponsorship="Offers Sponsorship", category="AI/ML/Data",
        locations=["San Francisco, CA"],
    ),
    # 3. Boeing — Citizenship required → unfriendly.
    _make_listing(
        id="simp-003", company_name="Boeing", title="Software Engineer Intern",
        url="https://boeing.wd5.myworkdayjobs.com/EXTERNAL_CAREERS/job/SWE/000",
        sponsorship="U.S. Citizenship is Required", category="Software",
    ),
    # 4. Inactive listing — must be filtered out.
    _make_listing(
        id="simp-004", company_name="GoneCo", title="Software Engineer Intern",
        active=False,
    ),
    # 5. Wrong category — should be filtered.
    _make_listing(
        id="simp-005", company_name="MarketingCo", title="Engineer",
        category="Other",
    ),
    # 6. Sales Engineer — passes category filter but role_filter must drop.
    _make_listing(
        id="simp-006", company_name="Salesy", title="Sales Engineer Intern",
        category="Software",
    ),
    # 7. Old term — should be dropped.
    _make_listing(
        id="simp-007", company_name="OldCo", title="Software Engineer Intern",
        terms=["Summer 2024"],
    ),
    # 8. Multi-location new company — auto-create + first location used.
    _make_listing(
        id="simp-008", company_name="DataDog Labs", title="Data Engineer Intern",
        category="AI/ML/Data",
        locations=["Boston, MA", "New York, NY", "Remote"],
        url="https://jobs.lever.co/datadog/abc?utm_source=Simplify",
    ),
]


def test_full_refresh():
    db_path = _make_test_db()
    fixture_dir = Path(tempfile.mkdtemp(prefix="simp_fixtures_"))
    _write_fixture_listings(fixture_dir, "summer2026", FIXTURE_LISTINGS)

    try:
        # Patch DB_PATH + DOWNLOAD_DIR so the function reads our fixture.
        with patch.object(simplify_feed, "DB_PATH", db_path), \
             patch.object(simplify_feed, "DOWNLOAD_DIR", fixture_dir):
            result = simplify_feed.refresh_simplify_feed(
                repos=["summer2026"], download=False,
            )

        # Expected counter walk:
        #   8 fixture rows
        #   - 1 inactive (simp-004) — filtered at parse
        #   - 1 wrong category (simp-005, "Other") — filtered at parse
        #   - 1 old term (simp-007, "Summer 2024") — filtered at parse
        #   = 5 rows reach the body of refresh_simplify_feed (fetched=5)
        #     - 1 (simp-006 "Sales Engineer") fails role_filter → filtered_role=1
        #     - 4 reach the dedup check (after_filter=4)
        #       - 1 (simp-001 Stripe) cross-source-dups against pre-seeded
        #         greenhouse row → duped_existing=1
        #       - 3 actually upserted: Anthropic, Boeing, DataDog Labs
        #         → upserted=3, all need new companies → companies_auto_created=3
        assert result["fetched"] == 5, result
        assert result["filtered_role"] == 1, result
        assert result["after_filter"] == 4, result
        assert result["duped_existing"] == 1, result
        assert result["upserted"] == 3, result
        assert result["companies_auto_created"] == 3, result
        print(f"  ✓ counters: {result}")

        # Verify auto-created companies
        conn = sqlite3.connect(str(db_path))
        try:
            external = conn.execute(
                "SELECT slug, display_name FROM companies WHERE ats_vendor='external' "
                "ORDER BY slug"
            ).fetchall()
            external_names = [r[1] for r in external]
            assert "Anthropic" in external_names, external_names
            assert "Boeing" in external_names, external_names
            assert "DataDog Labs" in external_names, external_names
            assert "Stripe" not in external_names, "Stripe pre-existed, must not be re-created"
            print(f"  ✓ auto-created externals: {external_names}")

            # Verify upsert content for Anthropic
            row = conn.execute(
                "SELECT title, sponsorship_signal, level, location_raw, apply_url "
                "FROM job_listings WHERE source='simplify' AND external_id='simp-002'"
            ).fetchone()
            assert row[0] == "Machine Learning Intern"
            assert row[1] == "friendly"
            assert row[2] == "intern"  # forced from terms
            assert row[3] == "San Francisco, CA"
            # utm_source must be stripped
            assert "utm_source" not in row[4], row[4]
            print("  ✓ Anthropic row: friendly + intern, utm stripped")

            # Verify Boeing → unfriendly
            row = conn.execute(
                "SELECT sponsorship_signal FROM job_listings "
                "WHERE source='simplify' AND external_id='simp-003'"
            ).fetchone()
            assert row[0] == "unfriendly", row
            print("  ✓ Boeing: U.S. Citizenship → unfriendly")

            # Verify multi-location join
            row = conn.execute(
                "SELECT location_raw FROM job_listings "
                "WHERE source='simplify' AND external_id='simp-008'"
            ).fetchone()
            assert "Boston" in row[0] and "New York" in row[0] and "Remote" in row[0], row
            print("  ✓ DataDog Labs: multi-location preserved")

            # Verify cross-source dedup actually skipped Stripe
            row = conn.execute(
                "SELECT 1 FROM job_listings "
                "WHERE source='simplify' AND external_id='simp-001'"
            ).fetchone()
            assert row is None, "Stripe simplify row should not exist (dup'd)"
            print("  ✓ Stripe simplify row skipped (greenhouse already had it)")
        finally:
            conn.close()
    finally:
        db_path.unlink(missing_ok=True)


def test_stale_retirement():
    db_path = _make_test_db()
    fixture_dir = Path(tempfile.mkdtemp(prefix="simp_fixtures_"))

    # First run: 2 listings.
    first = [
        _make_listing(id="simp-A", company_name="AlphaCorp", title="SWE Intern",
                      url="https://example.com/alpha"),
        _make_listing(id="simp-B", company_name="BetaCorp", title="SWE Intern",
                      url="https://example.com/beta"),
    ]
    _write_fixture_listings(fixture_dir, "summer2026", first)
    with patch.object(simplify_feed, "DB_PATH", db_path), \
         patch.object(simplify_feed, "DOWNLOAD_DIR", fixture_dir):
        r1 = simplify_feed.refresh_simplify_feed(repos=["summer2026"], download=False)
    assert r1["upserted"] == 2

    # Second run: BetaCorp gone, GammaCorp added.
    second = [
        _make_listing(id="simp-A", company_name="AlphaCorp", title="SWE Intern",
                      url="https://example.com/alpha"),
        _make_listing(id="simp-C", company_name="GammaCorp", title="SWE Intern",
                      url="https://example.com/gamma"),
    ]
    _write_fixture_listings(fixture_dir, "summer2026", second)
    with patch.object(simplify_feed, "DB_PATH", db_path), \
         patch.object(simplify_feed, "DOWNLOAD_DIR", fixture_dir):
        r2 = simplify_feed.refresh_simplify_feed(repos=["summer2026"], download=False)

    # Beta should be retired (set is_active=0), Gamma added, Alpha unchanged.
    assert r2["retired"] == 1, r2
    conn = sqlite3.connect(str(db_path))
    try:
        beta_active = conn.execute(
            "SELECT is_active FROM job_listings "
            "WHERE source='simplify' AND external_id='simp-B'"
        ).fetchone()[0]
        assert beta_active == 0, "BetaCorp should be retired"
        gamma_active = conn.execute(
            "SELECT is_active FROM job_listings "
            "WHERE source='simplify' AND external_id='simp-C'"
        ).fetchone()[0]
        assert gamma_active == 1, "GammaCorp should be active"
        alpha_active = conn.execute(
            "SELECT is_active FROM job_listings "
            "WHERE source='simplify' AND external_id='simp-A'"
        ).fetchone()[0]
        assert alpha_active == 1, "AlphaCorp should still be active"
        print("  ✓ stale retirement: Beta→0, Gamma=1, Alpha=1")
    finally:
        conn.close()
        db_path.unlink(missing_ok=True)


def test_strip_tracking():
    cases = [
        ("https://example.com", "https://example.com"),
        ("https://example.com/job?utm_source=Simplify", "https://example.com/job"),
        ("https://example.com/job?ref=Simplify&id=123", "https://example.com/job?id=123"),
        ("https://example.com/job?id=123&utm_source=Simplify&utm_medium=banner",
         "https://example.com/job?id=123"),
        ("https://example.com/job?utm_source=Simplify&ref=Simplify",
         "https://example.com/job"),
    ]
    for raw, expected in cases:
        got = simplify_feed._strip_tracking(raw)
        assert got == expected, f"got {got!r}, want {expected!r} from {raw!r}"
    print(f"  ✓ tracking-param stripping: {len(cases)} cases")


if __name__ == "__main__":
    print("test_strip_tracking")
    test_strip_tracking()
    print("test_full_refresh")
    test_full_refresh()
    print("test_stale_retirement")
    test_stale_retirement()
    print("\nALL TESTS PASSED")
