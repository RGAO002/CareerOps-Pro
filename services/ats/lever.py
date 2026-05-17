"""
Lever ATS adapter.

Lever exposes a public, unauthenticated postings API per company:

    GET https://api.lever.co/v0/postings/{site}?mode=json

Returns a JSON array of postings. Each posting carries title, location/team/
department in `categories`, an HTML description, and `hostedUrl` for apply.

Reference: https://github.com/lever/postings-api
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import AsyncIterator, Optional

from services.ats.base import ATSAdapter, RawJob


def _ms_to_iso(ms: Optional[int]) -> Optional[str]:
    """Lever timestamps are milliseconds since epoch."""
    if ms is None:
        return None
    try:
        return datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
    except (TypeError, ValueError, OSError):
        return None


def _join_html_lists(lists: list) -> str:
    """Lever's `lists` field is an array of {text, content} HTML sections.
    Concatenate them into a single HTML body the way the rendered job page does.
    """
    parts: list[str] = []
    for item in lists or []:
        heading = item.get("text") or ""
        body = item.get("content") or ""
        if heading:
            parts.append(f"<h3>{heading}</h3>")
        if body:
            parts.append(body)
    return "\n".join(parts)


class LeverAdapter(ATSAdapter):
    source = "lever"

    BASE_URL = "https://api.lever.co/v0/postings/{slug}"

    async def fetch_jobs(
        self, company_slug: str, ats_config: dict
    ) -> AsyncIterator[RawJob]:
        url = self.BASE_URL.format(slug=company_slug)
        resp = await self.client.get(url, params={"mode": "json"}, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        # Lever returns a top-level array.
        for j in data if isinstance(data, list) else []:
            categories = j.get("categories") or {}
            location = categories.get("location") or ""
            team = categories.get("team") or ""
            department = categories.get("department") or ""
            commitment = categories.get("commitment") or ""

            html = j.get("descriptionHtml") or _join_html_lists(j.get("lists") or [])
            text = j.get("descriptionPlain") or self.html_to_text(html)

            # Salary may live under `salaryRange = {min, max, currency}`.
            salary = j.get("salaryRange") or {}
            salary_min = salary.get("min")
            salary_max = salary.get("max")
            salary_currency = (salary.get("currency") or "USD") if salary else "USD"

            # `workplaceType` is one of "on-site", "remote", "hybrid", "unspecified".
            wp = (j.get("workplaceType") or "").lower().replace("-", "")
            if wp == "onsite":
                work_type = "onsite"
            elif wp in ("remote", "hybrid"):
                work_type = wp
            else:
                work_type = ""

            yield RawJob(
                external_id=str(j.get("id", "")),
                source=self.source,
                title=(j.get("text") or "").strip(),
                location_raw=str(location).strip(),
                department=str(department),
                team=str(team),
                employment_type=str(commitment),
                work_type=work_type,
                description_html=html or "",
                description_text=text,
                apply_url=j.get("hostedUrl") or j.get("applyUrl") or "",
                posted_at=_ms_to_iso(j.get("createdAt")),
                updated_ats_at=_ms_to_iso(j.get("updatedAt")),
                salary_min=float(salary_min) if isinstance(salary_min, (int, float)) else None,
                salary_max=float(salary_max) if isinstance(salary_max, (int, float)) else None,
                salary_currency=salary_currency,
            )
