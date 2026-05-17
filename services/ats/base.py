"""
Base classes and shared types for all ATS adapters.

Every ATS vendor (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable)
implements ATSAdapter.fetch_jobs() and yields RawJob instances. The orchestrator
never needs to know which vendor it is talking to.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncIterator, Optional

import httpx
from bs4 import BeautifulSoup


@dataclass
class RawJob:
    """Vendor-agnostic structured job record. The output of every adapter."""
    external_id: str                     # ATS-provided unique job id
    source: str                          # 'greenhouse','lever','ashby',...
    title: str
    location_raw: str = ""
    department: str = ""
    team: str = ""
    employment_type: str = ""
    work_type: str = ""                  # 'onsite','remote','hybrid',''
    description_html: str = ""
    description_text: str = ""
    apply_url: str = ""
    posted_at: Optional[str] = None      # ISO date string
    updated_ats_at: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    salary_currency: str = "USD"


class ATSAdapter(ABC):
    """Abstract base for ATS vendor adapters.

    Subclasses set ``source`` to a vendor identifier and implement ``fetch_jobs``.
    """

    source: str = ""

    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    @abstractmethod
    async def fetch_jobs(
        self, company_slug: str, ats_config: dict
    ) -> AsyncIterator[RawJob]:
        """Yield every currently-open job for the given company.

        Raises on hard failures (HTTP error, malformed response). The orchestrator
        is responsible for catching and logging errors per-company.
        """
        ...
        # Dummy yield so type-checkers understand this is an async generator.
        if False:  # pragma: no cover
            yield RawJob(external_id="", source=self.source, title="")

    @staticmethod
    def html_to_text(html: str, max_chars: int = 20000) -> str:
        """Strip HTML tags to plain text. Shared helper used by every adapter.

        Capped at 20k characters to keep the DB rows bounded.
        """
        if not html:
            return ""
        try:
            soup = BeautifulSoup(html, "html.parser")
            text = soup.get_text(separator=" ", strip=True)
        except Exception:
            text = html
        # Collapse whitespace
        text = " ".join(text.split())
        return text[:max_chars]
