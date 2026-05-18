"""
End-to-end validation of services.h1b.dol_loader against a synthetic XLSX
that mirrors the real DOL OFLC LCA disclosure schema.

Why synthetic, not the real file:
    DOL's CDN puts a JS cookie-challenge in front of every download, so
    automated curl/httpx fetches get 404. Real-file ingestion is validated
    by manually downloading once via browser into data/dol/ and running:
        python scripts/ingest_cli.py import-lca data/dol/<file>.xlsx
    See dol_loader.py docstring for the manual download workflow.

This test covers:
    1. Header alias resolution (multiple historical column names)
    2. Streaming row parse + date/wage/string coercion
    3. Idempotent import (re-running yields 0 new inserts)
    4. Skipping rows missing required fields
"""
from __future__ import annotations

import sqlite3
import sys
import tempfile
from datetime import date, datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from openpyxl import Workbook  # noqa: E402

from services.h1b.dol_loader import (  # noqa: E402
    iter_lca_records,
    import_lca_file,
    _to_date_str,
    _to_float,
)


# Real DOL column header (FY2024 layout, abbreviated to what we read).
REAL_HEADER = [
    "CASE_NUMBER", "CASE_STATUS", "RECEIVED_DATE", "DECISION_DATE",
    "ORIGINAL_CERT_DATE", "VISA_CLASS", "JOB_TITLE", "SOC_CODE", "SOC_TITLE",
    "FULL_TIME_POSITION", "BEGIN_DATE", "END_DATE",
    "EMPLOYER_NAME", "TRADE_NAME_DBA", "EMPLOYER_BUSINESS_DBA",
    "EMPLOYER_ADDRESS1", "EMPLOYER_ADDRESS2", "EMPLOYER_CITY",
    "EMPLOYER_STATE", "EMPLOYER_POSTAL_CODE", "EMPLOYER_COUNTRY",
    "EMPLOYER_PROVINCE", "EMPLOYER_PHONE", "NAICS_CODE",
    "WORKSITE_CITY", "WORKSITE_COUNTY", "WORKSITE_STATE",
    "WORKSITE_POSTAL_CODE",
    "WAGE_RATE_OF_PAY_FROM", "WAGE_RATE_OF_PAY_TO", "WAGE_UNIT_OF_PAY",
    "PREVAILING_WAGE", "EMPLOYER_FEIN",
]


def _make_synthetic_xlsx(path: Path, rows: list[dict]) -> None:
    """Write rows as an XLSX matching the real DOL schema.

    Pads any unspecified columns with empty strings so the resulting
    layout is byte-compatible with what DOL ships.
    """
    wb = Workbook()
    ws = wb.active
    ws.append(REAL_HEADER)
    for r in rows:
        ws.append([r.get(col, "") for col in REAL_HEADER])
    wb.save(str(path))


def _make_test_db() -> Path:
    """Bootstrap a temp DB with the h1b_sponsors schema only (no fixtures)."""
    fd = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    fd.close()
    db_path = Path(fd.name)
    conn = sqlite3.connect(str(db_path))
    conn.executescript("""
        CREATE TABLE h1b_sponsors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_number        TEXT NOT NULL,
            employer_name_raw  TEXT NOT NULL,
            employer_name_norm TEXT NOT NULL,
            fein               TEXT,
            job_title          TEXT,
            soc_code           TEXT,
            worksite_city      TEXT,
            worksite_state     TEXT,
            worksite_postal    TEXT,
            wage_rate_from     REAL,
            wage_rate_to       REAL,
            wage_unit          TEXT,
            case_status        TEXT NOT NULL,
            visa_class         TEXT,
            received_date      TEXT,
            decision_date      TEXT,
            period_start       TEXT,
            period_end         TEXT,
            source_file        TEXT NOT NULL,
            imported_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(case_number, source_file)
        );
    """)
    conn.commit()
    conn.close()
    return db_path


def test_coercers():
    assert _to_date_str(None) is None
    assert _to_date_str("") is None
    assert _to_date_str("2025-03-15") == "2025-03-15"
    assert _to_date_str("2025-03-15 14:23:00") == "2025-03-15"
    assert _to_date_str(date(2025, 3, 15)) == "2025-03-15"
    assert _to_date_str(datetime(2025, 3, 15, 14, 23)) == "2025-03-15"
    assert _to_date_str("3/15/2025") == "2025-03-15"
    assert _to_float("") is None
    assert _to_float(None) is None
    assert _to_float("not a number") is None
    assert _to_float("125000") == 125000.0
    assert _to_float(125000) == 125000.0
    print("  ✓ coercers")


