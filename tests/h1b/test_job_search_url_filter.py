"""
Validate the URL-level filters in services/job_search.py.

These are pure-Python unit tests — no DDG, no fetching. They guard against
the regressions that motivated the rewrite:
    - "everything passes" fallback (was: return True at the end of the
      individual-posting heuristic)
    - aggregator pages slipping through
    - SEO/article hosts treated as job postings
"""
from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from services.job_search import (  # noqa: E402
    _domain_blocked,
    _is_ats_host,
    _looks_like_individual_posting,
)


KEEP_URLS = [
    # ATS hosts
    "https://boards.greenhouse.io/stripe/jobs/12345",
    "https://job-boards.greenhouse.io/anthropic/jobs/9876",
    "https://jobs.lever.co/cruise/abc-def-ghi",
    "https://jobs.ashbyhq.com/openai/00000-1111-2222",
    "https://apply.workable.com/somecompany/j/ABCDEF/",
    "https://careers.smartrecruiters.com/SomeCo/job-title-id-123",
    # LinkedIn / Indeed individual posts
    "https://www.linkedin.com/jobs/view/3987654321",
    "https://www.indeed.com/viewjob?jk=abc123",
    # Company career sites (slug under /careers or /jobs)
    "https://example.com/careers/jobs/senior-engineer-12345",
    "https://example.com/jobs/senior-software-engineer-backend",
    "https://example.com/positions/swe-platform",
]

DROP_URLS = [
    # Aggregator search pages
    "https://www.linkedin.com/jobs/search?keywords=software+engineer",
    "https://www.linkedin.com/jobs/collections/recommended/",
    "https://www.indeed.com/q-software-engineer-jobs.html",
    "https://www.indeed.com/jobs?q=software+engineer&l=NY",
    "https://www.glassdoor.com/Job/software-engineer-jobs-SRCH_KO0,17.htm",
    "https://www.ziprecruiter.com/jobs/search?q=python",
    # SEO / salary / article farms
    "https://www.salary.com/research/salary/benchmark/software-engineer",
    "https://www.payscale.com/research/US/Job=Software_Engineer/Salary",
    "https://en.wikipedia.org/wiki/Software_engineer",
    "https://www.reddit.com/r/cscareerquestions/comments/abc/",
    "https://builtin.com/jobs/dev-engineering",
    "https://www.simplyhired.com/jobs",
    # myworkdayjobs Search pages (aggregator-style, not the ATS hosts we want)
    "https://amazon.myworkdayjobs.com/Search?q=software",
    # Generic homepages with no posting
    "https://www.example.com/",
    "https://www.example.com/about",
]


def test_blocked_domains():
    for url in DROP_URLS:
        if any(blocker in url for blocker in (
            "search", "collections", "wikipedia", "reddit", "salary.com",
            "payscale", "Glassdoor", "glassdoor", "ziprecruiter", "builtin",
            "simplyhired",
        )):
            assert _domain_blocked(url) or not _looks_like_individual_posting(url), url
    print(f"  ✓ aggregator/SEO domains rejected: {len(DROP_URLS)} cases")


def test_ats_hosts_pass():
    for url in KEEP_URLS:
        if any(host in url for host in (
            "greenhouse.io", "lever.co", "ashbyhq.com",
            "workable.com", "smartrecruiters.com",
        )):
            assert _is_ats_host(url), url
    print("  ✓ ATS hosts identified")


def test_individual_postings_kept():
    for url in KEEP_URLS:
        assert _looks_like_individual_posting(url), url
    print(f"  ✓ individual postings kept: {len(KEEP_URLS)} cases")


def test_individual_postings_dropped():
    for url in DROP_URLS:
        assert not _looks_like_individual_posting(url), url
    print(f"  ✓ aggregator/junk URLs dropped: {len(DROP_URLS)} cases")


def test_no_default_true_regression():
    """The previous version of _looks_like_individual_posting ended with
    `return True` — every URL passed. This test ensures an obviously-wrong
    URL like a home page is rejected by the new conservative default.
    """
    for url in [
        "https://example.com/",
        "https://example.com/about-us",
        "https://example.com/blog/2025/why-we-love-python",
        "https://example.com/careers",  # careers index, not a specific job
    ]:
        assert not _looks_like_individual_posting(url), f"leaked: {url}"
    print("  ✓ default-true regression guarded")


if __name__ == "__main__":
    print("test_blocked_domains")
    test_blocked_domains()
    print("test_ats_hosts_pass")
    test_ats_hosts_pass()
    print("test_individual_postings_kept")
    test_individual_postings_kept()
    print("test_individual_postings_dropped")
    test_individual_postings_dropped()
    print("test_no_default_true_regression")
    test_no_default_true_regression()
    print("\nALL TESTS PASSED")
