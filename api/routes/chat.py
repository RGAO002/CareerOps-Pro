"""
Natural language command processing for Job List management.
"""
import json
import uuid
from fastapi import APIRouter, HTTPException

from api.db import get_db
from api.models import ChatCommand
from services.llm import get_llm, clean_json

router = APIRouter()


CHAT_SYSTEM_PROMPT = """You are a career assistant that interprets natural language commands about a job list.

The user manages a list of target jobs they want to apply to. You need to interpret their request and return a structured action.

AVAILABLE ACTIONS:
1. "add_jobs" — Add one or more jobs to the list
   Return: {"action": "add_jobs", "jobs": [{"company": "...", "title": "...", "location": "...", "work_type": "...", "url": ""}]}

2. "remove" — Remove jobs matching a filter
   Return: {"action": "remove", "filter": {"field": "value"}}
   Supported fields: company, title, location, work_type, requirements_contains
   Example: {"action": "remove", "filter": {"requirements_contains": "C++"}}

3. "filter_keep" — Keep only jobs matching a criteria, remove the rest
   Return: {"action": "filter_keep", "criteria": {"field_contains": "value"}}
   Supported fields: company_contains, title_contains, location_contains, work_type

4. "update" — Update fields on matching jobs
   Return: {"action": "update", "filter": {"field": "value"}, "updates": {"field": "new_value"}}

5. "status_change" — Change status of jobs
   Return: {"action": "status_change", "filter": {"field": "value"}, "new_status": "applied|to_tailor|tailored|to_apply|interviewing|offer|rejected"}

6. "query" — Just answer a question about the jobs (no modification)
   Return: {"action": "query", "message": "Your answer here"}

7. "search_web" — Search the internet for real job postings matching a query
   Return: {"action": "search_web", "query": "<search query for finding jobs>"}
   Use this when the user wants to find/search/discover real jobs from the internet.
   Examples: "Find me SWE jobs at Google", "Search for remote ML engineer positions", "Look for data scientist roles in NYC"

8. "unclear" — If you can't understand the request
   Return: {"action": "unclear", "message": "Could you clarify..."}

CURRENT JOBS:
{jobs_json}

Return ONLY valid JSON.
"""


@router.post("/command")
async def process_command(body: ChatCommand):
    """Process a natural language command about the job list."""
    db = await get_db()
    try:
        # Load current jobs
        resume_filter = ""
        params = []
        if body.resume_id:
            resume_filter = "WHERE resume_id = ?"
            params = [body.resume_id]

        cursor = await db.execute(
            f"SELECT * FROM jobs {resume_filter} ORDER BY created_at DESC", params
        )
        rows = await cursor.fetchall()
        jobs = []
        for r in rows:
            d = dict(r)
            for f in ("requirements", "gaps", "tailoring_tips"):
                if isinstance(d[f], str):
                    d[f] = json.loads(d[f])
            jobs.append(d)

        jobs_json = json.dumps(
            [{"id": j["id"], "company": j["company"], "title": j["title"],
              "location": j["location"], "work_type": j["work_type"],
              "status": j["status"], "requirements": j["requirements"],
              "match_score": j["match_score"]}
             for j in jobs],
            ensure_ascii=False, indent=2,
        )

        prompt = CHAT_SYSTEM_PROMPT.replace("{jobs_json}", jobs_json)
        llm = get_llm(body.model_choice, body.api_key or None)
        from langchain_core.messages import SystemMessage, HumanMessage

        res = llm.invoke(
            [SystemMessage(content=prompt), HumanMessage(content=body.message)],
            response_format={"type": "json_object"},
        )
        result = clean_json(res.content)
        action = result.get("action", "unclear")

        # Execute the action
        if action == "add_jobs":
            added = []
            for j in result.get("jobs", []):
                job_id = str(uuid.uuid4())
                await db.execute(
                    "INSERT INTO jobs (id, resume_id, company, title, location, work_type, "
                    "url, requirements, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        job_id,
                        body.resume_id,
                        j.get("company", "Unknown"),
                        j.get("title", "Unknown"),
                        j.get("location", ""),
                        j.get("work_type", ""),
                        j.get("url", ""),
                        json.dumps(j.get("requirements", [])),
                        "to_tailor",
                    ),
                )
                added.append({"id": job_id, "company": j.get("company"), "title": j.get("title")})
            await db.commit()
            return {"action": "add_jobs", "added": added, "message": f"Added {len(added)} job(s)"}

        elif action == "remove":
            filt = result.get("filter", {})
            removed = await _apply_filter_delete(db, jobs, filt, body.resume_id)
            return {"action": "remove", "removed": removed, "message": f"Removed {removed} job(s)"}

        elif action == "filter_keep":
            criteria = result.get("criteria", {})
            removed = await _apply_filter_keep(db, jobs, criteria)
            return {"action": "filter_keep", "removed": removed, "message": f"Kept matching jobs, removed {removed}"}

        elif action == "status_change":
            filt = result.get("filter", {})
            new_status = result.get("new_status", "to_tailor")
            updated = await _apply_status_change(db, jobs, filt, new_status)
            return {"action": "status_change", "updated": updated, "message": f"Updated {updated} job(s) to '{new_status}'"}

        elif action == "update":
            filt = result.get("filter", {})
            updates = result.get("updates", {})
            updated = await _apply_update(db, jobs, filt, updates)
            return {"action": "update", "updated": updated, "message": f"Updated {updated} job(s)"}

        elif action == "search_web":
            from services.job_search import search_and_parse_jobs

            search_query = result.get("query", body.message)

            # Optionally load resume for match scoring
            resume_data = None
            if body.resume_id:
                cursor2 = await db.execute(
                    "SELECT resume_data FROM resumes WHERE id = ?", (body.resume_id,)
                )
                row2 = await cursor2.fetchone()
                if row2:
                    resume_data = json.loads(row2["resume_data"])

            search_result = search_and_parse_jobs(
                query=search_query,
                model_choice=body.model_choice,
                api_key=body.api_key or None,
                resume_data=resume_data,
                max_results=15,
            )

            if not search_result.get("success"):
                return {"action": "search_web", "added": [],
                        "message": search_result.get("error", "Search failed")}

            added = []
            for j in search_result.get("jobs", []):
                job_id = str(uuid.uuid4())
                await db.execute(
                    "INSERT INTO jobs (id, resume_id, company, title, location, work_type, "
                    "url, jd_summary, requirements, match_score, gaps, tailoring_tips, status) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        job_id,
                        body.resume_id,
                        j.get("company", "Unknown"),
                        j.get("title", "Unknown"),
                        j.get("location", ""),
                        j.get("work_type", ""),
                        j.get("url", ""),
                        j.get("jd_summary", ""),
                        json.dumps(j.get("requirements", [])),
                        j.get("match_score", 0),
                        json.dumps(j.get("gaps", [])),
                        json.dumps(j.get("tailoring_tips", [])),
                        "to_tailor",
                    ),
                )
                added.append({"id": job_id, "company": j.get("company"), "title": j.get("title")})
            await db.commit()
            stats = search_result.get("stats", {})
            return {"action": "search_web", "added": added,
                    "message": f"Searched {stats.get('searched', '?')} pages, fetched {stats.get('fetched', '?')} job pages, added {len(added)} job(s)"}

        elif action == "query":
            return {"action": "query", "message": result.get("message", "")}

        else:
            return {"action": "unclear", "message": result.get("message", "I didn't understand that. Could you rephrase?")}

    finally:
        await db.close()


