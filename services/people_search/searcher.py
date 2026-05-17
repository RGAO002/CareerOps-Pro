"""Step 2+3: Generate search queries and execute multi-source web search.

Sources used (free / public only):
    - DuckDuckGo (ddgs)
    - GitHub user search (REST API, no token required for low volume)
"""
from __future__ import annotations

import re
import httpx
from ddgs import DDGS

from services.people_search.schema import Evidence, ParsedCriteria


# ──────────────────────────────────────────────────────────────────
# Query generation
# ──────────────────────────────────────────────────────────────────

def _quote(s: str) -> str:
    """Wrap multi-word terms in quotes for exact-match dorking."""
    s = s.strip()
    return f'"{s}"' if " " in s else s


def build_search_queries(criteria: ParsedCriteria) -> list[str]:
    """Generate up to ~8 targeted queries from the structured criteria.

    Strategy: cross-product the most distinctive signals (schools × employers,
    employers × roles), bias toward LinkedIn public profile pages.
    """
    queries: list[str] = []

    schools = [_quote(s) for s in criteria.schools if not s.startswith("<")]
    past = [_quote(s) for s in criteria.employers_past]
    current = [_quote(s) for s in criteria.employers_current]
    roles = [_quote(r) for r in criteria.roles]
    locs = [_quote(l) for l in criteria.location_hints]

    employers = list(dict.fromkeys(past + current))  # dedup, keep order

    # 1. school × employer  → strongest signal for alumni-finding
    for school in schools:
        for emp in employers:
            queries.append(f'{school} {emp} site:linkedin.com/in')

    # 2. employer × role
    for emp in employers:
        for role in roles:
            queries.append(f'{emp} {role} site:linkedin.com/in')

    # 3. employer × role on the open web
    for emp in employers:
        for role in roles:
            queries.append(f'{emp} {role} founder OR co-founder')

    # 4. school × role on LinkedIn
    for school in schools:
        for role in roles:
            queries.append(f'{school} {role} site:linkedin.com/in')

    # 5. fallback: just the raw query
    if not queries:
        queries.append(criteria.raw_query)

    # Apply location filter if any
    if locs:
        loc_clause = " OR ".join(locs)
        queries = [f'{q} ({loc_clause})' for q in queries]

    # Cap to 8 queries to keep latency / rate-limits sane
    return queries[:8]


# ──────────────────────────────────────────────────────────────────
# DuckDuckGo
# ──────────────────────────────────────────────────────────────────

def _ddg_search_one(query: str, max_results: int = 10) -> list[Evidence]:
    out: list[Evidence] = []
    try:
        for r in DDGS().text(query, max_results=max_results):
            url = r.get("href") or ""
            if not url:
                continue
            out.append(Evidence(
                source="duckduckgo",
                url=url,
                title=r.get("title") or "",
                snippet=r.get("body") or "",
            ))
    except Exception:
        pass
    return out


def ddg_search_all(queries: list[str], per_query: int = 10) -> list[Evidence]:
    """Run all DDG queries; dedupe by URL."""
    seen: set[str] = set()
    out: list[Evidence] = []
    for q in queries:
        for ev in _ddg_search_one(q, max_results=per_query):
            if ev.url in seen:
                continue
            seen.add(ev.url)
            out.append(ev)
    return out


# ──────────────────────────────────────────────────────────────────
# GitHub user search
# ──────────────────────────────────────────────────────────────────

def _gh_query(criteria: ParsedCriteria) -> str | None:
    """Build a GitHub search query string. Returns None if not enough signal."""
    parts: list[str] = []
    employers = (criteria.employers_past or []) + (criteria.employers_current or [])
    if employers:
        parts.append(employers[0])
    if criteria.roles:
        parts.append(criteria.roles[0])
    if criteria.location_hints:
        parts.append(f"location:{criteria.location_hints[0]}")
    if not parts:
        return None
    return " ".join(parts)


def github_search(criteria: ParsedCriteria, max_results: int = 10) -> list[Evidence]:
    """Query GitHub's public user search API; returns up to max_results profiles."""
    q = _gh_query(criteria)
    if not q:
        return []
    try:
        url = "https://api.github.com/search/users"
        params = {"q": q, "per_page": max_results}
        r = httpx.get(url, params=params, timeout=10.0,
                      headers={"Accept": "application/vnd.github+json"})
        if r.status_code != 200:
            return []
        items = r.json().get("items", []) or []
    except Exception:
        return []

    out: list[Evidence] = []
    for it in items:
        login = it.get("login") or ""
        out.append(Evidence(
            source="github",
            url=it.get("html_url") or f"https://github.com/{login}",
            title=login,
            snippet=f"GitHub user · {it.get('type', 'User')}",
        ))
    return out


# ──────────────────────────────────────────────────────────────────
# Lightweight content fetch — optional, used to enrich evidence
# ──────────────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")


def extract_emails(text: str) -> list[str]:
    """Find plausible email addresses in a chunk of text. Filters obvious junk."""
    found = _EMAIL_RE.findall(text or "")
    out: list[str] = []
    for em in found:
        em_lower = em.lower()
        if any(bad in em_lower for bad in (
            "example.com", "your-email", "noreply", "no-reply",
            "sentry.io", "wixpress.com", "users.noreply.github.com",
        )):
            continue
        out.append(em)
    # Dedup, preserve order
    seen: set[str] = set()
    res: list[str] = []
    for em in out:
        if em.lower() in seen:
            continue
        seen.add(em.lower())
        res.append(em)
    return res
