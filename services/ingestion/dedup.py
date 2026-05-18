"""
Dedup + upsert + retirement logic for job_listings.

Two operations matter:
  1. upsert_job_listing — on every fetch, insert new rows or update existing
     rows (preserving first_seen_at). Keyed by (source, external_id).
  2. retire_stale_for_company — after a successful refresh, mark any listings
     we previously had for this company/vendor but did NOT see this round as
     is_active=0. Soft-delete preserves tracker provenance.
"""
from __future__ import annotations

from typing import Iterable

from services.ats.base import RawJob
from services.ingestion.jd_extractor import extract as extract_jd_fields


async def upsert_job_listing(
    db,
    company_id: int,
    raw: RawJob,
    loc: dict,
) -> None:
    """Insert or update a single job listing.

    ``loc`` is the dict returned by ``classify_location``.

    JD-derived fields (level, years_min, sponsorship_signal, work_type if
    not already set by the ATS) are computed inline so every newly-ingested
    row is fully structured by the time it lands.
    """
    jd = extract_jd_fields(raw.title, raw.description_text, raw.location_raw)
    # Only override raw.work_type when we have a confident extraction —
    # an explicit ATS value (Greenhouse rarely sets this, others may) wins.
    work_type = raw.work_type or jd["work_type"]

    await db.execute(
        """
        INSERT INTO job_listings (
            company_id, external_id, source,
            title, location_raw, location_city, location_state, location_country,
            is_nyc_metro, location_tier,
            work_type, department, team, employment_type,
            description_html, description_text,
            salary_min, salary_max, salary_currency,
            apply_url, posted_at, updated_ats_at,
            level, years_min, sponsorship_signal,
            first_seen_at, last_seen_at, is_active
        ) VALUES (
            ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?,
            ?, ?, ?, ?,
            ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1
        )
        ON CONFLICT(source, external_id) DO UPDATE SET
            title           = excluded.title,
            location_raw    = excluded.location_raw,
            location_city   = excluded.location_city,
            location_state  = excluded.location_state,
            location_country= excluded.location_country,
            is_nyc_metro    = excluded.is_nyc_metro,
            location_tier   = excluded.location_tier,
            work_type       = excluded.work_type,
            department      = excluded.department,
            team            = excluded.team,
            employment_type = excluded.employment_type,
            description_html= excluded.description_html,
            description_text= excluded.description_text,
            salary_min      = excluded.salary_min,
            salary_max      = excluded.salary_max,
            salary_currency = excluded.salary_currency,
            apply_url       = excluded.apply_url,
            posted_at       = excluded.posted_at,
            updated_ats_at  = excluded.updated_ats_at,
            level              = excluded.level,
            years_min          = excluded.years_min,
            sponsorship_signal = excluded.sponsorship_signal,
            last_seen_at    = CURRENT_TIMESTAMP,
            is_active       = 1
        """,
        (
            company_id,
            raw.external_id,
            raw.source,
            raw.title,
            raw.location_raw,
            loc.get("city", ""),
            loc.get("state", ""),
            loc.get("country", ""),
            1 if loc.get("is_nyc_metro") else 0,
            loc.get("location_tier", ""),
            work_type,
            raw.department,
            raw.team,
            raw.employment_type,
            raw.description_html,
            raw.description_text,
            raw.salary_min,
            raw.salary_max,
            raw.salary_currency,
            raw.apply_url,
            raw.posted_at,
            raw.updated_ats_at,
            jd["level"],
            jd["years_min"],
            jd["sponsorship_signal"],
        ),
    )


async def retire_stale_for_company(
    db,
    company_id: int,
    source: str,
    seen_external_ids: Iterable[str],
) -> int:
    """Soft-delete listings that we had before but did not see in this refresh.

    Uses a temp table for ``seen_external_ids`` so there's no SQLite parameter
    limit and no chunking-induced false negatives.

    Returns the number of rows retired.
    """
    seen = list(seen_external_ids)

    # If the refresh saw zero jobs, retire everything for this company+source.
    if not seen:
        cursor = await db.execute(
            """
            UPDATE job_listings
            SET is_active = 0
            WHERE company_id = ? AND source = ? AND is_active = 1
            """,
            (company_id, source),
        )
        return cursor.rowcount or 0

    # Stage seen ids in a temp table, then anti-join.
    await db.execute("DROP TABLE IF EXISTS _seen_ids")
    await db.execute("CREATE TEMP TABLE _seen_ids (external_id TEXT PRIMARY KEY)")
    await db.executemany(
        "INSERT INTO _seen_ids (external_id) VALUES (?) ON CONFLICT DO NOTHING",
        [(eid,) for eid in seen],
    )
    try:
        cursor = await db.execute(
            """
            UPDATE job_listings
            SET is_active = 0
            WHERE company_id = ?
              AND source = ?
              AND is_active = 1
              AND external_id NOT IN (SELECT external_id FROM _seen_ids)
            """,
            (company_id, source),
        )
        return cursor.rowcount or 0
    finally:
        await db.execute("DROP TABLE IF EXISTS _seen_ids")
