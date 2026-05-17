"""
SimplifyJobs feed adapter — pulls curated tech-internship + new-grad listings
from the public Pitt CSC × Simplify GitHub repos.

Source repos (both maintained daily by Simplify + community):
    Summer2026-Internships   ~2,400 active internships
    New-Grad-Positions       ~2,200 active full-time new-grad roles

Source-of-truth files (the README markdown is *generated* from these):
    https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json
    https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json

Why this is structurally different from an ATS adapter:
    ATSAdapter.fetch_jobs(slug) is keyed per-company. Simplify is a
    multi-company global feed — one HTTP fetch returns thousands of jobs
    spanning hundreds of companies. So this lives under services/feeds/
    and is invoked from a separate CLI command, not from
    orchestrator.refresh_all_companies.

Mapping & dedup policy:
    1. Filter incoming records: active=True, is_visible=True, category in our
       target families, term in TARGET_TERMS.
    2. Normalize the employer name and look up an existing companies row.
       If none, auto-create a lightweight row with ats_vendor='external'
       (signals "we found this via SimplifyJobs, not via a scrape").
    3. Upsert into job_listings with source='simplify' and external_id=<uuid>.
    4. Cross-source dedup: if the same (company_id, normalized_title) already
       exists from any other source (e.g. greenhouse), skip — the existing
       row is richer (it has a JD body and structured fields), so we don't
       overwrite it with the title-only Simplify version.
    5. Soft-retire: any prior simplify rows with external_ids we did NOT see
       this run get is_active=0.

Sponsorship signal mapping (Simplify uses 4 categorical values):
    "Offers Sponsorship"             → 'friendly'
    "Does Not Offer Sponsorship"     → 'unfriendly'
    "U.S. Citizenship is Required"   → 'unfriendly'
    "Other" / missing                → ''          (silent — we don't know)

We respect THEIR explicit signal even though we can't fetch the JD body —
this fills in ~130 of the ~1k silent rows in our pool with high-confidence
ground truth.
"""
from __future__ import annotations

import json
import re
import sqlite3
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Optional

from services.ats.location_filter import classify_location
from services.h1b.sponsor_normalize import normalize_employer_name
from services.ingestion.jd_extractor import extract as extract_jd_fields
from services.ingestion.role_filter import should_keep

DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "careeops.db"
DOWNLOAD_DIR = DB_PATH.parent / "simplify"

REPO_URLS = {
    "summer2026": (
        "https://raw.githubusercontent.com/SimplifyJobs/"
        "Summer2026-Internships/dev/.github/scripts/listings.json"
    ),
    "newgrad": (
        "https://raw.githubusercontent.com/SimplifyJobs/"
        "New-Grad-Positions/dev/.github/scripts/listings.json"
    ),
}

# Categories we surface to users. Simplify's taxonomy isn't perfectly aligned
# with ours, so we accept their broader buckets and let role_filter do the
# final word on each title. "Other" is rejected because it's a catch-all that
# tends to include marketing-eng, IT, and BD roles.
TARGET_CATEGORIES = {
    "Software", "Software Engineering",
    "AI/ML/Data", "Data Science, AI & Machine Learning",
    "Product", "Product Management",
    "Quant", "Quantitative Finance",
    "Hardware", "Hardware Engineering",
}

# Term acceptance — keep current and near-future, drop ancient summer 2024 etc.
# Stored verbatim from Simplify ('Summer 2026', 'Fall 2026', etc.).
TARGET_TERMS = {
    "Summer 2026", "Fall 2026", "Winter 2026", "Spring 2026",
    "Summer 2027", "Fall 2027", "Winter 2027", "Spring 2027",
    "N/A",  # full-time new-grad roles often have terms=['N/A']
}

_SPONSOR_MAP = {
    "Offers Sponsorship":           "friendly",
    "Does Not Offer Sponsorship":   "unfriendly",
    "U.S. Citizenship is Required": "unfriendly",
    # "Other" and unset → '' (default)
}


@dataclass
class SimplifyListing:
    external_id: str            # the simplify UUID
    title: str
    company_name_raw: str
    company_name_norm: str
    locations: list[str]
    apply_url: str
    category: str
    terms: list[str]
    sponsorship_signal: str     # already mapped to friendly/unfriendly/''
    posted_at: Optional[str]    # ISO date
    updated_at: Optional[str]
    repo_label: str             # 'summer2026' | 'newgrad'


