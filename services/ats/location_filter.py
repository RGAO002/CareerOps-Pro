"""
North America tech-hub location classifier.

Given a raw location string (and optionally a company HQ), bucket the job
into one of 13 NA tech hubs, plus Remote-US, Other-NA, or Other-International.

Tiers (priority order — first keyword match wins):

    nyc_metro      NYC five boroughs + close NJ commute + Long Island/Westchester
    bay_area       SF + Peninsula + South Bay + East Bay
    seattle        Seattle + Eastside (Bellevue, Redmond, Kirkland)
    boston         Boston + Cambridge + Somerville + 128-belt
    la_metro       LA County + OC tech (Irvine, Newport, Long Beach)
    dc_metro       DC + NoVA (Arlington, Reston, McLean) + suburban MD
    austin         Austin metro
    chicago        Chicago metro
    denver         Denver + Boulder
    atlanta        Atlanta metro
    toronto        Toronto + Mississauga + Markham (GTA)
    vancouver      Vancouver BC
    remote_us      Remote restricted to / based in the US
    other_na       NA but outside the 12 hubs (e.g. Phoenix, Salt Lake)
    other_intl     Outside North America (UK, EU, China, India, ...)
                   — surfaces explicitly so the UI can drop them on demand

Design decisions:
    - First-match-wins (rather than "all matches") because surfacing 4 tiers
      on a multi-city job (e.g. "SF; NYC; Austin") would explode the chip
      grid. The user can still find these jobs by matching any of their
      cities — the JD itself contains all locations.
    - Bare "Remote" (no country qualifier) maps to remote_us because that's
      ~95% of the case for our target audience. International remote is
      rare in the simplify pool.
    - is_nyc_metro is preserved as a boolean flag for backward compatibility
      with the existing /api/jobs/public browse endpoint that pre-dates this
      multi-hub refactor.
"""
from __future__ import annotations

import re
from typing import Optional

# ────────────────────────────────────────────────────────────────────
# Tier definitions
# ────────────────────────────────────────────────────────────────────

# Order matters — first match wins. Keywords are lowercase substrings;
# we lowercase the input before comparing, so they're case-insensitive.
NA_TIERS: list[tuple[str, list[str]]] = [
    ("nyc_metro", [
        # NYC core
        "new york city", "new york, ny", "ny, ny", "nyc",
        "manhattan", "brooklyn", "queens", "the bronx", "staten island",
        # Hudson commute
        "jersey city", "hoboken", "newark, nj", "weehawken",
        "edgewater, nj", "fort lee", "secaucus", "union city, nj",
        # Suburbs
        "long island", "nassau county", "suffolk county",
        "westchester", "white plains", "yonkers", "new rochelle",
        # Bare "new york" — last (so "New York City" already matched above)
        "new york",
    ]),
    ("bay_area", [
        "san francisco", "sf, ca", "south san francisco",
        "palo alto", "mountain view", "sunnyvale", "san jose",
        "santa clara", "cupertino", "menlo park", "redwood city",
        "san mateo", "fremont", "milpitas", "campbell, ca",
        "oakland", "berkeley, ca", "emeryville", "alameda",
        "foster city", "burlingame", "daly city", "hayward, ca",
    ]),
    ("seattle", [
        "seattle", "bellevue, wa", "redmond, wa", "kirkland, wa",
        "bothell, wa", "tacoma",
    ]),
    ("boston", [
        "boston", "cambridge, ma", "somerville, ma",
        "waltham", "burlington, ma", "lexington, ma",
        "newton, ma", "natick", "framingham",
    ]),
    ("la_metro", [
        "los angeles", " la, ca", "santa monica", "culver city",
        "el segundo", "venice, ca", "marina del rey",
        "pasadena", "burbank", "long beach",
        "irvine", "newport beach", "anaheim", "costa mesa",
    ]),
    ("dc_metro", [
        "washington, d.c.", "washington d.c.", "washington, dc",
        "arlington, va", "reston", "bethesda", "mclean",
        "alexandria, va", "tysons", "vienna, va", "herndon",
    ]),
    ("austin", [
        "austin, tx", "austin tx",
    ]),
    ("chicago", [
        "chicago",
    ]),
    ("denver", [
        "denver", "boulder, co", "broomfield",
    ]),
    ("atlanta", [
        "atlanta",
    ]),
    ("toronto", [
        "toronto", "mississauga", "markham, on", "vaughan",
        "north york", "scarborough, on",
    ]),
    ("vancouver", [
        "vancouver, bc", "vancouver, british columbia",
        "burnaby, bc", "richmond, bc",
    ]),
]

# Locations that signal "this is NOT North America" — surface as a
# distinct tier so the UI can default-hide them.
INTL_PATTERNS = [
    r"\b(?:united kingdom|, uk|england|london|manchester)\b",
    r"\b(?:germany|berlin|munich|frankfurt|hamburg)\b",
    r"\b(?:france|paris)\b",
    r"\b(?:netherlands|amsterdam|, nl)\b",
    r"\b(?:ireland|dublin)\b",
    r"\b(?:china|beijing|shanghai|shenzhen|guangzhou|hangzhou|chengdu)\b",
    r"\b(?:india|bangalore|bengaluru|mumbai|hyderabad|delhi|pune|chennai)\b",
    r"\b(?:singapore|sgp)\b",
    r"\bhong\s*kong\b",
    r"\b(?:australia|sydney|melbourne)\b",
    r"\b(?:japan|tokyo|osaka)\b",
    r"\b(?:south\s*korea|seoul)\b",
    r"\btaiwan\b",
    r"\b(?:brazil|sao\s*paulo|brasil)\b",
    r"\b(?:israel|tel\s*aviv)\b",
    r"\b(?:mexico|mexico\s*city|cdmx)\b",
    r"\b(?:spain|madrid|barcelona)\b",
    r"\b(?:italy|rome|milan)\b",
    r"\b(?:poland|warsaw|krakow)\b",
    r"\b(?:emea|apac)\b",
]

