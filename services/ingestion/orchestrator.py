"""
Refresh orchestrator — the heart of the liveness pipeline.

Routes each active company to its ATS adapter, streams jobs into job_listings
via upsert, soft-deletes stale rows, and records a summary in ingest_runs.

Sprint 1: Greenhouse only. Additional adapters plug in via the ADAPTERS dict.
"""
from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Optional

import httpx

from api.db import get_db
from services.ats.ashby import AshbyAdapter
from services.ats.base import ATSAdapter
from services.ats.greenhouse import GreenhouseAdapter
from services.ats.lever import LeverAdapter
from services.ats.location_filter import classify_location
from services.ingestion.dedup import retire_stale_for_company, upsert_job_listing
from services.ingestion.role_filter import should_keep

# Registry of supported ATS vendors. Adding a new adapter is a one-line change.
ADAPTERS: dict[str, type[ATSAdapter]] = {
    "greenhouse": GreenhouseAdapter,
    "lever":      LeverAdapter,
    "ashby":      AshbyAdapter,
}

# Per-vendor concurrency caps (be polite to public APIs).
VENDOR_CONCURRENCY = {
    "greenhouse": 4,
    "lever": 4,
    "ashby": 4,
    "workday": 2,
    "smartrecruiters": 4,
    "workable": 4,
}

USER_AGENT = "CareerOpsPro-JobBot/1.0 (+https://github.com/careerops-pro)b)"


@dataclass
class RefreshResult:
    company_id: int
    company_slug: str
    vendor: str
    status: str                  # 'ok' | 'error' | 'skipped'
    fetched: int = 0
    upserted: int = 0
    retired: int = 0
    filtered_out: int = 0        # rows dropped by role_filter before upsert
    error: Optional[str] = None


async def _start_ingest_run(db, pipeline: str, source: str, company_id: int) -> int:
    cursor = await db.execute(
        """
        INSERT INTO ingest_runs (pipeline, source, company_id, status)
        VALUES (?, ?, ?, 'running')
        """,
        (pipeline, source, company_id),
    )
    return cursor.lastrowid


async def _finish_ingest_run(
    db,
    run_id: int,
    status: str,
    fetched: int,
    upserted: int,
    retired: int,
    error: str | None = None,
) -> None:
    await db.execute(
        """
        UPDATE ingest_runs
        SET finished_at = CURRENT_TIMESTAMP,
            status = ?,
            jobs_fetched = ?,
            jobs_upserted = ?,
            jobs_retired = ?,
            error_message = ?
        WHERE id = ?
        """,
        (status, fetched, upserted, retired, error, run_id),
    )


