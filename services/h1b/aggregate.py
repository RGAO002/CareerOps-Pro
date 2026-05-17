"""
LCA aggregation — turn raw h1b_sponsors rows into per-company sponsorship signals.

Two operations:

    compute_company_lca_aggregates(db_path)
        For every row in `companies`, count CERTIFIED LCAs in the last 365d and
        1095d (3y) where employer_name_norm matches companies.normalized_name.
        UPDATEs companies.h1b_lca_count_1y / h1b_lca_count_3y in place.
        These counts become the "sponsor confidence" surface used by the
        recommender + the public browse UI.

    top_sponsors(db_path, limit, since_days)
        For employers in h1b_sponsors that are NOT yet in companies, list those
        with the most certified filings — the seed-expansion candidate pool.
        Lets the operator graduate "this DOL employer is real and big" into a
        new companies row by hand.

Sponsorship truth filter (applied in both functions):
    case_status IN ('Certified', 'Certified-Withdrawn')
        DOL approved the LCA. Denied/Withdrawn don't reflect employer intent.
    visa_class  IN ('H-1B', 'H-1B1', 'E-3')
        All three are work-visa sponsorship paths a student can use.

Time math is anchored on date('now') — the calendar today, not the most recent
LCA we've seen — so old quarterly snapshots naturally age out without code
changes.
"""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path

CERTIFIED_STATUSES = ("Certified", "Certified-Withdrawn")
SPONSORSHIP_VISAS = ("H-1B", "H-1B1", "E-3")

_CERT_FILTER_SQL = (
    "case_status IN ('Certified', 'Certified-Withdrawn') "
    "AND visa_class IN ('H-1B', 'H-1B1', 'E-3') "
    "AND decision_date IS NOT NULL "
    "AND decision_date >= date('now', ?)"
)


@dataclass
class TopSponsor:
    employer_name_norm: str
    employer_name_sample: str   # one raw form (latest filing) for human review
    certified_1y: int
    certified_3y: int
    in_companies_table: bool
    sample_state: str           # most-common worksite state, hint for HQ guess


def compute_company_lca_aggregates(db_path: Path) -> dict:
    """Refresh companies.h1b_lca_count_1y / h1b_lca_count_3y in one pass.

    Returns counters: {"companies_updated": N, "with_any_lca": K}.
    """
    conn = sqlite3.connect(str(db_path))
    try:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA temp_store=MEMORY")

        # Build the per-employer aggregate once, then UPDATE companies in bulk.
        # We use an indexed scan on h1b_sponsors.employer_name_norm so this stays
        # fast even on multi-million row imports.
        conn.executescript("""
            DROP TABLE IF EXISTS _lca_agg;
            CREATE TEMP TABLE _lca_agg AS
            SELECT
                employer_name_norm,
                SUM(CASE WHEN decision_date >= date('now', '-365 days') THEN 1 ELSE 0 END) AS c_1y,
                SUM(CASE WHEN decision_date >= date('now', '-1095 days') THEN 1 ELSE 0 END) AS c_3y
            FROM h1b_sponsors
            WHERE case_status IN ('Certified', 'Certified-Withdrawn')
              AND visa_class IN ('H-1B', 'H-1B1', 'E-3')
              AND decision_date IS NOT NULL
            GROUP BY employer_name_norm;
            CREATE INDEX _lca_agg_norm ON _lca_agg(employer_name_norm);
        """)

        cur = conn.execute("""
            UPDATE companies
            SET h1b_lca_count_1y = COALESCE(
                    (SELECT c_1y FROM _lca_agg WHERE employer_name_norm = companies.normalized_name),
                    0
                ),
                h1b_lca_count_3y = COALESCE(
                    (SELECT c_3y FROM _lca_agg WHERE employer_name_norm = companies.normalized_name),
                    0
                ),
                updated_at = CURRENT_TIMESTAMP
        """)
        companies_updated = cur.rowcount or 0
        conn.commit()

        with_any = conn.execute(
            "SELECT COUNT(*) FROM companies WHERE h1b_lca_count_3y > 0"
        ).fetchone()[0]

        conn.execute("DROP TABLE IF EXISTS _lca_agg")
        return {"companies_updated": companies_updated, "with_any_lca": with_any}
    finally:
        conn.close()


def top_sponsors(
    db_path: Path,
    limit: int = 500,
    since_days: int = 1095,
    only_unseeded: bool = True,
) -> list[TopSponsor]:
    """List the top employers by certified LCA count.

    Args:
        limit: max rows to return
        since_days: lookback window for the count (default 3y)
        only_unseeded: if True, hide employers already in companies table
                       (the discovery use case — find new companies to seed).
                       If False, include all employers with their seeded flag set.

    Returns: list ordered by certified_3y desc.
    """
    conn = sqlite3.connect(str(db_path))
    try:
        conn.row_factory = sqlite3.Row

        # Pre-load the seeded set in memory; it's small (~26 today, max ~1k).
        seeded = {
            row[0]
            for row in conn.execute("SELECT normalized_name FROM companies").fetchall()
        }

        rows = conn.execute(
            f"""
            SELECT
                employer_name_norm,
                MAX(employer_name_raw)  AS sample_raw,
                SUM(CASE WHEN decision_date >= date('now', '-365 days')
                         AND case_status IN ('Certified', 'Certified-Withdrawn')
                         AND visa_class IN ('H-1B', 'H-1B1', 'E-3')
                         THEN 1 ELSE 0 END) AS c_1y,
                SUM(CASE WHEN decision_date >= date('now', ?)
                         AND case_status IN ('Certified', 'Certified-Withdrawn')
                         AND visa_class IN ('H-1B', 'H-1B1', 'E-3')
                         THEN 1 ELSE 0 END) AS c_window,
                (SELECT worksite_state
                 FROM h1b_sponsors h2
                 WHERE h2.employer_name_norm = h.employer_name_norm
                   AND h2.worksite_state IS NOT NULL AND h2.worksite_state != ''
                 GROUP BY worksite_state
                 ORDER BY COUNT(*) DESC LIMIT 1) AS sample_state
            FROM h1b_sponsors h
            WHERE employer_name_norm != ''
            GROUP BY employer_name_norm
            HAVING c_window > 0
            ORDER BY c_window DESC
            LIMIT ?
            """,
            (f"-{since_days} days", limit * 4 if only_unseeded else limit),
        ).fetchall()

        out: list[TopSponsor] = []
        for r in rows:
            in_seeded = r["employer_name_norm"] in seeded
            if only_unseeded and in_seeded:
                continue
            out.append(TopSponsor(
                employer_name_norm=r["employer_name_norm"],
                employer_name_sample=r["sample_raw"] or "",
                certified_1y=int(r["c_1y"] or 0),
                certified_3y=int(r["c_window"] or 0),
                in_companies_table=in_seeded,
                sample_state=r["sample_state"] or "",
            ))
            if len(out) >= limit:
                break
        return out
    finally:
        conn.close()
