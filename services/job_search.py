"""
Web Job Search Service — search real job listings from the internet.

Pipeline:
    1. DDGS search across multiple targeted queries, restricted to last month.
    2. URL-level filters:
        a. domain blocklist (aggregators, SEO farms, article sites)
        b. ATS allowlist OR individual-posting heuristic (no fallback "default true")
    3. Parallel HTTP fetch of allowed URLs.
    4. Single LLM pass: extract structured jobs with a `confidence` flag.
    5. Drop low-confidence rows, drop non-target-role rows (role_filter),
       enrich with jd_extractor signals, dedupe against the public pool.

Each surviving result is something we can stand behind: a real-world,
recently-posted job from a target role family that isn't already in our
curated NYC H1B pool.

This module replaces a buggy prior version that silently let aggregator
pages through, hallucinated jobs from search snippets it never fetched,
and accepted everything the LLM emitted regardless of confidence.
"""
from __future__ import annotations

import concurrent.futures
import json
import re
import sqlite3
from pathlib import Path
from typing import Optional

from ddgs import DDGS
from langchain_core.messages import SystemMessage

from services.ingestion.jd_extractor import extract as extract_jd_fields
from services.ingestion.role_filter import evaluate as eval_role
from services.job_matcher import fetch_jd_from_url
from services.llm import clean_json, get_llm

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "careeops.db"


# ──────────────────────────────────────────────────────────────────
# URL filtering
# ──────────────────────────────────────────────────────────────────

# Domains that are search/aggregator pages, SEO farms, or articles —
# never an individual job posting we can rely on.
_BLOCKED_DOMAINS = (
    "linkedin.com/jobs/search", "linkedin.com/jobs/collections",
    "indeed.com/q-", "indeed.com/jobs?",
    "glassdoor.com/Job/",
    "ziprecruiter.com/jobs/search", "ziprecruiter.com/jobs-",
    "google.com/search", "google.com/about/careers/applications/jobs",
    "salary.com", "payscale.com", "comparably.com", "levels.fyi/companies",
    "reddit.com", "quora.com", "youtube.com", "wikipedia.org",
    "ai-search.io/job-board", "ai.engineer/jobs", "builtin.com/jobs",
    "wellfound.com/jobs", "simplyhired.com",
    "talent.com", "monster.com", "careerbuilder.com",
    "jobcase.com", "resumecompanion.com", "myworkdayjobs.com/Search",
    "linkedin.com/pulse",
)

# ATS hosts that always serve individual postings — strong allow.
_ATS_HOSTS = (
    "greenhouse.io", "boards.greenhouse.io", "job-boards.greenhouse.io",
    "lever.co", "jobs.lever.co",
    "jobs.ashbyhq.com", "ashbyhq.com",
    "apply.workable.com", "workable.com",
    "careers.smartrecruiters.com", "jobs.smartrecruiters.com",
    "icims.com",
    "rec.ly", "applytojob.com",
)


def _domain_blocked(url: str) -> bool:
    return any(blocked in url for blocked in _BLOCKED_DOMAINS)


def _is_ats_host(url: str) -> bool:
    return any(host in url for host in _ATS_HOSTS)


def _looks_like_individual_posting(url: str) -> bool:
    """Heuristic: URL points at one specific job, not a list/search page.

    Required because not all job hosts are recognizable ATS domains
    (companies use `/careers/jobs/<slug>` on their own marketing sites).
    """
    if _domain_blocked(url):
        return False
    if _is_ats_host(url):
        return True
    # LinkedIn and Indeed both expose individual-posting URLs even though
    # they also have noisy search pages — the URL shape disambiguates.
    if "linkedin.com/jobs/view/" in url:
        return True
    if "indeed.com/viewjob" in url or "indeed.com/rc/" in url:
        return True
    # Company career sites typically follow /careers/jobs/<slug-or-id> or /position/<slug>
    if re.search(r"/careers/[^/]+/[a-zA-Z0-9_-]+", url):
        return True
    if re.search(r"/jobs?/[a-zA-Z0-9][\w-]+", url) and "/jobs/search" not in url:
        return True
    if re.search(r"/positions?/[a-zA-Z0-9_-]+", url):
        return True
    # Default: NOT a posting. Conservative — was the source of most of the
    # garbage in the previous version.
    return False


# ──────────────────────────────────────────────────────────────────
# Query construction
# ──────────────────────────────────────────────────────────────────

