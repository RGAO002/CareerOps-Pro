"""Tool registry + executors for the People Search agent.

Each tool has:
  - An Anthropic tool_use schema (name, description, input_schema)
  - An async executor that mutates AgentState and returns a string for the LLM.

Executors emit SSE events via the `emit` callback so the frontend can show
live progress.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from typing import Any, Awaitable, Callable, Optional

import httpx
from bs4 import BeautifulSoup

from services.people_search.agent.state import AgentState
from services.people_search.schema import Candidate, Evidence
from services.people_search.searcher import (
    _ddg_search_one,
    extract_emails,
    github_search as github_search_users,
)


EmitFn = Callable[[dict], Awaitable[None]]


# ──────────────────────────────────────────────────────────────────
# Tool schemas (sent to the LLM as part of tool_use)
# ──────────────────────────────────────────────────────────────────

# Sources for web_search. We treat zhihu/xiaohongshu/weibo as DDG-with-site-filter.
_VALID_SOURCES = ("duckduckgo", "zhihu", "xiaohongshu", "weibo")

_BASE_TOOLS: list[dict] = [
    {
        "name": "web_search",
        "description": (
            "Search the public web for snippets. Use this to find people, articles, "
            "blog posts, or any open information. The 'source' arg lets you target "
            "Chinese platforms via search-engine site-restriction (Zhihu / Xiaohongshu / "
            "Weibo). Use Chinese platforms when investigating Chinese names, alumni, "
            "or anything where Chinese-language sources matter. Use raw 'duckduckgo' "
            "with site:linkedin.com/in for LinkedIn public profiles."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "source": {
                    "type": "string",
                    "enum": list(_VALID_SOURCES),
                    "description": "Where to search. Default 'duckduckgo'.",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Max results to return (default 10, max 20).",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "fetch_page",
        "description": (
            "Fetch a public web page and return cleaned text. Use after web_search "
            "when you find a promising URL — a personal site, blog post, news article, "
            "or similar — to read the full content. Do NOT use on LinkedIn, X/Twitter, "
            "or Facebook (they block scrapers); use web_search to read their snippets."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Full URL to fetch"},
            },
            "required": ["url"],
        },
    },
    {
        "name": "github_user",
        "description": (
            "Fetch a GitHub user's public profile: bio, location, company, "
            "public email (if set), top repos. Use after you suspect a candidate "
            "has a GitHub account."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "login": {"type": "string", "description": "GitHub username (no @)"},
            },
            "required": ["login"],
        },
    },
    {
        "name": "github_search",
        "description": (
            "Search GitHub users by query (matches name, bio, location, company). "
            "Returns up to 10 candidate users."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "GitHub search query"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "hypothesize_candidate",
        "description": (
            "Register a new candidate person in the working set. Returns a candidate id "
            "you can later use with enrich_candidate / finalize."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "headline": {"type": "string"},
                "confidence": {"type": "integer", "description": "0-100"},
                "reasoning": {"type": "string"},
                "profile_links": {
                    "type": "object",
                    "description": "Map of platform → URL, e.g. {linkedin: '...', github: '...'}",
                },
                "emails": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
            "required": ["name", "confidence", "reasoning"],
        },
    },
    {
        "name": "enrich_candidate",
        "description": (
            "Add information to an existing candidate. Use this whenever you learn "
            "new facts about an already-hypothesized person."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "candidate_id": {"type": "string"},
                "patch": {
                    "type": "object",
                    "description": (
                        "Partial Candidate fields to merge: headline, confidence, "
                        "reasoning, profile_links (dict), emails (list), evidence (list)."
                    ),
                },
                "note": {
                    "type": "string",
                    "description": "Optional human-readable note about what was learned.",
                },
            },
            "required": ["candidate_id", "patch"],
        },
    },
    {
        "name": "finalize",
        "description": (
            "Terminate the search. Pass the candidate ids you want to return, "
            "ranked best-first. Call this when you have 3-5 candidates with "
            "confidence ≥ 60% OR when further searching is unlikely to help."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "top_candidate_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Candidate ids in order of best fit.",
                },
                "summary": {
                    "type": "string",
                    "description": "1-2 sentence summary of what you found.",
                },
            },
            "required": ["top_candidate_ids"],
        },
    },
]


_SPAWN_SUBAGENT_TOOL = {
    "name": "spawn_subagent",
    "description": (
        "Spawn an isolated subagent process to deep-investigate ONE specific lead. "
        "Use this when you have a promising candidate but need ~5-10 more searches "
        "to fully verify them — running it as a subagent keeps your own context "
        "focused. The subagent returns a JSON dossier you can fold back in via "
        "enrich_candidate."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "task": {
                "type": "string",
                "description": (
                    "Focused task description. Include the candidate's name, what "
                    "you already know, and what specifically the subagent should verify."
                ),
            },
            "candidate_id": {
                "type": "string",
                "description": "Candidate id this subagent investigates (for tagging the result).",
            },
        },
        "required": ["task"],
    },
}


def get_tools(*, is_main_agent: bool) -> list[dict]:
    """Tool list shown to the LLM. Subagents don't get spawn_subagent (no recursion)."""
    if is_main_agent:
        return _BASE_TOOLS + [_SPAWN_SUBAGENT_TOOL]
    return list(_BASE_TOOLS)