# Patterns that indicate "remote, US-based" — picked up only when no
# specific NA hub has matched.
REMOTE_US_PATTERNS = [
    r"\bremote\s*(?:-|,|\()?\s*us\b",
    r"\bus\s*remote\b",
    r"\bu\.?s\.?\s*remote\b",
    r"\bremote\s*\(\s*us\s*\)",
    r"\bremote\s+in\s+(?:the\s+)?us(?:a)?\b",
    r"\bremote\s*-\s*united\s+states\b",
    r"\banywhere\s+in\s+(?:the\s+)?us\b",
    r"\bremote\s*-\s*north\s+america\b",
]

# A bare "remote" with nothing else — treat as remote_us (most likely
# case for the simplify pool).
BARE_REMOTE_PATTERN = re.compile(r"\bremote\b", re.IGNORECASE)

# Compile intl + remote regexes.
_INTL_RE = [re.compile(p, re.IGNORECASE) for p in INTL_PATTERNS]
_REMOTE_RE = [re.compile(p, re.IGNORECASE) for p in REMOTE_US_PATTERNS]

# Short codes that need word-boundary detection (substring isn't enough).
# Run AFTER the keyword-list scan, so a more specific match like
# "san francisco" still wins. Comes BEFORE intl + remote.
SHORT_CODE_TIERS = [
    ("bay_area",  re.compile(r"\bsf\b", re.IGNORECASE)),
]


# Pre-build a flat lookup so classification is O(N keywords) per job.
def _scan_tiers(text_lower: str) -> Optional[str]:
    for tier_name, keywords in NA_TIERS:
        for kw in keywords:
            if kw in text_lower:
                return tier_name
    return None


def _looks_intl(text_lower: str) -> bool:
    return any(p.search(text_lower) for p in _INTL_RE)


def _looks_remote_us(text_lower: str) -> bool:
    return any(p.search(text_lower) for p in _REMOTE_RE)


# Lookup table for is_nyc_metro back-compat.
_NYC_METRO_TIER = "nyc_metro"


def classify_location(
    raw: str,
    company_hq_city: str = "",
    company_hq_state: str = "",
) -> dict:
    """Classify a raw location string into a NA tech-hub bucket.

    Returns:
        is_nyc_metro:  bool — True only for the nyc_metro tier (back-compat
                       for the legacy /api/jobs/public NYC-only mode).
        location_tier: one of the tier names listed in NA_TIERS, plus
                       'remote_us' | 'other_na' | 'other_intl' | ''
        city / state / country: best-guess strings (may be empty)

    Multi-location strings ("San Francisco, CA; New York, NY") get the
    first matching tier in priority order.
    """
    if raw is None:
        raw = ""
    text = raw.strip()

    result = {
        "is_nyc_metro": False,
        "location_tier": "",
        "city": "",
        "state": "",
        "country": "",
    }

    if not text:
        return result

    text_lower = text.lower()

    # 1. NA tier match (priority order, longest-keyword)
    tier = _scan_tiers(text_lower)
    if tier:
        result.update(
            location_tier=tier,
            is_nyc_metro=(tier == _NYC_METRO_TIER),
            country="US" if tier not in ("toronto", "vancouver") else "CA",
        )
        return result

    # 2. Short-code tier match (e.g. "SF" alone)
    for tier_name, regex in SHORT_CODE_TIERS:
        if regex.search(text_lower):
            result.update(
                location_tier=tier_name,
                is_nyc_metro=(tier_name == _NYC_METRO_TIER),
                country="US",
            )
            return result

    # 3. International (non-NA) — explicit so we can filter
    if _looks_intl(text_lower):
        result.update(location_tier="other_intl")
        return result

    # 4. Remote-US (specific)
    if _looks_remote_us(text_lower):
        result.update(location_tier="remote_us", country="US")
        return result

    # 5. Bare "remote" with no qualifier — default to remote_us. We've
    # already screened for non-NA via the INTL check above; if we're here,
    # the location string had no foreign-country signal, so treating it as
    # US-remote is the right default for our target audience.
    if BARE_REMOTE_PATTERN.search(text_lower):
        result.update(location_tier="remote_us", country="US")
        return result

    # 6. Default: NA but not in our hub list (e.g. Phoenix, Salt Lake,
    # Pittsburgh, Raleigh-Durham, etc.).
    result.update(location_tier="other_na")
    return result


# Public list of tiers (UI helper) — used by the frontend's chip filter
# to know what location_tier values the matcher might return.
ALL_TIERS = (
    "nyc_metro", "bay_area", "seattle", "boston", "la_metro",
    "dc_metro", "austin", "chicago", "denver", "atlanta",
    "toronto", "vancouver",
    "remote_us", "other_na", "other_intl",
)