def download_listings(repo_label: str, dest_dir: Path = DOWNLOAD_DIR) -> Path:
    """Fetch the latest listings.json for one repo. Always overwrites — we
    want the freshest data on every refresh; old snapshots aren't useful.
    """
    if repo_label not in REPO_URLS:
        raise ValueError(f"unknown repo {repo_label!r}; choices: {list(REPO_URLS)}")
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / f"{repo_label}.json"
    req = urllib.request.Request(
        REPO_URLS[repo_label],
        headers={"User-Agent": "CareerOpsPro-SimplifyFeed/1.0"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp, open(out, "wb") as f:
        f.write(resp.read())
    return out


def _ts_to_iso(ts) -> Optional[str]:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).strftime("%Y-%m-%d")
    except (TypeError, ValueError, OSError):
        return None


def _strip_tracking(url: str) -> str:
    """Drop ?utm_source=Simplify&ref=Simplify so we can compare apply URLs
    against the same job appearing in our other sources.
    """
    if "?" not in url:
        return url
    base, qs = url.split("?", 1)
    keep = "&".join(
        kv for kv in qs.split("&")
        if not kv.lower().startswith(("utm_", "ref=simplify", "source=simplify"))
    )
    return base if not keep else f"{base}?{keep}"


def parse_listings(path: Path, repo_label: str) -> Iterator[SimplifyListing]:
    """Stream listings from a saved JSON snapshot. Filters apply here."""
    with open(path) as f:
        data = json.load(f)

    for r in data:
        if not r.get("active") or not r.get("is_visible"):
            continue
        if (r.get("category") or "") not in TARGET_CATEGORIES:
            continue
        terms = r.get("terms") or []
        if isinstance(terms, str):
            terms = [terms]
        if not any(t in TARGET_TERMS for t in terms) and terms:
            # If terms is set and none match → drop. If terms is unset → keep.
            continue

        title = (r.get("title") or "").strip()
        company_raw = (r.get("company_name") or "").strip()
        if not title or not company_raw:
            continue

        apply_url = _strip_tracking((r.get("url") or "").strip())
        if not apply_url:
            continue

        locations = r.get("locations") or []
        if not isinstance(locations, list):
            locations = [str(locations)]

        sponsorship_signal = _SPONSOR_MAP.get(r.get("sponsorship") or "", "")

        yield SimplifyListing(
            external_id=str(r.get("id") or ""),
            title=title,
            company_name_raw=company_raw,
            company_name_norm=normalize_employer_name(company_raw),
            locations=[str(loc).strip() for loc in locations if loc],
            apply_url=apply_url,
            category=r.get("category") or "",
            terms=terms,
            sponsorship_signal=sponsorship_signal,
            posted_at=_ts_to_iso(r.get("date_posted")),
            updated_at=_ts_to_iso(r.get("date_updated")),
            repo_label=repo_label,
        )


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    s = _SLUG_RE.sub("-", name.lower()).strip("-")
    return s[:60] or "unknown"


def _ensure_company(
    conn: sqlite3.Connection,
    norm: str,
    raw: str,
) -> int:
    """Look up a company by normalized_name; auto-create if absent.

    Auto-created rows are marked ats_vendor='external' so they're visually
    distinguishable from operator-curated seeds and so the orchestrator
    won't try to scrape them via an ATS adapter (they have no slug).
    """
    if not norm:
        # Should never happen post-normalize, but defensive.
        norm = _slugify(raw)
    row = conn.execute(
        "SELECT id FROM companies WHERE normalized_name = ? LIMIT 1",
        (norm,),
    ).fetchone()
    if row:
        return row[0]

    # Need a unique slug — derived from the raw company name.
    base_slug = _slugify(raw or norm)
    slug = base_slug
    n = 1
    while conn.execute(
        "SELECT 1 FROM companies WHERE slug = ?", (slug,)
    ).fetchone():
        n += 1
        slug = f"{base_slug}-{n}"
    cur = conn.execute(
        "INSERT INTO companies (slug, display_name, normalized_name, ats_vendor) "
        "VALUES (?, ?, ?, 'external')",
        (slug, raw or norm, norm),
    )
    return cur.lastrowid


_UPSERT_SQL = """
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
    ?, ?, 'simplify',
    ?, ?, ?, ?, ?,
    ?, ?,
    ?, '', '', '',
    '', '',
    NULL, NULL, 'USD',
    ?, ?, ?,
    ?, NULL, ?,
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
    apply_url       = excluded.apply_url,
    posted_at       = excluded.posted_at,
    updated_ats_at  = excluded.updated_ats_at,
    level              = excluded.level,
    sponsorship_signal = excluded.sponsorship_signal,
    last_seen_at    = CURRENT_TIMESTAMP,
    is_active       = 1
"""


def refresh_simplify_feed(
    repos: list[str],
    download: bool = True,
) -> dict:
    """End-to-end: download → filter → map company → upsert → retire stale.

    Args:
        repos: list of repo labels in REPO_URLS to refresh.
        download: if False, expect the .json file to already exist on disk
                  (used by tests with synthetic fixtures).

    Returns: counters dict.
    """
    conn = sqlite3.connect(str(DB_PATH))
    try:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")

        totals = {
            "fetched": 0,
            "after_filter": 0,
            "filtered_role": 0,
            "duped_existing": 0,
            "upserted": 0,
            "retired": 0,
            "companies_auto_created": 0,
        }

        all_seen_ids: set[str] = set()
        existing_companies_count = conn.execute(
            "SELECT COUNT(*) FROM companies"
        ).fetchone()[0]

        for repo in repos:
            if download:
                path = download_listings(repo)
            else:
                path = DOWNLOAD_DIR / f"{repo}.json"

            for listing in parse_listings(path, repo):
                totals["fetched"] += 1

                if not should_keep(listing.title):
                    totals["filtered_role"] += 1
                    continue
                totals["after_filter"] += 1

                company_id = _ensure_company(
                    conn,
                    listing.company_name_norm,
                    listing.company_name_raw,
                )

                # Cross-source dedup: skip if the same company already has a
                # row for this title from any other source.
                norm_title = listing.title.strip().lower()
                duped = conn.execute(
                    "SELECT 1 FROM job_listings "
                    "WHERE company_id = ? AND lower(title) = ? "
                    "AND source != 'simplify' AND is_active = 1 LIMIT 1",
                    (company_id, norm_title),
                ).fetchone()
                if duped:
                    totals["duped_existing"] += 1
                    continue

                # Pick first location for tier classification + city/state.
                primary_loc = listing.locations[0] if listing.locations else ""
                loc_blob = "; ".join(listing.locations)
                # For tier-classification we need company HQ — leave blank;
                # the function still classifies pure NYC matches correctly
                # without HQ. Most simplify rows are nationwide anyway.
                loc = classify_location(loc_blob)

                # Title-only level extraction (no JD body available).
                jd = extract_jd_fields(listing.title, "", primary_loc)
                level = jd["level"]
                # Force level=intern for summer2026 repo (terms confirm).
                if listing.repo_label == "summer2026" and level == "":
                    level = "intern"

                conn.execute(
                    _UPSERT_SQL,
                    (
                        company_id, listing.external_id,
                        listing.title, loc_blob,
                        loc.get("city", ""), loc.get("state", ""), loc.get("country", ""),
                        1 if loc.get("is_nyc_metro") else 0,
                        loc.get("location_tier", ""),
                        jd["work_type"],
                        listing.apply_url,
                        listing.posted_at, listing.updated_at,
                        level, listing.sponsorship_signal,
                    ),
                )
                all_seen_ids.add(listing.external_id)
                totals["upserted"] += 1

            # Per-repo commit so a later repo's failure doesn't lose earlier work.
            conn.commit()

        # Retire stale: any source='simplify' row whose external_id we did
        # NOT see in this refresh — mark inactive (don't delete; preserves
        # tracker provenance via source_listing_id).
        if all_seen_ids:
            placeholders = ",".join("?" * len(all_seen_ids))
            cur = conn.execute(
                f"UPDATE job_listings SET is_active = 0 "
                f"WHERE source = 'simplify' AND is_active = 1 "
                f"AND external_id NOT IN ({placeholders})",
                list(all_seen_ids),
            )
            totals["retired"] = cur.rowcount or 0

        # Compute auto-created delta.
        new_count = conn.execute("SELECT COUNT(*) FROM companies").fetchone()[0]
        totals["companies_auto_created"] = new_count - existing_companies_count

        conn.commit()
        return totals
    finally:
        conn.close()