# ──────────────────────────────────────────────────────────────────
# Tool executors
# ──────────────────────────────────────────────────────────────────

async def _emit(emit: Optional[EmitFn], event: dict) -> None:
    if emit is not None:
        try:
            await emit(event)
        except Exception:
            pass  # never let event emission kill the loop


# ── web_search ──

_SOURCE_PREFIX = {
    "duckduckgo": "",
    "zhihu": "site:zhihu.com ",
    "xiaohongshu": "site:xiaohongshu.com ",
    "weibo": "site:weibo.com ",
}


async def _tool_web_search(input: dict, state: AgentState) -> str:
    query = (input.get("query") or "").strip()
    source = input.get("source") or "duckduckgo"
    max_results = int(input.get("max_results") or 10)
    max_results = max(1, min(20, max_results))

    if not query:
        return "ERROR: empty query"
    if source not in _SOURCE_PREFIX:
        return f"ERROR: unknown source {source!r}; valid: {list(_SOURCE_PREFIX)}"

    full_query = _SOURCE_PREFIX[source] + query
    # ddgs is sync; run in thread to keep loop responsive
    raw = await asyncio.to_thread(_ddg_search_one, full_query, max_results)

    # Pool into evidence + return formatted summary
    new_count = 0
    seen_urls = {ev.url for ev in state.evidence_pool}
    for ev in raw:
        if ev.url in seen_urls:
            continue
        # Mine emails into the snippet so they survive truncation downstream
        emails = extract_emails(ev.snippet)
        if emails:
            ev.snippet = f"[emails: {', '.join(emails)}] {ev.snippet}"
        ev.source = source  # mark with the actual source (zhihu / weibo / ...)
        state.evidence_pool.append(ev)
        seen_urls.add(ev.url)
        new_count += 1

    state.log_search("web_search", f"{source}: {query}", f"{len(raw)} hits, {new_count} new")

    if not raw:
        return f"No results from {source} for: {query}"

    lines = [f"web_search ({source}) for: {query}"]
    lines.append(f"Returned {len(raw)} results ({new_count} new):")
    for i, ev in enumerate(raw, 1):
        snip = (ev.snippet or "").strip().replace("\n", " ")[:240]
        lines.append(f"  [{i}] {ev.title}\n      URL: {ev.url}\n      {snip}")
    return "\n".join(lines)


# ── fetch_page ──

_BLOCKED_FETCH_DOMAINS = (
    "linkedin.com", "x.com", "twitter.com", "facebook.com",
    "instagram.com", "tiktok.com",
)