def _generate_search_queries(user_query: str) -> list[str]:
    """Produce 3 targeted DDG queries from the user's free-form input.

    We emphasize ATS sites because their results are clean individual postings.
    We also tack on "h1b sponsorship" once because for our audience it's a
    common qualifier they'd add anyway.
    """
    base = user_query.strip()
    return [
        f"{base} site:greenhouse.io OR site:lever.co OR site:jobs.ashbyhq.com",
        f"{base} site:apply.workable.com OR site:smartrecruiters.com",
        f"{base} h1b sponsorship",
    ]


def _ddg_search(query: str, max_results: int) -> list[dict]:
    """Run one DDG query restricted to the last month."""
    out: list[dict] = []
    try:
        for r in DDGS().text(query, max_results=max_results, timelimit="m"):
            out.append({
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "snippet": r.get("body", ""),
            })
    except Exception:
        pass
    return out


def search_jobs_web(query: str, max_results: int = 10) -> list[dict]:
    """Run all DDG queries, dedupe by URL, drop bad domains and non-postings.

    Returns a deduplicated list of {title, url, snippet} dicts.
    """
    queries = _generate_search_queries(query)
    seen_urls: set[str] = set()
    out: list[dict] = []
    for q in queries:
        for r in _ddg_search(q, max_results=max_results):
            url = r["url"]
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            if _domain_blocked(url):
                continue
            if not _looks_like_individual_posting(url):
                continue
            out.append(r)
    return out


# ──────────────────────────────────────────────────────────────────
# Fetching
# ──────────────────────────────────────────────────────────────────

def _fetch_single_url(url: str) -> Optional[dict]:
    try:
        result = fetch_jd_from_url(url)
        if result.get("success"):
            return {"url": url, "content": result["content"]}
    except Exception:
        pass
    return None


# ──────────────────────────────────────────────────────────────────
# Public-pool dedup
# ──────────────────────────────────────────────────────────────────

def _existing_pool_keys() -> set[tuple[str, str]]:
    """Return (normalized_company, normalized_title) pairs for every active
    job_listing already in our pool. Used to suppress duplicates in web search.
    """
    out: set[tuple[str, str]] = set()
    try:
        conn = sqlite3.connect(str(DB_PATH))
        try:
            cur = conn.execute(
                "SELECT c.display_name, jl.title "
                "FROM job_listings jl JOIN companies c ON c.id = jl.company_id "
                "WHERE jl.is_active = 1"
            )
            for company, title in cur.fetchall():
                out.add((
                    (company or "").strip().lower(),
                    (title or "").strip().lower(),
                ))
        finally:
            conn.close()
    except Exception:
        pass  # If DB unavailable, dedup just becomes a no-op.
    return out


# ──────────────────────────────────────────────────────────────────
# Main entry point
# ──────────────────────────────────────────────────────────────────

