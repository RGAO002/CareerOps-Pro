"""
USCIS H-1B Employer Data Hub loader.

Source page:
    https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub
File pattern:
    https://www.uscis.gov/sites/default/files/document/data/h1b_datahubexport-{FY}.csv

Each row is one (FY, employer, worksite city/state) triple with four counters:
    Initial Approval / Initial Denial / Continuing Approval / Continuing Denial

We pre-aggregate by (normalized employer, FY) at ingest time — a company like
Amazon has 20+ subsidiary entities in a single FY, and we want one number per
company per year for downstream rollup. The raw per-row data is not preserved
because we only need the aggregated totals to derive sponsorship signals.

This is the AUTHORITATIVE source for "does company X actually sponsor H-1B?".
The DOL LCA disclosure (h1b_sponsors table) is application-level data — what
employers wanted to file. USCIS approvals are decision-level data — what
USCIS actually granted. For surfacing trustworthy "sponsor friendly" signals
to job seekers, USCIS approvals beat LCA filings.
"""
from __future__ import annotations

import csv
import sqlite3
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from services.h1b.sponsor_normalize import normalize_employer_name


@dataclass
class _AggBucket:
    initial_approvals: int = 0
    initial_denials: int = 0
    continuing_approvals: int = 0
    continuing_denials: int = 0
    sample_raw: str = ""
    state_counts: Counter = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.state_counts is None:
            self.state_counts = Counter()


_EXPECTED_HEADER = (
    "Fiscal Year",
    "Employer",
    "Initial Approval",
    "Initial Denial",
    "Continuing Approval",
    "Continuing Denial",
)


def _to_int(v) -> int:
    if v is None or v == "":
        return 0
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return 0


def iter_uscis_csv(csv_path: Path) -> Iterable[dict]:
    """Yield raw rows from a USCIS H-1B Data Hub CSV.

    Reads the standard 11-column header. Skips rows missing employer name.
    """
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        # Sanity-check: headers may shift slightly across years.
        for required in _EXPECTED_HEADER:
            if required not in reader.fieldnames:
                raise ValueError(
                    f"USCIS CSV {csv_path.name} missing column '{required}'. "
                    f"Found: {reader.fieldnames}"
                )
        for row in reader:
            employer = (row.get("Employer") or "").strip()
            if not employer:
                continue
            yield row


def aggregate_uscis_csv(csv_path: Path) -> dict[tuple[str, int], _AggBucket]:
    """Roll up one USCIS CSV by (employer_name_norm, fiscal_year).

    Returns a dict keyed on (norm, FY). Each bucket holds summed counters,
    a sample of one raw employer string (for human-readable audit), and the
    most-common worksite state.
    """
    agg: dict[tuple[str, int], _AggBucket] = defaultdict(_AggBucket)
    for row in iter_uscis_csv(csv_path):
        try:
            fy = int(row["Fiscal Year"])
        except (KeyError, ValueError):
            continue
        raw = row["Employer"].strip()
        norm = normalize_employer_name(raw)
        if not norm:
            continue
        bucket = agg[(norm, fy)]
        bucket.initial_approvals    += _to_int(row.get("Initial Approval"))
        bucket.initial_denials      += _to_int(row.get("Initial Denial"))
        bucket.continuing_approvals += _to_int(row.get("Continuing Approval"))
        bucket.continuing_denials   += _to_int(row.get("Continuing Denial"))
        if not bucket.sample_raw:
            bucket.sample_raw = raw
        st = (row.get("State") or "").strip()
        if st:
            bucket.state_counts[st] += 1
    return agg


_UPSERT_SQL = """
INSERT INTO uscis_h1b_approvals (
    employer_name_norm, fiscal_year,
    initial_approvals, initial_denials,
    continuing_approvals, continuing_denials,
    total_approvals,
    employer_name_sample, primary_state
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(employer_name_norm, fiscal_year) DO UPDATE SET
    initial_approvals    = excluded.initial_approvals,
    initial_denials      = excluded.initial_denials,
    continuing_approvals = excluded.continuing_approvals,
    continuing_denials   = excluded.continuing_denials,
    total_approvals      = excluded.total_approvals,
    employer_name_sample = excluded.employer_name_sample,
    primary_state        = excluded.primary_state
"""


def import_uscis_file(csv_path: Path, db_path: Path) -> dict:
    """Import one USCIS CSV. Pre-aggregates per (employer_norm, FY) then upserts.

    Re-running an FY overwrites previous totals — safe and idempotent.

    Returns: {read, employers, fy, inserted}.
    """
    agg = aggregate_uscis_csv(csv_path)
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")

        rows: list[tuple] = []
        unique_fys = set()
        for (norm, fy), bucket in agg.items():
            primary = bucket.state_counts.most_common(1)[0][0] if bucket.state_counts else ""
            total = bucket.initial_approvals + bucket.continuing_approvals
            rows.append((
                norm, fy,
                bucket.initial_approvals, bucket.initial_denials,
                bucket.continuing_approvals, bucket.continuing_denials,
                total,
                bucket.sample_raw, primary,
            ))
            unique_fys.add(fy)

        conn.executemany(_UPSERT_SQL, rows)
        conn.commit()
        return {
            "source_file": csv_path.name,
            "employers":   len(agg),
            "fiscal_years": sorted(unique_fys),
            "rows_written": len(rows),
        }
    finally:
        conn.close()


