"""
Public NYC H1B job pool — API layer.

Endpoints live under /api/jobs/public and power the browse page. Every row
returned here is one that was fetched from a public ATS JSON API, tagged as
``is_nyc_metro=1`` by the location classifier, and is currently active.

Read path is SQL-only: zero LLM calls, zero web scraping. Target latency
<500ms for 50-row responses.
"""
from __future__ import annotations

import json
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from api.db import get_db
from api.models import (
    PublicCompanySummary,
    PublicJobDetail,
    PublicJobListItem,
    PublicJobsResponse,
    PublicStats,
    ReportListingRequest,
    TrackPublicJobRequest,
    JobOut,
)

router = APIRouter()

# Browse-page preview truncation
_DESCRIPTION_PREVIEW_CHARS = 400

# How many days a listing can be unseen before we drop it from browse results.
_LIVENESS_DAYS = 14

# ────────────────────────────────────────────────────────────────
# helpers
# ────────────────────────────────────────────────────────────────


def _make_preview(text: str) -> str:
    if not text:
        return ""
    text = " ".join(text.split())
    return text[:_DESCRIPTION_PREVIEW_CHARS]


def _row_to_company_summary(row) -> PublicCompanySummary:
    return PublicCompanySummary(
        id=row["id"],
        slug=row["slug"],
        display_name=row["display_name"],
        industry=row["industry"] or "",
        is_bodyshop=bool(row["is_bodyshop"]),
        h1b_lca_count_1y=row["h1b_lca_count_1y"] or 0,
        h1b_lca_count_3y=row["h1b_lca_count_3y"] or 0,
        hq_city=row["hq_city"] or "",
        hq_state=row["hq_state"] or "",
    )


def _row_to_list_item(row) -> PublicJobListItem:
    company = PublicCompanySummary(
        id=row["c_id"],
        slug=row["c_slug"],
        display_name=row["c_display_name"],
        industry=row["c_industry"] or "",
        is_bodyshop=bool(row["c_is_bodyshop"]),
        h1b_lca_count_1y=row["c_lca_1y"] or 0,
        h1b_lca_count_3y=row["c_lca_3y"] or 0,
        hq_city=row["c_hq_city"] or "",
        hq_state=row["c_hq_state"] or "",
    )
    return PublicJobListItem(
        id=row["id"],
        title=row["title"],
        company=company,
        location_raw=row["location_raw"] or "",
        location_tier=row["location_tier"] or "",
        work_type=row["work_type"] or "",
        department=row["department"] or "",
        employment_type=row["employment_type"] or "",
        apply_url=row["apply_url"] or "",
        posted_at=row["posted_at"],
        first_seen_at=row["first_seen_at"],
        last_seen_at=row["last_seen_at"],
        salary_min=row["salary_min"],
        salary_max=row["salary_max"],
        salary_currency=row["salary_currency"] or "USD",
        description_preview=_make_preview(row["description_text"] or ""),
        source=row["source"] or "",
        level=row["level"] if "level" in row.keys() else "",
        years_min=row["years_min"] if "years_min" in row.keys() else None,
        sponsorship_signal=row["sponsorship_signal"] if "sponsorship_signal" in row.keys() else "",
    )


def _listing_column_aliases() -> str:
    """SELECT clause aliasing company columns with c_ prefix."""
    return """
        jl.id AS id, jl.title, jl.location_raw, jl.location_tier,
        jl.work_type, jl.department, jl.employment_type,
        jl.apply_url, jl.posted_at, jl.first_seen_at, jl.last_seen_at,
        jl.salary_min, jl.salary_max, jl.salary_currency,
        jl.description_text, jl.description_html, jl.source,
        jl.level, jl.years_min, jl.sponsorship_signal,
        c.id AS c_id, c.slug AS c_slug, c.display_name AS c_display_name,
        c.industry AS c_industry, c.is_bodyshop AS c_is_bodyshop,
        c.h1b_lca_count_1y AS c_lca_1y, c.h1b_lca_count_3y AS c_lca_3y,
        c.hq_city AS c_hq_city, c.hq_state AS c_hq_state
    """


