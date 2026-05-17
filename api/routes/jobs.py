"""
Job List CRUD + URL/text parsing endpoints.
"""
import json
import uuid
from fastapi import APIRouter, HTTPException

from api.db import get_db
from api.models import (
    JobCreate, JobUpdate, JobOut, JobFromURL, JobFromText, JobSearchRequest,
    MatchRequest, MatchResponse, MatchResultItem, MatchScoreParts,
)

router = APIRouter()


# ── Matching ───────────────────────────────────────────

@router.post("/match", response_model=MatchResponse)
async def match_jobs(body: MatchRequest):
    """Two-stage retrieval: hard filter → embedding cosine → weighted rerank.

    Synchronous-ish wrt the request lifecycle: a single OpenAI embedding
    call (~150-400 ms) plus ~30 ms of in-process numpy. The candidate pool
    embeddings must be pre-computed via `compute-embeddings` CLI; rows
    without an embedding are silently invisible to the matcher.
    """
    from services.matching.matcher import match as run_match

    prefs = body.preferences.model_dump(exclude_none=True) if body.preferences else {}

    try:
        results, pool_size = run_match(
            resume_id=body.resume_id,
            preferences=prefs,
            top_k=body.top_k,
            return_pool_size=True,
        )
    except ValueError as e:  # resume not found
        raise HTTPException(404, str(e))
    except RuntimeError as e:  # OPENAI_API_KEY missing etc
        raise HTTPException(503, str(e))

    items = [
        MatchResultItem(
            id=r["id"],
            title=r["title"],
            company=r["company"],
            industry=r.get("industry") or "",
            location=r.get("location") or "",
            location_tier=r.get("location_tier") or "",
            level=r.get("level") or "",
            work_type=r.get("work_type") or "",
            sponsorship_signal=r.get("sponsorship_signal") or "",
            apply_url=r.get("apply_url") or "",
            posted_at=r.get("posted_at"),
            h1b_lca_count_3y=int(r.get("h1b_lca_count_3y") or 0),
            uscis_h1b_approvals_3y=int(r.get("uscis_h1b_approvals_3y") or 0),
            uscis_h1b_approvals_1y=int(r.get("uscis_h1b_approvals_1y") or 0),
            has_jd=bool(r.get("has_jd")),
            score=float(r["score"]),
            score_parts=MatchScoreParts(**r["score_parts"]),
            reasons=r.get("reasons", []),
        )
        for r in results
    ]
    return MatchResponse(results=items, pool_size=pool_size)


def _row_to_job(row) -> dict:
    """Convert a DB row to a JobOut-compatible dict."""
    d = dict(row)
    for field in ("requirements", "gaps", "tailoring_tips"):
        val = d.get(field)
        if isinstance(val, str):
            d[field] = json.loads(val)
    return d


@router.get("/", response_model=list[JobOut])
async def list_jobs(resume_id: str = None, status: str = None):
    """List jobs, optionally filtered by resume_id or status."""
    db = await get_db()
    try:
        clauses, params = [], []
        if resume_id:
            clauses.append("resume_id = ?")
            params.append(resume_id)
        if status:
            clauses.append("status = ?")
            params.append(status)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        cursor = await db.execute(
            f"SELECT * FROM jobs {where} ORDER BY created_at DESC", params
        )
        rows = await cursor.fetchall()
        return [_row_to_job(r) for r in rows]
    finally:
        await db.close()


@router.get("/{job_id}", response_model=JobOut)
async def get_job(job_id: str):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "Job not found")
        return _row_to_job(row)
    finally:
        await db.close()


@router.post("/", response_model=JobOut)
async def create_job(body: JobCreate):
    """Manually create a job entry."""
    job_id = str(uuid.uuid4())
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO jobs (id, resume_id, company, title, location, work_type, url, "
            "jd_summary, jd_text, requirements, match_score, gaps, tailoring_tips, status, notes) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                job_id,
                body.resume_id,
                body.company,
                body.title,
                body.location,
                body.work_type,
                body.url,
                body.jd_summary,
                body.jd_text,
                json.dumps(body.requirements),
                body.match_score,
                json.dumps(body.gaps),
                json.dumps(body.tailoring_tips),
                body.status,
                body.notes,
            ),
        )
        await db.commit()
        cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        return _row_to_job(await cursor.fetchone())
    finally:
        await db.close()


@router.put("/{job_id}", response_model=JobOut)
async def update_job(job_id: str, body: JobUpdate):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        if not await cursor.fetchone():
            raise HTTPException(404, "Job not found")

        updates = body.model_dump(exclude_none=True)
        if not updates:
            raise HTTPException(400, "No fields to update")

        for field in ("requirements", "gaps", "tailoring_tips"):
            if field in updates:
                updates[field] = json.dumps(updates[field])

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        set_clause += ", updated_at = CURRENT_TIMESTAMP"
        values = list(updates.values()) + [job_id]

        await db.execute(f"UPDATE jobs SET {set_clause} WHERE id = ?", values)
        await db.commit()

        cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        return _row_to_job(await cursor.fetchone())
    finally:
        await db.close()


@router.delete("/{job_id}")
async def delete_job(job_id: str):
    db = await get_db()
    try:
        await db.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        await db.commit()
        return {"ok": True}
    finally:
        await db.close()


@router.delete("/")
async def delete_jobs_bulk(job_ids: list[str]):
    """Delete multiple jobs at once."""
    db = await get_db()
    try:
        placeholders = ",".join("?" for _ in job_ids)
        await db.execute(f"DELETE FROM jobs WHERE id IN ({placeholders})", job_ids)
        await db.commit()
        return {"ok": True, "deleted": len(job_ids)}
    finally:
        await db.close()


