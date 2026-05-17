"""
Greenhouse ATS adapter.

Greenhouse exposes a public, unauthenticated JSON job board API:

    GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true

One request returns every currently-open job for the board. This is the cleanest
ATS to integrate with, which is why we implement it first.

Reference: https://developers.greenhouse.io/job-board.html
"""
from __future__ import annotations

from typing import AsyncIterator
from urllib.parse import unquote

from services.ats.base import ATSAdapter, RawJob


class GreenhouseAdapter(ATSAdapter):
    source = "greenhouse"

    BASE_URL = "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"

    async def fetch_jobs(
        self, company_slug: str, ats_config: dict
    ) -> AsyncIterator[RawJob]:
        url = self.BASE_URL.format(slug=company_slug)
        resp = await self.client.get(url, params={"content": "true"}, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        for j in data.get("jobs", []):
            # Greenhouse encodes the description HTML. It arrives as URL-encoded
            # text in some older boards, so we best-effort decode.
            html = j.get("content", "") or ""
            try:
                # Greenhouse often sends already-decoded HTML, but a few boards
                # still return %3C%2Fp%3E style entities. unquote is a no-op if
                # there are no encoded sequences.
                html = unquote(html)
            except Exception:
                pass

            location = (j.get("location") or {}).get("name", "") or ""

            departments = j.get("departments") or []
            department_name = ", ".join(
                d.get("name", "") for d in departments if d.get("name")
            )

            offices = j.get("offices") or []
            # Some boards keep the structured location only under offices.
            if not location and offices:
                location = ", ".join(o.get("name", "") for o in offices if o.get("name"))

            yield RawJob(
                external_id=str(j.get("id", "")),
                source=self.source,
                title=(j.get("title") or "").strip(),
                location_raw=location.strip(),
                department=department_name,
                description_html=html,
                description_text=self.html_to_text(html),
                apply_url=j.get("absolute_url", "") or "",
                updated_ats_at=j.get("updated_at"),
            )
