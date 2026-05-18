"""
Validate Lever + Ashby adapters against synthetic API payloads modeled on
real public responses. These run without network access — important for
CI hygiene and to catch field-mapping regressions independent of vendor
uptime.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from services.ats.ashby import AshbyAdapter  # noqa: E402
from services.ats.lever import LeverAdapter  # noqa: E402


# ──────────────────────────────────────────────────────────────────
# Fixtures (mirror the real public API shapes — captured 2026)
# ──────────────────────────────────────────────────────────────────

LEVER_FIXTURE = [
    {
        "id": "abc-123-uuid",
        "text": "Senior Software Engineer, Backend",
        "categories": {
            "location": "New York, NY",
            "team": "Platform",
            "department": "Engineering",
            "commitment": "Full-time",
        },
        "workplaceType": "hybrid",
        "descriptionHtml": "<p>We are looking for a senior engineer.</p>",
        "descriptionPlain": "We are looking for a senior engineer.",
        "lists": [
            {"text": "What you'll do", "content": "<ul><li>Build APIs</li></ul>"},
            {"text": "What you'll bring", "content": "<ul><li>5+ years</li></ul>"},
        ],
        "hostedUrl": "https://jobs.lever.co/cruise/abc-123",
        "applyUrl": "https://jobs.lever.co/cruise/abc-123/apply",
        "createdAt": 1735689600000,   # 2025-01-01 UTC
        "updatedAt": 1738368000000,   # 2025-02-01 UTC
        "salaryRange": {"min": 180000, "max": 240000, "currency": "USD"},
    },
    {
        # Bare-minimum posting; many fields missing.
        "id": "def-456-uuid",
        "text": "Software Engineer Intern",
        "categories": {"location": "Remote - US"},
        "hostedUrl": "https://jobs.lever.co/cruise/def-456",
    },
]


ASHBY_FIXTURE = {
    "apiVersion": "v1",
    "jobs": [
        {
            "id": "ashby-job-001",
            "title": "Senior Machine Learning Engineer",
            "departmentName": "AI Research",
            "teamName": "Foundation Models",
            "employmentType": "FullTime",
            "locationName": "San Francisco, CA",
            "isRemote": False,
            "descriptionHtml": "<p>Join our ML team.</p>",
            "descriptionPlain": "Join our ML team.",
            "jobUrl": "https://jobs.ashbyhq.com/openai/ashby-job-001",
            "publishedAt": "2025-03-15T12:00:00Z",
            "updatedAt": "2025-04-02T09:30:00Z",
            "compensation": {
                "summaryComponents": [
                    {
                        "compensationType": "Salary",
                        "currencyCode": "USD",
                        "minValue": 250000,
                        "maxValue": 350000,
                    },
                    {
                        "compensationType": "Equity",  # ignored
                        "currencyCode": "USD",
                        "minValue": 100000,
                        "maxValue": 500000,
                    },
                ],
            },
        },
        {
            # No compensation, remote
            "id": "ashby-job-002",
            "title": "Software Engineer, Frontend",
            "departmentName": "Engineering",
            "locationName": "Remote",
            "isRemote": True,
            "descriptionHtml": "<p>Build the UI.</p>",
            "jobUrl": "https://jobs.ashbyhq.com/openai/ashby-job-002",
        },
    ],
}


# ──────────────────────────────────────────────────────────────────
# Mock HTTP plumbing
# ──────────────────────────────────────────────────────────────────

def _mock_client_returning(payload):
    """Build a fake httpx.AsyncClient whose `.get(...)` resolves to `payload`."""
    client = MagicMock()
    response = MagicMock()
    response.json = MagicMock(return_value=payload)
    response.raise_for_status = MagicMock(return_value=None)
    client.get = AsyncMock(return_value=response)
    return client


async def _collect(adapter):
    out = []
    async for job in adapter.fetch_jobs("test-slug", {}):
        out.append(job)
    return out


# ──────────────────────────────────────────────────────────────────
# Lever
# ──────────────────────────────────────────────────────────────────

def test_lever_full_mapping():
    client = _mock_client_returning(LEVER_FIXTURE)
    adapter = LeverAdapter(client)
    jobs = asyncio.run(_collect(adapter))
    assert len(jobs) == 2

    j = jobs[0]
    assert j.external_id == "abc-123-uuid"
    assert j.source == "lever"
    assert j.title == "Senior Software Engineer, Backend"
    assert j.location_raw == "New York, NY"
    assert j.department == "Engineering"
    assert j.team == "Platform"
    assert j.employment_type == "Full-time"
    assert j.work_type == "hybrid"
    assert "senior engineer" in j.description_text.lower()
    assert j.apply_url == "https://jobs.lever.co/cruise/abc-123"
    assert j.posted_at == "2025-01-01"
    assert j.updated_ats_at == "2025-02-01"
    assert j.salary_min == 180000
    assert j.salary_max == 240000
    assert j.salary_currency == "USD"
    print("  ✓ Lever full posting mapped")

    j = jobs[1]
    assert j.external_id == "def-456-uuid"
    assert j.title == "Software Engineer Intern"
    assert j.location_raw == "Remote - US"
    assert j.work_type == ""
    assert j.salary_min is None
    print("  ✓ Lever sparse posting mapped (defaults applied)")


def test_lever_workplace_type_normalization():
    """Lever serves 'on-site' (with hyphen) — make sure we normalize to 'onsite'."""
    fixture = [{
        "id": "x", "text": "SWE",
        "categories": {"location": "NY"},
        "workplaceType": "on-site",
        "hostedUrl": "https://jobs.lever.co/x/x",
    }]
    client = _mock_client_returning(fixture)
    adapter = LeverAdapter(client)
    jobs = asyncio.run(_collect(adapter))
    assert jobs[0].work_type == "onsite", jobs[0].work_type
    print("  ✓ Lever work_type 'on-site' → 'onsite'")


def test_lever_lists_fallback_for_html():
    """When `descriptionHtml` is missing, fall back to assembling from `lists`."""
    fixture = [{
        "id": "x", "text": "SWE",
        "categories": {"location": "NY"},
        "lists": [{"text": "About", "content": "<p>Cool company</p>"}],
        "hostedUrl": "https://jobs.lever.co/x/x",
    }]
    client = _mock_client_returning(fixture)
    adapter = LeverAdapter(client)
    jobs = asyncio.run(_collect(adapter))
    assert "About" in jobs[0].description_html
    assert "Cool company" in jobs[0].description_text
    print("  ✓ Lever lists fallback for HTML body")


# ──────────────────────────────────────────────────────────────────
# Ashby
# ──────────────────────────────────────────────────────────────────

def test_ashby_full_mapping():
    client = _mock_client_returning(ASHBY_FIXTURE)
    adapter = AshbyAdapter(client)
    jobs = asyncio.run(_collect(adapter))
    assert len(jobs) == 2

    j = jobs[0]
    assert j.external_id == "ashby-job-001"
    assert j.source == "ashby"
    assert j.title == "Senior Machine Learning Engineer"
    assert j.location_raw == "San Francisco, CA"
    assert j.department == "AI Research"
    assert j.team == "Foundation Models"
    assert j.employment_type == "FullTime"
    assert j.work_type == ""   # isRemote=False, no other signal
    assert j.posted_at == "2025-03-15"
    assert j.updated_ats_at == "2025-04-02"
    # Salary picked from first non-equity component
    assert j.salary_min == 250000
    assert j.salary_max == 350000
    assert j.salary_currency == "USD"
    print("  ✓ Ashby full posting mapped")

    j = jobs[1]
    assert j.title == "Software Engineer, Frontend"
    assert j.work_type == "remote"
    assert j.salary_min is None
    assert j.salary_max is None
    assert j.salary_currency == "USD"  # fallback
    print("  ✓ Ashby remote/no-comp posting mapped")


def test_ashby_compensation_skips_equity():
    """If only equity component is present, leave salary fields None."""
    fixture = {
        "jobs": [{
            "id": "x", "title": "X", "locationName": "NY",
            "jobUrl": "https://jobs.ashbyhq.com/x/x",
            "compensation": {
                "summaryComponents": [
                    {"compensationType": "Equity", "currencyCode": "USD",
                     "minValue": 1000, "maxValue": 5000},
                ],
            },
        }],
    }
    client = _mock_client_returning(fixture)
    adapter = AshbyAdapter(client)
    jobs = asyncio.run(_collect(adapter))
    assert jobs[0].salary_min is None
    assert jobs[0].salary_max is None
    print("  ✓ Ashby skips equity-only compensation")


def test_orchestrator_registry_has_three_vendors():
    """Smoke test that the registry surface matches expectations."""
    from services.ingestion.orchestrator import ADAPTERS
    assert set(ADAPTERS.keys()) == {"greenhouse", "lever", "ashby"}, ADAPTERS.keys()
    print("  ✓ orchestrator registers greenhouse / lever / ashby")


if __name__ == "__main__":
    print("test_lever_full_mapping")
    test_lever_full_mapping()
    print("test_lever_workplace_type_normalization")
    test_lever_workplace_type_normalization()
    print("test_lever_lists_fallback_for_html")
    test_lever_lists_fallback_for_html()
    print("test_ashby_full_mapping")
    test_ashby_full_mapping()
    print("test_ashby_compensation_skips_equity")
    test_ashby_compensation_skips_equity()
    print("test_orchestrator_registry_has_three_vendors")
    test_orchestrator_registry_has_three_vendors()
    print("\nALL TESTS PASSED")