@router.post("/from-url", response_model=JobOut)
async def add_job_from_url(body: JobFromURL):
    """Fetch JD from URL, parse it, create job entry."""
    from services.job_matcher import fetch_jd_from_url, parse_custom_jd

    fetch_result = fetch_jd_from_url(body.url)
    if not fetch_result.get("success"):
        raise HTTPException(400, fetch_result.get("error", "Failed to fetch URL"))

    jd_text = fetch_result["content"]

    # If we have a resume, do full match analysis
    resume_data = None
    if body.resume_id:
        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT resume_data FROM resumes WHERE id = ?", (body.resume_id,)
            )
            row = await cursor.fetchone()
            if row:
                resume_data = json.loads(row["resume_data"])
        finally:
            await db.close()

    if resume_data:
        result = parse_custom_jd(jd_text, resume_data, body.model_choice, body.api_key or None)
    else:
        from services.job_matcher import parse_jd_for_tracker
        result = parse_jd_for_tracker(jd_text, body.model_choice, body.api_key or None)

    if not result.get("success"):
        raise HTTPException(400, result.get("error", "Failed to parse JD"))

    job_data = result["job"]

    job_id = str(uuid.uuid4())
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO jobs (id, resume_id, company, title, location, work_type, url, "
            "jd_summary, jd_text, requirements, match_score, gaps, tailoring_tips, status, notes) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                job_id,
                body.resume_id,
                job_data.get("company", "Unknown"),
                job_data.get("title", "Unknown Position"),
                job_data.get("location", ""),
                job_data.get("work_type", ""),
                body.url,
                job_data.get("description", ""),
                jd_text,
                json.dumps(job_data.get("requirements", [])),
                job_data.get("match_score", 0),
                json.dumps(job_data.get("gaps", [])),
                json.dumps(job_data.get("tailoring_tips", [])),
                "to_tailor",
                "",
            ),
        )
        await db.commit()
        cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        return _row_to_job(await cursor.fetchone())
    finally:
        await db.close()


@router.post("/search")
async def search_jobs(body: JobSearchRequest):
    """Search the web for real job postings, parse and add them."""
    from services.job_search import search_and_parse_jobs

    # Optionally load resume for match scoring
    resume_data = None
    if body.resume_id:
        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT resume_data FROM resumes WHERE id = ?", (body.resume_id,)
            )
            row = await cursor.fetchone()
            if row:
                resume_data = json.loads(row["resume_data"])
        finally:
            await db.close()

    result = search_and_parse_jobs(
        query=body.query,
        model_choice=body.model_choice,
        api_key=body.api_key or None,
        resume_data=resume_data,
        max_results=body.max_results,
    )

    if not result.get("success"):
        raise HTTPException(400, result.get("error", "Search failed"))

    # Save each job to the database
    added = []
    db = await get_db()
    try:
        for job_data in result["jobs"]:
            job_id = str(uuid.uuid4())
            await db.execute(
                "INSERT INTO jobs (id, resume_id, company, title, location, work_type, url, "
                "jd_summary, requirements, match_score, gaps, tailoring_tips, status) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    job_id,
                    body.resume_id,
                    job_data.get("company", "Unknown"),
                    job_data.get("title", "Unknown Position"),
                    job_data.get("location", ""),
                    job_data.get("work_type", ""),
                    job_data.get("url", ""),
                    job_data.get("jd_summary", ""),
                    json.dumps(job_data.get("requirements", [])),
                    job_data.get("match_score", 0),
                    json.dumps(job_data.get("gaps", [])),
                    json.dumps(job_data.get("tailoring_tips", [])),
                    "to_tailor",
                ),
            )
            added.append({
                "id": job_id,
                "company": job_data.get("company"),
                "title": job_data.get("title"),
            })
        await db.commit()
    finally:
        await db.close()

    stats = result.get("stats", {})
    return {
        "added": added,
        "message": f"Searched {stats.get('searched', '?')} pages, fetched {stats.get('fetched', '?')} job pages, added {len(added)} job(s)",
    }


@router.post("/from-text", response_model=JobOut)
async def add_job_from_text(body: JobFromText):
    """Parse pasted JD text, create job entry."""
    resume_data = None
    if body.resume_id:
        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT resume_data FROM resumes WHERE id = ?", (body.resume_id,)
            )
            row = await cursor.fetchone()
            if row:
                resume_data = json.loads(row["resume_data"])
        finally:
            await db.close()

    if resume_data:
        from services.job_matcher import parse_custom_jd
        result = parse_custom_jd(body.jd_text, resume_data, body.model_choice, body.api_key or None)
    else:
        from services.job_matcher import parse_jd_for_tracker
        result = parse_jd_for_tracker(body.jd_text, body.model_choice, body.api_key or None)

    if not result.get("success"):
        raise HTTPException(400, result.get("error", "Failed to parse JD"))

    job_data = result["job"]
    job_id = str(uuid.uuid4())
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO jobs (id, resume_id, company, title, location, work_type, url, "
            "jd_summary, jd_text, requirements, match_score, gaps, tailoring_tips, status, notes) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                job_id,
                body.resume_id,
                job_data.get("company", "Unknown"),
                job_data.get("title", "Unknown Position"),
                job_data.get("location", ""),
                job_data.get("work_type", ""),
                job_data.get("url", ""),
                job_data.get("description", ""),
                body.jd_text,
                json.dumps(job_data.get("requirements", [])),
                job_data.get("match_score", 0),
                json.dumps(job_data.get("gaps", [])),
                json.dumps(job_data.get("tailoring_tips", [])),
                "to_tailor",
                "",
            ),
        )
        await db.commit()
        cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        return _row_to_job(await cursor.fetchone())
    finally:
        await db.close()