# ────────────────────────────────────────────────────────────────
# endpoints
# ────────────────────────────────────────────────────────────────


@router.get("", response_model=PublicJobsResponse)
@router.get("/", response_model=PublicJobsResponse)
async def browse_public_jobs(
    q: Optional[str] = Query(None, description="Free-text search on title/description"),
    company_slug: Optional[str] = Query(None),
    location_tier: Optional[str] = Query(
        None, description="nyc_core | nj_close | ny_suburb | remote_nyc_hq"
    ),
    work_type: Optional[str] = Query(None, description="onsite | remote | hybrid"),
    department: Optional[str] = Query(None),
    posted_within_days: Optional[int] = Query(None, ge=1, le=365),
    min_lca_count: int = Query(0, ge=0, description="Filter by company.h1b_lca_count_1y"),
    include_bodyshops: bool = Query(True),
    nationwide: bool = Query(
        False,
        description="If true, drop the NYC-metro restriction and surface all "
                    "active jobs (used by the simplify-fed national pool).",
    ),
    require_jd: bool = Query(
        False,
        description="If true, only return rows whose description_text is "
                    "present (~200+ chars). Default off because Simplify-sourced "
                    "rows have title-only metadata and we still want to show them.",
    ),
    sponsorship: Optional[str] = Query(
        None, description="friendly | unfriendly | unverified — exact match on "
                          "the extracted signal. unverified means empty.",
    ),
    level: Optional[str] = Query(
        None, description="intern | new_grad | junior | mid | senior | staff | principal",
    ),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Browse the public job pool with rich filters.

    Pre-2026-05 the pool was NYC-only and required a JD body, which made
    every Simplify-fed row invisible. Both restrictions are now opt-in
    (`nationwide=false`, `require_jd=true`) so the same endpoint serves
    both views.
    """
    clauses = [
        "jl.is_active = 1",
        f"datetime(jl.last_seen_at) > datetime('now', '-{_LIVENESS_DAYS} days')",
    ]
    if not nationwide:
        clauses.append("jl.is_nyc_metro = 1")
    if require_jd:
        clauses.append("LENGTH(jl.description_text) > 200")

    params: list = []

    if sponsorship == "unverified":
        clauses.append("(jl.sponsorship_signal IS NULL OR jl.sponsorship_signal = '')")
    elif sponsorship in ("friendly", "unfriendly"):
        clauses.append("jl.sponsorship_signal = ?")
        params.append(sponsorship)

    if level:
        clauses.append("jl.level = ?")
        params.append(level)

    if not include_bodyshops:
        clauses.append("COALESCE(c.is_bodyshop, 0) = 0")

    if company_slug:
        clauses.append("c.slug = ?")
        params.append(company_slug)

    if location_tier:
        clauses.append("jl.location_tier = ?")
        params.append(location_tier)

    if work_type:
        clauses.append("jl.work_type = ?")
        params.append(work_type)

    if department:
        clauses.append("jl.department LIKE ?")
        params.append(f"%{department}%")

    if posted_within_days:
        clauses.append(
            f"COALESCE(NULLIF(jl.posted_at, '')::date, jl.first_seen_at::date) "
            f">= (CURRENT_DATE - INTERVAL '{posted_within_days} days')::date"
        )

    if min_lca_count > 0:
        clauses.append("COALESCE(c.h1b_lca_count_1y, 0) >= ?")
        params.append(min_lca_count)

    # Full-text search via PostgreSQL tsvector.
    fts_clause = ""
    if q and q.strip():
        terms = [t for t in q.strip().split() if t]
        if terms:
            fts_clause = " AND jl.search_vector @@ plainto_tsquery('english', ?)"
            params.append(" ".join(terms))

    where_sql = " AND ".join(clauses) + fts_clause

    db = await get_db()
    try:
        count_cursor = await db.execute(
            f"""
            SELECT COUNT(*) AS n
            FROM job_listings jl
            JOIN companies c ON c.id = jl.company_id
            WHERE {where_sql}
            """,
            params,
        )
        count_row = await count_cursor.fetchone()
        total = int(count_row["n"]) if count_row else 0

        list_cursor = await db.execute(
            f"""
            SELECT {_listing_column_aliases()}
            FROM job_listings jl
            JOIN companies c ON c.id = jl.company_id
            WHERE {where_sql}
            ORDER BY
              CASE jl.location_tier
                WHEN 'nyc_core' THEN 1
                WHEN 'nj_close' THEN 2
                WHEN 'ny_suburb' THEN 3
                WHEN 'remote_nyc_hq' THEN 4
                ELSE 5
              END,
              COALESCE(jl.posted_at, jl.first_seen_at) DESC,
              jl.id DESC
            LIMIT ? OFFSET ?
            """,
            [*params, limit, offset],
        )
        rows = await list_cursor.fetchall()
        jobs = [_row_to_list_item(r) for r in rows]
        return PublicJobsResponse(total=total, offset=offset, limit=limit, jobs=jobs)
    finally:
        await db.close()


@router.get("/companies", response_model=list[PublicCompanySummary])
async def list_public_companies(
    only_with_active_jobs: bool = Query(True),
):
    """List all companies that currently have at least one active NYC job."""
    db = await get_db()
    try:
        if only_with_active_jobs:
            cursor = await db.execute(
                """
                SELECT c.*
                FROM companies c
                WHERE c.is_active = 1
                  AND EXISTS (
                      SELECT 1 FROM job_listings jl
                      WHERE jl.company_id = c.id
                        AND jl.is_active = 1
                        AND jl.is_nyc_metro = 1
                  )
                ORDER BY c.display_name
                """,
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM companies WHERE is_active = 1 ORDER BY display_name"
            )
        rows = await cursor.fetchall()
        return [_row_to_company_summary(r) for r in rows]
    finally:
        await db.close()


@router.get("/stats", response_model=PublicStats)
async def public_stats():
    """High-level stats for the browse page header."""
    db = await get_db()
    try:
        total_active_cursor = await db.execute(
            "SELECT COUNT(*) AS n FROM job_listings WHERE is_active = 1"
        )
        total_active = int((await total_active_cursor.fetchone())["n"] or 0)

        total_nyc_cursor = await db.execute(
            "SELECT COUNT(*) AS n FROM job_listings "
            "WHERE is_active = 1 AND is_nyc_metro = 1"
        )
        total_nyc = int((await total_nyc_cursor.fetchone())["n"] or 0)

        companies_cursor = await db.execute(
            """
            SELECT COUNT(DISTINCT c.id) AS n
            FROM companies c
            WHERE c.is_active = 1
              AND EXISTS (
                  SELECT 1 FROM job_listings jl
                  WHERE jl.company_id = c.id
                    AND jl.is_active = 1
                    AND jl.is_nyc_metro = 1
              )
            """
        )
        total_companies = int((await companies_cursor.fetchone())["n"] or 0)

        last_refresh_cursor = await db.execute(
            "SELECT MAX(last_fetched_at) AS t FROM companies WHERE is_active = 1"
        )
        last_refresh_row = await last_refresh_cursor.fetchone()
        last_refresh = last_refresh_row["t"] if last_refresh_row else None

        posted_7d_cursor = await db.execute(
            """
            SELECT COUNT(*) AS n FROM job_listings
            WHERE is_active = 1 AND is_nyc_metro = 1
              AND COALESCE(posted_at, first_seen_at) >= datetime('now', '-7 days')
            """
        )
        jobs_7d = int((await posted_7d_cursor.fetchone())["n"] or 0)

        tier_cursor = await db.execute(
            """
            SELECT COALESCE(NULLIF(location_tier, ''), 'unknown') AS tier, COUNT(*) AS n
            FROM job_listings
            WHERE is_active = 1 AND is_nyc_metro = 1
            GROUP BY tier
            """
        )
        tier_rows = await tier_cursor.fetchall()
        tier_counts = {r["tier"]: int(r["n"]) for r in tier_rows}

        return PublicStats(
            total_active_jobs=total_active,
            total_nyc_jobs=total_nyc,
            total_companies=total_companies,
            last_refresh_at=last_refresh,
            jobs_posted_last_7d=jobs_7d,
            tier_counts=tier_counts,
        )
    finally:
        await db.close()


@router.get("/{listing_id}", response_model=PublicJobDetail)
async def get_public_job(listing_id: int):
    """Full detail of a single public listing, including description HTML."""
    db = await get_db()
    try:
        cursor = await db.execute(
            f"""
            SELECT {_listing_column_aliases()}
            FROM job_listings jl
            JOIN companies c ON c.id = jl.company_id
            WHERE jl.id = ?
            """,
            (listing_id,),
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "Listing not found")

        base = _row_to_list_item(row)
        requirements: list = []
        raw_req = row["description_text"]  # placeholder; real requirements come from Phase 2 LLM enrichment
        return PublicJobDetail(
            **base.model_dump(),
            description_html=row["description_html"] or "",
            description_text=row["description_text"] or "",
            requirements=requirements,
        )
    finally:
        await db.close()


@router.post("/{listing_id}/track", response_model=JobOut)
async def track_public_job(listing_id: int, body: TrackPublicJobRequest):
    """Copy a public listing into the user's personal tracker (jobs table).

    Idempotent per (listing_id, resume_id): calling twice with the same resume
    returns the existing tracker row instead of creating a duplicate.
    """
    db = await get_db()
    try:
        # Fetch the listing + company.
        cursor = await db.execute(
            """
            SELECT jl.*, c.display_name AS company_name
            FROM job_listings jl
            JOIN companies c ON c.id = jl.company_id
            WHERE jl.id = ?
            """,
            (listing_id,),
        )
        listing = await cursor.fetchone()
        if not listing:
            raise HTTPException(404, "Listing not found")

        resume_id = body.resume_id

        # Idempotency: look for an existing tracker row for this resume + listing.
        if resume_id:
            dup_cursor = await db.execute(
                "SELECT * FROM jobs WHERE source_listing_id = ? AND resume_id = ?",
                (listing_id, resume_id),
            )
        else:
            dup_cursor = await db.execute(
                "SELECT * FROM jobs WHERE source_listing_id = ? AND resume_id IS NULL",
                (listing_id,),
            )
        existing = await dup_cursor.fetchone()
        if existing:
            return _row_to_job_out(existing)

        job_id = str(uuid.uuid4())
        await db.execute(
            """
            INSERT INTO jobs (
                id, resume_id, company, title, location, work_type, url,
                jd_summary, jd_text, requirements, match_score,
                gaps, tailoring_tips, status, notes, source_listing_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                resume_id,
                listing["company_name"],
                listing["title"],
                listing["location_raw"] or "",
                listing["work_type"] or "",
                listing["apply_url"] or "",
                (listing["description_text"] or "")[:500],
                listing["description_text"] or "",
                json.dumps([]),
                0,
                json.dumps([]),
                json.dumps([]),
                "to_tailor",
                "",
                listing_id,
            ),
        )
        await db.commit()

        cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        row = await cursor.fetchone()
        return _row_to_job_out(row)
    finally:
        await db.close()


@router.post("/{listing_id}/report")
async def report_public_job(listing_id: int, body: ReportListingRequest):
    """User-reported bad listing (not NYC, closed, etc.)."""
    if not body.reason:
        raise HTTPException(400, "reason is required")

    db = await get_db()
    try:
        # Confirm the listing exists.
        cursor = await db.execute(
            "SELECT id FROM job_listings WHERE id = ?", (listing_id,)
        )
        if not await cursor.fetchone():
            raise HTTPException(404, "Listing not found")

        await db.execute(
            "INSERT INTO listing_reports (listing_id, reason, note) VALUES (?, ?, ?)",
            (listing_id, body.reason, body.note),
        )
        await db.commit()
        return {"ok": True}
    finally:
        await db.close()


def _row_to_job_out(row) -> dict:
    """Convert a jobs table row into a JobOut-compatible dict (reusing the shape)."""
    d = dict(row)
    for field in ("requirements", "gaps", "tailoring_tips"):
        val = d.get(field)
        if isinstance(val, str):
            try:
                d[field] = json.loads(val)
            except json.JSONDecodeError:
                d[field] = []
    return d
