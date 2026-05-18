"""
Validate role_filter against real titles sampled from the production DB.

These tests double as the source of truth for the keep/drop policy: every time
we touch the keyword lists, run this and verify all assertions still hold.

Test cases are hand-curated from a SELECT title FROM job_listings sample +
known edge cases (sales engineer, TPM, etc.).
"""
from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from services.ingestion.role_filter import evaluate  # noqa: E402


KEEP_CASES = [
    # Vanilla software
    ("Software Engineer, Backend",                       "Engineering"),
    ("Senior Software Engineer, Server Networking Security (Rust)", "Software Engineering"),
    ("Staff Software Engineer, Data Engineering",        "Engineering"),
    ("Hello Warsaw! Join the Founding Engineering Team at Peloton", "Engineering"),
    # Data
    ("Data Scientist II",                                "Analytics"),
    ("Senior Machine Learning Engineer",                 "AI Research"),
    ("Research Scientist, Interpretability",             "AI Research & Engineering"),
    # Product / Design
    ("Senior Product Designer, Storefront, Retention & Growth", "Design"),
    ("Lead Product Manager, Onsite Performance",         "Product"),
    ("Technical Program Manager, AI & Automation",       "Engineering"),
    ("Engineering Program Manager, AI",                  "Engineering"),
    # Hardware / niche
    ("Firmware Engineer, Drivetrain",                    "Hardware"),
    # Generic catch-all
    ("Senior Engineer, Quality Platform",                "Engineering"),
    # Department with numeric prefix should normalize and pass through
    ("Engineering Manager, Quality Platform",            "341 Executive Engineering"),
]

DROP_CASES = [
    # Sales (the worst pollutant in current DB)
    ("Sales Development Representative",                          "Sales"),
    ("Account Executive, West US - Digital Natives",              "Sales"),
    ("Manager, Commercial Sales Engineering (Sao Paulo)",         "Sales"),
    ("Head of Enterprise Sales - India",                          "Enterprise Sales"),
    ("Retention Sales Development Representative II",             "Sales"),
    # GTM-adjacent sales engineering — "engineering" in title but still sales
    ("Senior Sales Enablement Specialist (Post Sale), In-Store",  "Sales"),
    # Customer success / support
    ("Supervisor, Customer Success Team (Onsite)",                "Community Support"),
    # Healthcare clinical
    ("NP/PA - Oscar Primary Care (Bilingual)",                    "Insurance Operations"),
    ("Nurse Practitioner - Virtual Health Assessment (Bilingual-Spanish)", "Insurance Operations"),
    ("Bilingual (Spanish) Physician Assistant - Virtual Health Assessment (1099)", "Insurance Operations"),
    # Marketing
    ("Director, Global Marketing Measurement Strategy",           "Marketing"),
    ("Social Media Manager, Social Reputation",                   "Marketing"),
    # Finance / strategy
    ("Senior Strategy & Planning Manager",                        "Finance"),
    ("Product Pricing & Monetization Strategy Senior Analyst",    "Finance"),
    ("Senior Corporate Development Lead, AI",                     "Finance"),
    # HR / People
    ("Applications Engineer, Full Stack - People",                "People"),  # dept-drop
    # Insurance ops / clinical-coded
    ("Associate, Network Contracting - Florida",                  "Insurance Operations"),
    ("Associate, Operational Controls",                           "Operations"),
    # GTM strategy
    ("GTM Strategy & Operations Senior Associate - Sales Development & AI", "Operations"),
    # Solutions / pre-sales engineering
    ("Solutions Engineer, Enterprise",                            "Sales"),
    # Pure ops dept catch
    ("Manager, Order Fulfillment",                                "112 Order Fulfillment"),
]


def _check(cases, expected_keep: bool, label: str):
    failures = []
    for title, dept in cases:
        keep, reason = evaluate(title, dept)
        if keep != expected_keep:
            failures.append((title, dept, keep, reason))
    if failures:
        print(f"  ✗ {label}: {len(failures)} failures:")
        for t, d, k, r in failures:
            print(f"     [{r}] keep={k}  title={t!r}  dept={d!r}")
        return False
    print(f"  ✓ {label}: {len(cases)} cases")
    return True


def test_keep_cases():
    assert _check(KEEP_CASES, expected_keep=True, label="KEEP cases")


def test_drop_cases():
    assert _check(DROP_CASES, expected_keep=False, label="DROP cases")


def test_explicit_reasons():
    """Spot-check that reason strings carry the matched keyword for audit."""
    keep, reason = evaluate("Sales Engineer, EMEA", "Sales")
    # Either "sales" or "sales engineer" can fire first; both are correct drops.
    assert not keep and "sales" in reason, reason

    keep, reason = evaluate("Senior Software Engineer", "Engineering")
    assert keep and "title-keep" in reason, reason

    keep, reason = evaluate("Some Random Hairdresser", "Operations")
    assert not keep and ("dept-drop:operations" in reason or "no-match" in reason), reason

    print("  ✓ reason strings expose matched keyword")


if __name__ == "__main__":
    print("test_keep_cases")
    test_keep_cases()
    print("test_drop_cases")
    test_drop_cases()
    print("test_explicit_reasons")
    test_explicit_reasons()
    print("\nALL TESTS PASSED")