def _matches_filter(job: dict, filt: dict) -> bool:
    """Check if a job matches a filter dict."""
    for key, value in filt.items():
        val_lower = str(value).lower()
        if key == "requirements_contains":
            reqs = " ".join(str(r).lower() for r in job.get("requirements", []))
            if val_lower not in reqs:
                return False
        elif key.endswith("_contains"):
            field = key.replace("_contains", "")
            if val_lower not in str(job.get(field, "")).lower():
                return False
        else:
            if str(job.get(key, "")).lower() != val_lower:
                return False
    return True


async def _apply_filter_delete(db, jobs, filt, resume_id=None):
    ids_to_delete = [j["id"] for j in jobs if _matches_filter(j, filt)]
    if ids_to_delete:
        placeholders = ",".join("?" for _ in ids_to_delete)
        await db.execute(f"DELETE FROM jobs WHERE id IN ({placeholders})", ids_to_delete)
        await db.commit()
    return len(ids_to_delete)


async def _apply_filter_keep(db, jobs, criteria):
    ids_to_delete = [j["id"] for j in jobs if not _matches_filter(j, criteria)]
    if ids_to_delete:
        placeholders = ",".join("?" for _ in ids_to_delete)
        await db.execute(f"DELETE FROM jobs WHERE id IN ({placeholders})", ids_to_delete)
        await db.commit()
    return len(ids_to_delete)


async def _apply_status_change(db, jobs, filt, new_status):
    ids = [j["id"] for j in jobs if _matches_filter(j, filt)]
    for jid in ids:
        await db.execute(
            "UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (new_status, jid),
        )
    await db.commit()
    return len(ids)


async def _apply_update(db, jobs, filt, updates):
    ids = [j["id"] for j in jobs if _matches_filter(j, filt)]
    for jid in ids:
        set_parts = []
        vals = []
        for k, v in updates.items():
            if k in ("requirements", "gaps", "tailoring_tips"):
                v = json.dumps(v)
            set_parts.append(f"{k} = ?")
            vals.append(v)
        set_parts.append("updated_at = CURRENT_TIMESTAMP")
        vals.append(jid)
        await db.execute(f"UPDATE jobs SET {', '.join(set_parts)} WHERE id = ?", vals)
    await db.commit()
    return len(ids)