async def refresh_company(
    company_row,
    client: httpx.AsyncClient,
) -> RefreshResult:
    """Fetch all jobs for one company, upsert, retire stale.

    Opens its own DB connection so concurrent refreshes don't share temp tables
    or in-flight transactions.
    """
    company_id = company_row["id"]
    slug = company_row["slug"]
    vendor = company_row["ats_vendor"] or ""
    ats_slug = company_row["ats_slug"] or ""
    hq_city = company_row["hq_city"] or ""
    hq_state = company_row["hq_state"] or ""

    try:
        ats_config = json.loads(company_row["ats_config"] or "{}")
    except (TypeError, json.JSONDecodeError):
        ats_config = {}

    if vendor not in ADAPTERS:
        return RefreshResult(
            company_id=company_id,
            company_slug=slug,
            vendor=vendor,
            status="skipped",
            error=f"Unsupported ats_vendor '{vendor}'",
        )

    if not ats_slug and vendor != "workday":
        return RefreshResult(
            company_id=company_id,
            company_slug=slug,
            vendor=vendor,
            status="skipped",
            error="Missing ats_slug",
        )

    db = await get_db()
    try:
        run_id = await _start_ingest_run(db, "ats_refresh", vendor, company_id)
        await db.commit()
        adapter = ADAPTERS[vendor](client)

        seen_ids: list[str] = []
        fetched = 0
        upserted = 0
        filtered_out = 0
        try:
            async for raw in adapter.fetch_jobs(ats_slug, ats_config):
                fetched += 1
                if not raw.external_id or not raw.title:
                    continue
                # Role-family gate. Drops sales / marketing / clinical / etc.
                # Skipped rows do NOT enter seen_ids — meaning if a job that
                # was kept yesterday now fails the gate (e.g. retitled to
                # "Sales Engineer"), the stale-retire step will mark its
                # existing row inactive on the next pass. Self-cleaning.
                if not should_keep(raw.title, raw.department):
                    filtered_out += 1
                    continue
                loc = classify_location(
                    raw.location_raw,
                    company_hq_city=hq_city,
                    company_hq_state=hq_state,
                )
                await upsert_job_listing(db, company_id, raw, loc)
                seen_ids.append(raw.external_id)
                upserted += 1

            retired = await retire_stale_for_company(db, company_id, vendor, seen_ids)
            await db.execute(
                """
                UPDATE companies
                SET last_fetched_at = CURRENT_TIMESTAMP,
                    last_fetch_status = 'ok',
                    last_fetch_error = NULL,
                    consecutive_fetch_errors = 0,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (company_id,),
            )
            await _finish_ingest_run(db, run_id, "ok", fetched, upserted, retired)
            await db.commit()
            return RefreshResult(
                company_id=company_id,
                company_slug=slug,
                vendor=vendor,
                status="ok",
                fetched=fetched,
                upserted=upserted,
                retired=retired,
                filtered_out=filtered_out,
            )
        except Exception as e:
            err_msg = f"{type(e).__name__}: {e}"
            await db.execute(
                """
                UPDATE companies
                SET last_fetched_at = CURRENT_TIMESTAMP,
                    last_fetch_status = 'error',
                    last_fetch_error = ?,
                    consecutive_fetch_errors = consecutive_fetch_errors + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (err_msg, company_id),
            )
            await _finish_ingest_run(
                db, run_id, "error", fetched, upserted, 0, err_msg
            )
            await db.commit()
            return RefreshResult(
                company_id=company_id,
                company_slug=slug,
                vendor=vendor,
                status="error",
                fetched=fetched,
                upserted=upserted,
                filtered_out=filtered_out,
                error=err_msg,
            )
    finally:
        await db.close()


async def refresh_all_companies(
    only_slug: str | None = None,
    only_vendor: str | None = None,
) -> list[RefreshResult]:
    """Refresh every active company whose vendor has an adapter in ADAPTERS.

    Args:
        only_slug: if set, refresh only this one company slug.
        only_vendor: if set, refresh only companies with this ats_vendor.
    """
    db = await get_db()
    try:
        query = "SELECT * FROM companies WHERE is_active = 1"
        params: list = []
        if only_slug:
            query += " AND slug = ?"
            params.append(only_slug)
        if only_vendor:
            query += " AND ats_vendor = ?"
            params.append(only_vendor)
        query += " ORDER BY last_fetched_at IS NULL DESC, last_fetched_at ASC"

        cursor = await db.execute(query, params)
        companies = await cursor.fetchall()
    finally:
        await db.close()

    if not companies:
        return []

    sems = {
        vendor: asyncio.Semaphore(VENDOR_CONCURRENCY.get(vendor, 2))
        for vendor in ADAPTERS
    }

    async with httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT},
        timeout=30,
        follow_redirects=True,
    ) as client:

        async def _run_one(company) -> RefreshResult:
            vendor = company["ats_vendor"] or ""
            sem = sems.get(vendor)
            if sem is None:
                return RefreshResult(
                    company_id=company["id"],
                    company_slug=company["slug"],
                    vendor=vendor,
                    status="skipped",
                    error=f"Unsupported ats_vendor '{vendor}'",
                )
            async with sem:
                return await refresh_company(company, client)

        results = await asyncio.gather(
            *[_run_one(c) for c in companies],
            return_exceptions=False,
        )
    return list(results)
