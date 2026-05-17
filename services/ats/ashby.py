"""
Ashby ATS adapter.

Ashby exposes a public job-board API per company:

    GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true

Returns: {"apiVersion": "v1", "jobs": [...]}.
Each job carries id, title, departmentName, locationName, employmentType,
descriptionHtml/Plain, jobUrl, plus structured compensation if requested.

Reference: https://developers.ashbyhq.com/reference/jobboards
"""
from __future__ import annotations

from typing import AsyncIterator, Optional

from services.ats.base import ATSAdapter, RawJob


def _normalize_iso_date(s) -> Optional[str]:
    if not s or not isinstance(s, str):
        return None
    return s[:10]  # "2025-04-15T12:34:56Z" → "2025-04-15"


def _extract_compensation(comp: dict) -> tuple[Optional[float], Optional[float], str]:
    """Ashby compensation is structured but optional. Pull the FIRST salary
    component (yearly USD, typically) and ignore equity/bonus rows.
    """
    if not isinstance(comp, dict):
        return None, None, "USD"
    summary = comp.get("summaryComponents") or []
    for c in summary:
        if (c.get("compensationType") or "").lower() != "salary":
            continue
        cur = (c.get("currencyCode") or "USD").upper()
        mn = c.get("minValue")
        mx = c.get("maxValue")
        if isinstance(mn, (int, float)) or isinstance(mx, (int, float)):
            return (
                float(mn) if isinstance(mn, (int, float)) else None,
                float(mx) if isinstance(mx, (int, float)) else None,
                cur,
            )
    return None, None, "USD"


class AshbyAdapter(ATSAdapter):
    source = "ashby"

    BASE_URL = "https://api.ashbyhq.com/posting-api/job-board/{slug}"

    async def fetch_jobs(
        self, company_slug: str, ats_config: dict
    ) -> AsyncIterator[RawJob]:
        url = self.BASE_URL.format(slug=company_slug)
        resp = await self.client.get(
            url, params={"includeCompensation": "true"}, timeout=30
        )
        resp.raise_for_status()
        data = resp.json()

        for j in data.get("jobs", []) or []:
            html = j.get("descriptionHtml") or ""
            text = j.get("descriptionPlain") or self.html_to_text(html)

            mn, mx, cur = _extract_compensation(j.get("compensation") or {})

            # `isRemote` is a sometimes-set bool; many boards leave it unset
            # and embed "Remote" in the location string instead.
            work_type = ""
            if j.get("isRemote") is True:
                work_type = "remote"

            yield RawJob(
                external_id=str(j.get("id", "")),
                source=self.source,
                title=(j.get("title") or "").strip(),
                location_raw=(j.get("locationName") or "").strip(),
                department=(j.get("departmentName") or "").strip(),
                team=(j.get("teamName") or "").strip(),
                employment_type=(j.get("employmentType") or "").strip(),
                work_type=work_type,
                description_html=html,
                description_text=text,
                apply_url=j.get("jobUrl") or j.get("applyUrl") or "",
                posted_at=_normalize_iso_date(j.get("publishedAt")),
                updated_ats_at=_normalize_iso_date(j.get("updatedAt")),
                salary_min=mn,
                salary_max=mx,
                salary_currency=cur,
            )