def backfill_sponsorship_signal_from_company_history(
    db_path: Path,
    threshold_3y: int = 10,
) -> dict:
    """For active jobs with empty sponsorship_signal, set 'company_history' if
    the company has >= threshold_3y verified USCIS H-1B approvals in 3y.

    Does NOT touch jobs that already have an explicit signal — JD-extracted
    'friendly' / 'unfriendly' always wins. The new value lets the UI distinguish
    "JD says they sponsor" (highest trust) from "JD silent but company has a
    proven sponsor track record" (high trust, derived from gov data).

    Returns: {jobs_marked, jobs_remaining_silent}.
    """
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.execute(
            """
            UPDATE job_listings
            SET sponsorship_signal = 'company_history'
            WHERE is_active = 1
              AND COALESCE(sponsorship_signal, '') = ''
              AND company_id IN (
                  SELECT id FROM companies WHERE uscis_h1b_approvals_3y >= ?
              )
            """,
            (threshold_3y,),
        )
        marked = cur.rowcount or 0
        conn.commit()

        remaining = conn.execute(
            """
            SELECT COUNT(*) FROM job_listings
            WHERE is_active = 1 AND COALESCE(sponsorship_signal, '') = ''
            """,
        ).fetchone()[0]

        return {
            "jobs_marked": marked,
            "jobs_remaining_silent": int(remaining),
            "threshold_3y": threshold_3y,
        }
    finally:
        conn.close()


def compute_company_uscis_aggregates(db_path: Path, current_fy: int = 2023) -> dict:
    """Refresh companies.uscis_h1b_approvals_1y / _3y from uscis_h1b_approvals.

    Args:
        current_fy: latest FY available in the data. 1y = current_fy only;
                    3y = current_fy and prior 2 years. Defaults to 2023 (the
                    last year USCIS exposes via direct CSV download).

    Match strategy:
        1. Exact match on companies.normalized_name == uscis.employer_name_norm.
           This catches "AIRBNB INC" → "airbnb" → company "Airbnb".
        2. Companies that didn't exact-match get a second pass against the
           common "{name} {suffix}" pattern (e.g. "amazon" matches USCIS rows
           "amazon com services", "amazon data services", etc.).

    Returns: {companies_with_approvals, total_approvals_3y_summed}.
    """
    conn = sqlite3.connect(str(db_path))
    try:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA temp_store=MEMORY")

        # Build per-company aggregates as a TEMP TABLE, then UPDATE companies.
        conn.executescript(f"""
            DROP TABLE IF EXISTS _uscis_agg;
            CREATE TEMP TABLE _uscis_agg AS
            SELECT
                employer_name_norm,
                SUM(CASE WHEN fiscal_year = {current_fy}      THEN total_approvals ELSE 0 END) AS approvals_1y,
                SUM(CASE WHEN fiscal_year >= {current_fy - 2} THEN total_approvals ELSE 0 END) AS approvals_3y
            FROM uscis_h1b_approvals
            WHERE fiscal_year >= {current_fy - 2}
            GROUP BY employer_name_norm;
            CREATE INDEX _uscis_agg_norm ON _uscis_agg(employer_name_norm);
        """)

        # Step 1: Exact match.
        conn.execute("""
            UPDATE companies SET
                uscis_h1b_approvals_1y = COALESCE(
                    (SELECT approvals_1y FROM _uscis_agg WHERE employer_name_norm = companies.normalized_name),
                    0
                ),
                uscis_h1b_approvals_3y = COALESCE(
                    (SELECT approvals_3y FROM _uscis_agg WHERE employer_name_norm = companies.normalized_name),
                    0
                ),
                updated_at = CURRENT_TIMESTAMP
        """)

        # Step 2: Prefix match for companies still at 0.
        # If our company is "amazon" and USCIS has "amazon com services",
        # "amazon data services", etc., sum them.
        # We require length >= 4 to avoid pathological short-name matches.
        conn.executescript("""
            DROP TABLE IF EXISTS _uscis_prefix;
            CREATE TEMP TABLE _uscis_prefix AS
            SELECT
                c.id AS company_id,
                SUM(a.approvals_1y) AS approvals_1y,
                SUM(a.approvals_3y) AS approvals_3y
            FROM companies c
            JOIN _uscis_agg a ON a.employer_name_norm LIKE c.normalized_name || ' %'
            WHERE c.uscis_h1b_approvals_3y = 0
              AND length(c.normalized_name) >= 4
            GROUP BY c.id;
        """)

        cur = conn.execute("""
            UPDATE companies SET
                uscis_h1b_approvals_1y = COALESCE(
                    (SELECT approvals_1y FROM _uscis_prefix WHERE company_id = companies.id),
                    uscis_h1b_approvals_1y
                ),
                uscis_h1b_approvals_3y = COALESCE(
                    (SELECT approvals_3y FROM _uscis_prefix WHERE company_id = companies.id),
                    uscis_h1b_approvals_3y
                ),
                updated_at = CURRENT_TIMESTAMP
            WHERE id IN (SELECT company_id FROM _uscis_prefix)
        """)
        prefix_added = cur.rowcount or 0
        conn.commit()

        with_any = conn.execute(
            "SELECT COUNT(*) FROM companies WHERE uscis_h1b_approvals_3y > 0"
        ).fetchone()[0]
        total_3y = conn.execute(
            "SELECT COALESCE(SUM(uscis_h1b_approvals_3y), 0) FROM companies"
        ).fetchone()[0]

        conn.execute("DROP TABLE IF EXISTS _uscis_agg")
        conn.execute("DROP TABLE IF EXISTS _uscis_prefix")
        return {
            "companies_with_approvals": with_any,
            "prefix_match_extra": prefix_added,
            "total_approvals_3y_summed": int(total_3y),
        }
    finally:
        conn.close()