def _clean_html_text(html: str, max_chars: int = 8000) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for el in soup(["script", "style", "nav", "footer", "header", "noscript", "svg"]):
        el.decompose()
    # Try main / article / a content selector first
    for sel in ["article", "main", "[role=main]", ".content", "#content"]:
        node = soup.select_one(sel)
        if node and len(node.get_text(strip=True)) > 200:
            text = node.get_text("\n", strip=True)
            break
    else:
        text = soup.get_text("\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)
    if len(text) > max_chars:
        text = text[:max_chars] + "\n... [truncated]"
    return text


async def _tool_fetch_page(input: dict, state: AgentState) -> str:
    url = (input.get("url") or "").strip()
    if not url:
        return "ERROR: empty url"
    if not (url.startswith("http://") or url.startswith("https://")):
        return f"ERROR: url must start with http(s):// — got {url!r}"
    if any(blocked in url for blocked in _BLOCKED_FETCH_DOMAINS):
        return (
            f"ERROR: {url} is on a blocked domain (LinkedIn/X/Facebook/etc require "
            "login and will return junk). Use web_search to read public snippets instead."
        )

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as cli:
            resp = await cli.get(url, headers=headers)
            resp.raise_for_status()
            text = _clean_html_text(resp.text)
    except httpx.HTTPError as e:
        state.log_search("fetch_page", url, f"FAILED: {e}")
        return f"ERROR fetching {url}: {e}"
    except Exception as e:
        state.log_search("fetch_page", url, f"FAILED: {e}")
        return f"ERROR fetching {url}: {e}"

    # Mine emails — surface them prominently for the LLM
    emails = extract_emails(text)
    state.log_search("fetch_page", url, f"OK {len(text)} chars, {len(emails)} emails")
    header_line = f"Fetched {url} ({len(text)} chars)"
    if emails:
        header_line += f"  ·  emails found: {', '.join(emails[:5])}"
    return f"{header_line}\n\n{text}"


# ── github ──

async def _tool_github_user(input: dict, state: AgentState) -> str:
    login = (input.get("login") or "").strip().lstrip("@")
    if not login:
        return "ERROR: empty login"
    headers = {"Accept": "application/vnd.github+json"}
    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as cli:
            user_r = await cli.get(f"https://api.github.com/users/{login}", headers=headers)
            if user_r.status_code != 200:
                return f"ERROR github_user {login}: HTTP {user_r.status_code}"
            user = user_r.json()
            repos_r = await cli.get(
                f"https://api.github.com/users/{login}/repos",
                params={"sort": "updated", "per_page": 10},
                headers=headers,
            )
            repos = repos_r.json() if repos_r.status_code == 200 else []
    except Exception as e:
        return f"ERROR github_user {login}: {e}"

    state.log_search("github_user", login, f"OK profile + {len(repos) if isinstance(repos, list) else 0} repos")

    lines = [f"GitHub user: {login}"]
    lines.append(f"  name: {user.get('name') or '(none)'}")
    lines.append(f"  bio: {user.get('bio') or '(none)'}")
    lines.append(f"  company: {user.get('company') or '(none)'}")
    lines.append(f"  location: {user.get('location') or '(none)'}")
    lines.append(f"  email: {user.get('email') or '(none)'}")
    lines.append(f"  blog: {user.get('blog') or '(none)'}")
    lines.append(f"  twitter: {user.get('twitter_username') or '(none)'}")
    lines.append(f"  followers: {user.get('followers')}, public_repos: {user.get('public_repos')}")
    lines.append(f"  url: {user.get('html_url')}")
    lines.append(f"  created: {user.get('created_at')}")
    if isinstance(repos, list) and repos:
        lines.append("\nRecent repos:")
        for r in repos[:8]:
            desc = r.get("description") or ""
            lines.append(f"  - {r['name']} ({r.get('language') or '?'}, ★{r.get('stargazers_count', 0)}): {desc[:140]}")
    return "\n".join(lines)


async def _tool_github_search(input: dict, state: AgentState) -> str:
    q = (input.get("query") or "").strip()
    if not q:
        return "ERROR: empty query"
    headers = {"Accept": "application/vnd.github+json"}
    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as cli:
            r = await cli.get(
                "https://api.github.com/search/users",
                params={"q": q, "per_page": 10},
                headers=headers,
            )
            if r.status_code != 200:
                return f"ERROR github_search: HTTP {r.status_code}"
            items = r.json().get("items", [])
    except Exception as e:
        return f"ERROR github_search: {e}"

    state.log_search("github_search", q, f"{len(items)} hits")
    if not items:
        return f"github_search: no results for {q!r}"
    lines = [f"github_search for: {q}"]
    for it in items[:10]:
        lines.append(
            f"  - {it.get('login')} ({it.get('html_url')}) "
            f"score={it.get('score', 0):.1f}"
        )
    return "\n".join(lines)


# ── candidate management ──

async def _tool_hypothesize_candidate(
    input: dict, state: AgentState, emit: Optional[EmitFn]
) -> str:
    name = (input.get("name") or "").strip()
    if not name:
        return "ERROR: name required"
    cand = Candidate(
        name=name,
        headline=input.get("headline") or "",
        confidence=int(input.get("confidence") or 0),
        reasoning=input.get("reasoning") or "",
        profile_links={
            k: v for k, v in (input.get("profile_links") or {}).items() if v
        },
        emails=[e for e in (input.get("emails") or []) if isinstance(e, str)],
    )
    cid = state.add_candidate(cand)
    await _emit(emit, {"type": "candidate_added", "id": cid, "candidate": state.candidates[cid].to_dict()})
    return f"Candidate {cid} registered: {name} (confidence {cand.confidence})"


async def _tool_enrich_candidate(
    input: dict, state: AgentState, emit: Optional[EmitFn]
) -> str:
    cid = (input.get("candidate_id") or "").strip()
    patch = input.get("patch") or {}
    note = input.get("note") or ""

    if cid not in state.candidates:
        return f"ERROR: unknown candidate_id {cid!r}"
    if not isinstance(patch, dict):
        return "ERROR: patch must be an object"

    ok = state.update_candidate(cid, patch)
    if note:
        state.candidates[cid].notes.append(note)

    await _emit(emit, {"type": "candidate_updated", "id": cid, "patch": patch, "note": note})
    return f"Candidate {cid} updated{' with note' if note else ''}."


# ── finalize ──

async def _tool_finalize(input: dict, state: AgentState) -> str:
    ids = input.get("top_candidate_ids") or []
    if not isinstance(ids, list):
        return "ERROR: top_candidate_ids must be a list"
    valid = [cid for cid in ids if cid in state.candidates]
    state.final_top_ids = valid
    state.finalized = True
    state.termination_reason = "agent_finalized"
    summary = input.get("summary") or ""
    return f"Finalized with {len(valid)} candidate(s). {summary}"


# ── spawn_subagent ──

async def _tool_spawn_subagent(
    input: dict, state: AgentState, emit: Optional[EmitFn]
) -> str:
    task = (input.get("task") or "").strip()
    cid = input.get("candidate_id")
    if not task:
        return "ERROR: task required"

    await _emit(emit, {"type": "subagent_spawned", "task": task[:300], "candidate_id": cid})

    # Pass context via stdin as JSON
    payload = {
        "task": task,
        "candidate_id": cid,
        "parent_query": state.query,
        # Give the subagent a tiny seed of what we already know so it doesn't
        # repeat the parent's first searches
        "known_candidates": [
            tc.to_dict() for tc in state.candidates.values()
        ][:5],
    }
    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "services.people_search.agent.subagent",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(input=json.dumps(payload).encode("utf-8")),
            timeout=180.0,  # subagent has its own internal cap; this is the wall-clock guard
        )
    except asyncio.TimeoutError:
        return "ERROR: subagent timed out (>180s)"
    except Exception as e:
        return f"ERROR spawning subagent: {e}"

    if proc.returncode != 0:
        err = (stderr or b"").decode("utf-8", errors="replace")[:500]
        return f"ERROR: subagent exited {proc.returncode}\n{err}"

    raw = (stdout or b"").decode("utf-8", errors="replace").strip()
    # Subagent's last stdout line is its JSON dossier; keep raw for forwarding.
    await _emit(emit, {"type": "subagent_completed", "task": task[:200], "raw_len": len(raw)})
    return f"Subagent finished. Result:\n{raw[:6000]}"


# ──────────────────────────────────────────────────────────────────
# Dispatch
# ──────────────────────────────────────────────────────────────────

async def execute_tool(
    name: str,
    tool_input: dict,
    state: AgentState,
    emit: Optional[EmitFn] = None,
    *,
    is_main_agent: bool = True,
) -> str:
    """Route a tool call to its executor. Returns the LLM-facing string."""
    if name == "web_search":
        return await _tool_web_search(tool_input, state)
    if name == "fetch_page":
        return await _tool_fetch_page(tool_input, state)
    if name == "github_user":
        return await _tool_github_user(tool_input, state)
    if name == "github_search":
        return await _tool_github_search(tool_input, state)
    if name == "hypothesize_candidate":
        return await _tool_hypothesize_candidate(tool_input, state, emit)
    if name == "enrich_candidate":
        return await _tool_enrich_candidate(tool_input, state, emit)
    if name == "finalize":
        return await _tool_finalize(tool_input, state)
    if name == "spawn_subagent":
        if not is_main_agent:
            return "ERROR: subagents cannot spawn further subagents."
        return await _tool_spawn_subagent(tool_input, state, emit)
    return f"ERROR: unknown tool {name!r}"