def search_and_parse_jobs(
    query: str,
    model_choice: str,
    api_key: Optional[str] = None,
    resume_data: Optional[dict] = None,
    max_results: int = 10,
) -> dict:
    """Search the web for jobs, fetch individual pages, and parse into
    structured jobs. Returns:
        {"success": True, "jobs": [...], "stats": {...}}
        {"success": False, "error": "..."}
    """
    try:
        search_results = search_jobs_web(query, max_results=max_results)
    except Exception as e:
        return {"success": False, "error": f"Web search failed: {e}"}

    if not search_results:
        return {
            "success": False,
            "error": (
                "No job listings found. Try a different search query "
                "(include role + location, e.g. 'ML engineer NYC')."
            ),
        }

    # Fetch top URLs in parallel. Anything we can't fetch is dropped — we
    # used to fall back to LLM-extracting from snippets which produced
    # hallucinated companies.
    urls_to_fetch = [r["url"] for r in search_results][:15]
    fetched_pages: list[dict] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        futures = [pool.submit(_fetch_single_url, u) for u in urls_to_fetch]
        try:
            for f in concurrent.futures.as_completed(futures, timeout=60):
                page = f.result()
                if page:
                    fetched_pages.append(page)
        except concurrent.futures.TimeoutError:
            pass  # Take what we got; users prefer fewer good results to a 60s wait.

    if not fetched_pages:
        return {
            "success": False,
            "error": "Found URLs but couldn't fetch any. Try again or paste a JD manually.",
        }

    # Build LLM input. Per-page truncation raised to 8k (was 4k).
    # Total cap removed — gpt-4o / claude-sonnet handle 100k+ tokens fine.
    content_parts = []
    for i, page in enumerate(fetched_pages, 1):
        content = (page["content"] or "")[:8000]
        content_parts.append(f"--- JOB PAGE {i} (URL: {page['url']}) ---\n{content}")
    all_content = "\n\n".join(content_parts)

    resume_section = ""
    match_fields = ""
    if resume_data:
        resume_section = (
            "\nCANDIDATE'S RESUME (for match scoring):\n"
            + json.dumps(resume_data, ensure_ascii=False, indent=2)
        )
        match_fields = (
            '\n    "match_score": <0-100 how well the candidate matches>,'
            '\n    "gaps": ["Gap 1", "Gap 2"],'
            '\n    "tailoring_tips": ["Tip 1", "Tip 2"],'
        )

    system_text = f"""You extract structured job postings from web pages.

{all_content}
{resume_section}
RULES:
- Extract every distinct job posting. Each page typically has exactly one job.
- Use the EXACT url from the source. Do NOT fabricate URLs.
- Skip pages that are clearly NOT individual job postings (articles, guides,
  search-result lists, careers-page directories without a specific role).
- For each extracted job, set "confidence":
    "high" — the page is unambiguously one job posting with title + company
             + a real description.
    "low"  — you're guessing because the page is sparse, navigational, or
             the title/company isn't clearly stated.

Return ONLY valid JSON in this shape:
{{
    "jobs": [
        {{
            "title": "<Job Title>",
            "company": "<Company Name>",
            "location": "<City, State or '' if unclear>",
            "work_type": "<onsite|remote|hybrid or ''>",
            "url": "<exact URL from source>",
            "jd_summary": "<2-3 sentence description>",
            "requirements": ["Key requirement 1", "Key requirement 2"],
            "confidence": "<high|low>",{match_fields}
        }}
    ]
}}"""

    try:
        llm = get_llm(model_choice, api_key)
        res = llm.invoke(
            [SystemMessage(content=system_text)],
            response_format={"type": "json_object"},
        )
        result = clean_json(res.content)
        raw_jobs = result.get("jobs", []) or []
    except Exception as e:
        return {"success": False, "error": f"Failed to parse search results: {e}"}

    # ── Post-LLM filtering pipeline ──
    pool_keys = _existing_pool_keys()
    rejected = {"low_confidence": 0, "non_target_role": 0, "in_pool": 0, "missing": 0}
    cleaned: list[dict] = []
    seen_keys: set[tuple[str, str]] = set()

    for job in raw_jobs:
        # Normalize work_type + location early — easier for downstream code.
        wt = (job.get("work_type") or "").lower().strip()
        job["work_type"] = wt if wt in ("onsite", "remote", "hybrid") else ""
        loc = (job.get("location") or "").strip()
        if loc.lower() in ("not specified", "unknown", "n/a", "tbd", ""):
            job["location"] = ""

        title = (job.get("title") or "").strip()
        company = (job.get("company") or "").strip()
        url = (job.get("url") or "").strip()
        if not title or not company or not url:
            rejected["missing"] += 1
            continue

        # Drop low-confidence extractions.
        if (job.get("confidence") or "").lower() == "low":
            rejected["low_confidence"] += 1
            continue

        # Drop non-target roles (sales / clinical / ops / etc).
        keep, _ = eval_role(title)
        if not keep:
            rejected["non_target_role"] += 1
            continue

        # Suppress jobs already in our public pool.
        key = (company.lower(), title.lower())
        if key in pool_keys:
            rejected["in_pool"] += 1
            continue

        # Within-batch dedup (LLM occasionally extracts the same job twice
        # when fed two near-duplicate URLs).
        if key in seen_keys:
            continue
        seen_keys.add(key)

        # Enrich with structured signals from JD body (we have summary +
        # requirements concatenated as proxy).
        jd_body = "\n".join([
            job.get("jd_summary") or "",
            *(job.get("requirements") or []),
        ])
        sig = extract_jd_fields(title, jd_body, loc)
        job.setdefault("level", sig["level"])
        job.setdefault("years_min", sig["years_min"])
        job.setdefault("sponsorship_signal", sig["sponsorship_signal"])
        if not job["work_type"]:
            job["work_type"] = sig["work_type"]

        # Final defaults.
        job.setdefault("requirements", [])
        job.setdefault("jd_summary", "")
        if resume_data:
            job.setdefault("match_score", 0)
            job.setdefault("gaps", [])
            job.setdefault("tailoring_tips", [])

        cleaned.append(job)

    return {
        "success": True,
        "jobs": cleaned,
        "stats": {
            "searched": len(search_results),
            "fetched": len(fetched_pages),
            "llm_extracted": len(raw_jobs),
            "kept": len(cleaned),
            "rejected": rejected,
        },
    }
