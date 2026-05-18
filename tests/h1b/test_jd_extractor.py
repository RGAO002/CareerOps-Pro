"""
Verify jd_extractor on representative real-world JD snippets.

Each test groups by extracted field. Edge cases are checked individually so
a regression makes it obvious which dimension broke.
"""
from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from services.ingestion.jd_extractor import extract  # noqa: E402


def test_level_from_title():
    cases = [
        ("Senior Software Engineer", "senior"),
        ("Staff Software Engineer, Backend", "staff"),
        ("Principal Engineer", "principal"),
        ("Distinguished Engineer", "principal"),
        ("Software Engineer Intern (Summer 2026)", "intern"),
        ("Software Engineer Co-op", "intern"),
        ("Software Engineer, New Grad", "new_grad"),
        ("Junior Developer", "junior"),
        ("Mid-Level Software Engineer", "mid"),
        ("Software Engineer", ""),
        ("Lead Software Engineer", "senior"),  # "Lead" → senior bucket
    ]
    for title, expected in cases:
        result = extract(title, "We are hiring...")
        assert result["level"] == expected, f"{title!r}: got {result['level']!r}, want {expected!r}"
    print(f"  ✓ level from title: {len(cases)} cases")


def test_level_from_body():
    """Body fallback only fires when title is silent."""
    result = extract("Software Engineer", "We are looking for a recent graduate to join our team.")
    assert result["level"] == "new_grad", result

    result = extract("Software Engineer", "Summer Intern position open.")
    assert result["level"] == "intern", result

    print("  ✓ level fallback to JD body for new_grad / intern")


def test_years_min():
    cases = [
        ("3+ years of experience", 3),
        ("Minimum 5 years experience required", 5),
        ("At least 7 years of professional experience", 7),
        ("3-5 years of experience in software development", 3),
        ("8 or more years of relevant experience", 8),
        ("We are a startup with 10 years of history", None),  # "history" not "experience"
        ("100+ years of legacy code", None),  # capped at 25
        ("", None),
    ]
    for body, expected in cases:
        result = extract("Software Engineer", body)
        assert result["years_min"] == expected, f"{body!r}: got {result['years_min']}, want {expected}"
    print(f"  ✓ years_min: {len(cases)} cases")


def test_years_min_picks_smallest():
    body = (
        "Required: 3+ years of software engineering experience. "
        "Preferred: 5+ years building distributed systems. "
        "Bonus: 8 or more years in fintech."
    )
    result = extract("Software Engineer", body)
    # Floor is "3" (minimum required, smallest that satisfies)
    assert result["years_min"] == 3, result
    print("  ✓ years_min picks smallest (the actual minimum)")


def test_work_type():
    cases = [
        ("Software Engineer (Remote)",   "Remote - US",         "We are a fully remote team",      "remote"),
        ("Software Engineer (Hybrid)",   "New York, NY",        "Hybrid 3 days a week in office",  "hybrid"),
        ("Software Engineer",            "San Francisco, CA",   "Onsite role in our SF office",    "onsite"),
        ("Software Engineer",            "New York, NY",        "Description says nothing",        ""),
        # Hybrid wins when both hybrid + remote hint appear
        ("Software Engineer",            "Remote",              "Hybrid (remote-friendly)",        "hybrid"),
    ]
    for title, loc, body, expected in cases:
        result = extract(title, body, loc)
        assert result["work_type"] == expected, f"{title!r}/{loc!r}: got {result['work_type']!r}, want {expected!r}"
    print(f"  ✓ work_type: {len(cases)} cases")


def test_sponsorship_unfriendly():
    cases = [
        "We are unable to provide visa sponsorship for this position.",
        "This position does not offer visa sponsorship at this time.",
        "This position does not provide visa sponsorship.",
        "We are not providing visa sponsorship for this role.",
        "Sponsorship is not offered.",
        "We do not sponsor work visas for this role.",
        "We will not sponsor employees for this position.",
        "Cannot sponsor for this role.",
        "Must be legally authorized to work in the U.S. without sponsorship.",
        "U.S. Citizens and Permanent Residents only.",
        "No visa sponsorship available.",
        "No H-1B for this role.",
        # Real JD body from Airbnb (China-only role)
        "THIS POSITION NEEDS TO BASED IN CHINA AND NOT PROVIDE VISA SPONSORSHIP.",
    ]
    for body in cases:
        result = extract("Software Engineer", body)
        assert result["sponsorship_signal"] == "unfriendly", f"{body!r}: got {result['sponsorship_signal']!r}"
    print(f"  ✓ sponsorship_unfriendly: {len(cases)} phrasings")


def test_sponsorship_friendly():
    cases = [
        "We sponsor work visas including H-1B.",
        "Visa sponsorship is available for qualified candidates.",
        "Open to visa sponsorship for the right candidate.",
        "We will sponsor your H-1B transfer.",
        "Sponsorship offered for international hires.",
        "We provide visa sponsorship.",
    ]
    for body in cases:
        result = extract("Software Engineer", body)
        assert result["sponsorship_signal"] == "friendly", f"{body!r}: got {result['sponsorship_signal']!r}"
    print(f"  ✓ sponsorship_friendly: {len(cases)} phrasings")


def test_sponsorship_unknown():
    """JDs that say nothing about sponsorship → empty signal."""
    body = (
        "We're hiring a Senior Software Engineer to join our infra team. "
        "You will design, build, and operate distributed systems at scale."
    )
    result = extract("Senior Software Engineer", body)
    assert result["sponsorship_signal"] == "", result
    print("  ✓ sponsorship_unknown: silent JD → empty")


def test_unfriendly_beats_friendly():
    """When BOTH friendly and unfriendly cues appear, unfriendly wins.
    Use case: 'We generally sponsor visas but not for this role.'"""
    body = (
        "We sponsor visas across the company. However, this specific role "
        "does not offer visa sponsorship at this time."
    )
    result = extract("Software Engineer", body)
    assert result["sponsorship_signal"] == "unfriendly", result
    print("  ✓ unfriendly beats friendly when both present")


def test_combined():
    """A real-ish full-text JD where every field should fire."""
    body = (
        "Senior Software Engineer — Infrastructure\n\n"
        "We're looking for a senior engineer with 5+ years of experience "
        "building distributed systems. Hybrid: 3 days a week in our NYC office.\n\n"
        "Sponsorship is available for qualified candidates."
    )
    result = extract(
        "Senior Software Engineer, Infrastructure",
        body,
        "New York, NY",
    )
    assert result == {
        "level": "senior",
        "years_min": 5,
        "work_type": "hybrid",
        "sponsorship_signal": "friendly",
    }, result
    print("  ✓ combined extract on full JD")


if __name__ == "__main__":
    print("test_level_from_title")
    test_level_from_title()
    print("test_level_from_body")
    test_level_from_body()
    print("test_years_min")
    test_years_min()
    print("test_years_min_picks_smallest")
    test_years_min_picks_smallest()
    print("test_work_type")
    test_work_type()
    print("test_sponsorship_unfriendly")
    test_sponsorship_unfriendly()
    print("test_sponsorship_friendly")
    test_sponsorship_friendly()
    print("test_sponsorship_unknown")
    test_sponsorship_unknown()
    print("test_unfriendly_beats_friendly")
    test_unfriendly_beats_friendly()
    print("test_combined")
    test_combined()
    print("\nALL TESTS PASSED")