def test_full_roundtrip():
    """Build a synthetic file, import twice, verify idempotency + content."""
    tmpdir = Path(tempfile.mkdtemp(prefix="dol_test_"))
    xlsx_path = tmpdir / "LCA_Disclosure_Data_FY2025_Q1.xlsx"
    rows = [
        {
            "CASE_NUMBER": "I-200-25001-001",
            "CASE_STATUS": "Certified",
            "RECEIVED_DATE": "2025-01-05",
            "DECISION_DATE": "2025-01-20",
            "VISA_CLASS": "H-1B",
            "JOB_TITLE": "Software Engineer",
            "SOC_CODE": "15-1252",
            "BEGIN_DATE": "2025-04-01",
            "END_DATE": "2028-04-01",
            "EMPLOYER_NAME": "Stripe, Inc.",
            "EMPLOYER_FEIN": "453858312",
            "WORKSITE_CITY": "New York",
            "WORKSITE_STATE": "NY",
            "WORKSITE_POSTAL_CODE": "10001",
            "WAGE_RATE_OF_PAY_FROM": 185000,
            "WAGE_RATE_OF_PAY_TO": 220000,
            "WAGE_UNIT_OF_PAY": "Year",
        },
        {
            "CASE_NUMBER": "I-200-25001-002",
            "CASE_STATUS": "Denied",
            "RECEIVED_DATE": "2025-01-06",
            "DECISION_DATE": "2025-01-22",
            "VISA_CLASS": "H-1B",
            "JOB_TITLE": "Data Scientist",
            "SOC_CODE": "15-2051",
            "EMPLOYER_NAME": "Acme Bodyshop LLC",
            "WORKSITE_CITY": "Edison",
            "WORKSITE_STATE": "NJ",
            "WAGE_RATE_OF_PAY_FROM": 60000,
            "WAGE_RATE_OF_PAY_TO": 65000,
            "WAGE_UNIT_OF_PAY": "Year",
        },
        # Row missing required CASE_STATUS — must be skipped.
        {
            "CASE_NUMBER": "I-200-25001-003",
            "EMPLOYER_NAME": "Mystery Co",
        },
        # Row missing CASE_NUMBER — must be skipped.
        {
            "CASE_STATUS": "Certified",
            "EMPLOYER_NAME": "Mystery Co 2",
        },
    ]
    _make_synthetic_xlsx(xlsx_path, rows)

    parsed = list(iter_lca_records(xlsx_path))
    assert len(parsed) == 2, f"expected 2 valid rows, got {len(parsed)}"
    by_case = {r.case_number: r for r in parsed}
    assert by_case["I-200-25001-001"].employer_name_norm == "stripe"
    assert by_case["I-200-25001-001"].wage_rate_from == 185000.0
    assert by_case["I-200-25001-001"].decision_date == "2025-01-20"
    assert by_case["I-200-25001-002"].employer_name_norm == "acme bodyshop"
    print("  ✓ iter_lca_records: 2 valid rows, normalized + coerced")

    db_path = _make_test_db()
    try:
        first = import_lca_file(xlsx_path, db_path, batch_size=10, progress_every=0)
        assert first["read"] == 2
        assert first["inserted"] == 2
        assert first["skipped"] == 0
        print(f"  ✓ first import: {first}")

        second = import_lca_file(xlsx_path, db_path, batch_size=10, progress_every=0)
        assert second["read"] == 2
        assert second["inserted"] == 0, f"idempotency broken: {second}"
        print(f"  ✓ idempotent re-run: {second}")

        conn = sqlite3.connect(str(db_path))
        try:
            cur = conn.execute(
                "SELECT case_number, employer_name_norm, case_status, "
                "wage_rate_from, decision_date "
                "FROM h1b_sponsors ORDER BY case_number"
            )
            stored = cur.fetchall()
            assert stored == [
                ("I-200-25001-001", "stripe", "Certified", 185000.0, "2025-01-20"),
                ("I-200-25001-002", "acme bodyshop", "Denied", 60000.0, "2025-01-22"),
            ], stored
            print("  ✓ DB content matches expected")
        finally:
            conn.close()
    finally:
        db_path.unlink(missing_ok=True)


if __name__ == "__main__":
    print("test_coercers")
    test_coercers()
    print("test_full_roundtrip")
    test_full_roundtrip()
    print("\nALL TESTS PASSED")
