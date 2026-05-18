"""
Validate aggregate.compute_company_lca_aggregates and top_sponsors.

Builds a small fixture DB with three employers across H-1B / Denied / outside
the lookback window, plus two seeded companies, and asserts:
    - 1y / 3y certified counts match expectation
    - non-Certified statuses excluded
    - non-sponsorship visa classes excluded (e.g. PERM bleed)
    - top_sponsors only_unseeded filter works
    - top_sponsors excludes empty employers and surfaces sample_state
"""
from __future__ import annotations

import sqlite3
import sys
import tempfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from services.h1b.aggregate import (  # noqa: E402
    compute_company_lca_aggregates,
    top_sponsors,
)


def _make_test_db() -> Path:
    fd = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    fd.close()
    db_path = Path(fd.name)
    conn = sqlite3.connect(str(db_path))
    conn.executescript("""
        CREATE TABLE companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            normalized_name TEXT NOT NULL,
            h1b_lca_count_1y INTEGER DEFAULT 0,
            h1b_lca_count_3y INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE h1b_sponsors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_number TEXT NOT NULL,
            employer_name_raw TEXT NOT NULL,
            employer_name_norm TEXT NOT NULL,
            case_status TEXT NOT NULL,
            visa_class TEXT,
            decision_date TEXT,
            worksite_state TEXT,
            source_file TEXT NOT NULL DEFAULT 'fixture.xlsx',
            UNIQUE(case_number, source_file)
        );
        CREATE INDEX idx_h1b_employer_norm ON h1b_sponsors(employer_name_norm);
        CREATE INDEX idx_h1b_decision_date ON h1b_sponsors(decision_date);
    """)

    # Two seeded companies (one matches LCA data, one doesn't)
    conn.executemany(
        "INSERT INTO companies (slug, display_name, normalized_name) VALUES (?, ?, ?)",
        [
            ("stripe",   "Stripe",         "stripe"),
            ("orphanco", "Orphan Co",      "orphan co"),  # no LCAs
        ],
    )

    # LCA fixtures. Use SQLite date('now', '-Nd') idiom for stable test dates.
    conn.executescript("""
        -- Stripe: 2 H-1B Certified in last 60 days, 1 in last 800 days, 1 Denied
        INSERT INTO h1b_sponsors (case_number, employer_name_raw, employer_name_norm,
                                  case_status, visa_class, decision_date, worksite_state, source_file)
        VALUES
          ('I-001', 'Stripe Inc.',      'stripe', 'Certified',           'H-1B', date('now', '-30 days'),  'CA', 'fixture.xlsx'),
          ('I-002', 'Stripe Inc.',      'stripe', 'Certified',           'H-1B', date('now', '-60 days'),  'NY', 'fixture.xlsx'),
          ('I-003', 'Stripe Inc.',      'stripe', 'Certified-Withdrawn', 'H-1B', date('now', '-800 days'), 'CA', 'fixture.xlsx'),
          ('I-004', 'Stripe Inc.',      'stripe', 'Denied',              'H-1B', date('now', '-10 days'),  'CA', 'fixture.xlsx'),
          -- Stripe PERM filing -> excluded (visa_class not in sponsorship list)
          ('I-005', 'Stripe Inc.',      'stripe', 'Certified',           'PERM', date('now', '-30 days'),  'CA', 'fixture.xlsx');

        -- BigSponsor (not seeded): 5 in last 1y, 8 in last 3y
        INSERT INTO h1b_sponsors (case_number, employer_name_raw, employer_name_norm,
                                  case_status, visa_class, decision_date, worksite_state, source_file)
        VALUES
          ('B-001', 'Big Sponsor LLC',  'big sponsor', 'Certified', 'H-1B', date('now', '-50 days'),  'TX', 'fixture.xlsx'),
          ('B-002', 'Big Sponsor LLC',  'big sponsor', 'Certified', 'H-1B', date('now', '-100 days'), 'TX', 'fixture.xlsx'),
          ('B-003', 'Big Sponsor LLC',  'big sponsor', 'Certified', 'H-1B', date('now', '-150 days'), 'TX', 'fixture.xlsx'),
          ('B-004', 'Big Sponsor LLC',  'big sponsor', 'Certified', 'H-1B', date('now', '-200 days'), 'TX', 'fixture.xlsx'),
          ('B-005', 'Big Sponsor LLC',  'big sponsor', 'Certified', 'H-1B', date('now', '-300 days'), 'NY', 'fixture.xlsx'),
          ('B-006', 'Big Sponsor LLC',  'big sponsor', 'Certified', 'H-1B', date('now', '-500 days'), 'TX', 'fixture.xlsx'),
          ('B-007', 'Big Sponsor LLC',  'big sponsor', 'Certified', 'H-1B', date('now', '-700 days'), 'TX', 'fixture.xlsx'),
          ('B-008', 'Big Sponsor LLC',  'big sponsor', 'Certified', 'H-1B', date('now', '-900 days'), 'TX', 'fixture.xlsx');

        -- TooOld (not seeded): 5 certified, but ALL outside the 3y window
        INSERT INTO h1b_sponsors (case_number, employer_name_raw, employer_name_norm,
                                  case_status, visa_class, decision_date, worksite_state, source_file)
        VALUES
          ('O-001', 'TooOld Inc',       'tooold', 'Certified', 'H-1B', date('now', '-1500 days'), 'CA', 'fixture.xlsx'),
          ('O-002', 'TooOld Inc',       'tooold', 'Certified', 'H-1B', date('now', '-1600 days'), 'CA', 'fixture.xlsx'),
          ('O-003', 'TooOld Inc',       'tooold', 'Certified', 'H-1B', date('now', '-1700 days'), 'CA', 'fixture.xlsx'),
          ('O-004', 'TooOld Inc',       'tooold', 'Certified', 'H-1B', date('now', '-1800 days'), 'CA', 'fixture.xlsx'),
          ('O-005', 'TooOld Inc',       'tooold', 'Certified', 'H-1B', date('now', '-1900 days'), 'CA', 'fixture.xlsx');
    """)

    conn.commit()
    conn.close()
    return db_path


def test_compute_company_aggregates():
    db_path = _make_test_db()
    try:
        result = compute_company_lca_aggregates(db_path)
        # Both rows in companies get UPDATEd (touched), even Orphan Co (set to 0).
        assert result["companies_updated"] == 2, result
        assert result["with_any_lca"] == 1, result   # only Stripe matches

        conn = sqlite3.connect(str(db_path))
        try:
            row = conn.execute(
                "SELECT h1b_lca_count_1y, h1b_lca_count_3y "
                "FROM companies WHERE slug = 'stripe'"
            ).fetchone()
            # 2 certified in last 60d → c_1y = 2
            # 2 certified in last 60d + 1 certified-withdrawn at 800d = 3 → c_3y
            # PERM filing must NOT be counted; Denied must NOT be counted
            assert row == (2, 3), f"Stripe counts wrong: {row}"
            print(f"  ✓ Stripe: 1y={row[0]}, 3y={row[1]}")

            row = conn.execute(
                "SELECT h1b_lca_count_1y, h1b_lca_count_3y "
                "FROM companies WHERE slug = 'orphanco'"
            ).fetchone()
            assert row == (0, 0), f"Orphan Co should be zero: {row}"
            print(f"  ✓ Orphan Co reset to 0 cleanly")
        finally:
            conn.close()
    finally:
        db_path.unlink(missing_ok=True)


def test_top_sponsors_only_unseeded():
    db_path = _make_test_db()
    try:
        result = top_sponsors(db_path, limit=10, since_days=1095, only_unseeded=True)
        # Stripe is seeded → excluded. TooOld outside window → excluded.
        # Only Big Sponsor remains.
        assert len(result) == 1, [s.employer_name_norm for s in result]
        s = result[0]
        assert s.employer_name_norm == "big sponsor"
        assert s.certified_1y == 5         # 5 within 365d
        assert s.certified_3y == 8         # 8 within 1095d
        assert s.in_companies_table is False
        assert s.sample_state == "TX"      # most-common worksite state
        assert "Big Sponsor" in s.employer_name_sample
        print(f"  ✓ unseeded discovery: big sponsor 1y={s.certified_1y} 3y={s.certified_3y} state={s.sample_state}")
    finally:
        db_path.unlink(missing_ok=True)


def test_top_sponsors_include_seeded():
    db_path = _make_test_db()
    try:
        result = top_sponsors(db_path, limit=10, since_days=1095, only_unseeded=False)
        names = {s.employer_name_norm: s for s in result}
        # Stripe seeded; Big Sponsor not. TooOld outside window — excluded.
        assert "stripe" in names
        assert "big sponsor" in names
        assert "tooold" not in names
        assert names["stripe"].in_companies_table is True
        assert names["big sponsor"].in_companies_table is False
        # Sort: Big Sponsor (8) > Stripe (3)
        assert result[0].employer_name_norm == "big sponsor"
        print("  ✓ include-seeded ordering + flag correct")
    finally:
        db_path.unlink(missing_ok=True)


if __name__ == "__main__":
    print("test_compute_company_aggregates")
    test_compute_company_aggregates()
    print("test_top_sponsors_only_unseeded")
    test_top_sponsors_only_unseeded()
    print("test_top_sponsors_include_seeded")
    test_top_sponsors_include_seeded()
    print("\nALL TESTS PASSED")
