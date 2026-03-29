"""
Company Lookup Service — Wikipedia API with LLM fallback.

Fetches basic company info (industry, founded, HQ, employees, description)
for the AI Co-Pilot panel in the Editor page.
"""
import logging
import re
import requests
from typing import Optional

from langchain_core.messages import SystemMessage
from services.llm import get_llm, clean_json

logger = logging.getLogger(__name__)

WIKI_SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/{}"
WIKI_PARSE_URL = "https://en.wikipedia.org/w/api.php"
REQUEST_TIMEOUT = 8


def lookup_company_info(
    company_name: str,
    jd_text: str = "",
    model: str = "",
    api_key: str = "",
) -> Optional[dict]:
    """Main entry: return company info dict or None.

    Tries Wikipedia first, falls back to LLM if configured.
    """
    if not company_name or not company_name.strip():
        return None

    company_name = company_name.strip()

    # 1. Try Wikipedia
    info = _fetch_wikipedia(company_name)
    if info:
        return info

    # 2. LLM fallback (only if credentials available)
    if model and api_key:
        info = _lookup_via_llm(company_name, jd_text, model, api_key)
        if info:
            return info

    return None


def _fetch_wikipedia(company_name: str) -> Optional[dict]:
    """Fetch company info from Wikipedia REST API + infobox parse."""
    # Try common suffixes for tech companies
    candidates = [
        company_name,
        f"{company_name} (company)",
        f"{company_name} Inc.",
    ]

    for title in candidates:
        try:
            resp = requests.get(
                WIKI_SUMMARY_URL.format(title.replace(" ", "_")),
                timeout=REQUEST_TIMEOUT,
                headers={"User-Agent": "CareerOps-Pro/1.0"},
            )
            if resp.status_code != 200:
                continue

            data = resp.json()

            # Must be about an organization, not a disambiguation page
            if data.get("type") == "disambiguation":
                continue

            description = data.get("extract", "")
            if not description:
                continue

            # Try to get structured infobox data
            infobox = _fetch_infobox(data.get("title", title))

            # Use first sentence as short description
            short_desc = description.split(". ")[0] + "." if ". " in description else description
            if len(short_desc) > 200:
                short_desc = short_desc[:197] + "..."

            # Extract official website from content_urls or infobox
            website = infobox.get("website", "")
            if not website:
                # Wikipedia summary sometimes has the canonical URL
                wiki_url = data.get("content_urls", {}).get("desktop", {}).get("page", "")
                if wiki_url:
                    website = wiki_url  # fallback: link to Wikipedia page

            return {
                "industry": infobox.get("industry", ""),
                "founded": infobox.get("founded", ""),
                "headquarters": infobox.get("headquarters", ""),
                "employees": infobox.get("employees", ""),
                "website": website,
                "description": short_desc,
                "source": "wikipedia",
            }

        except (requests.RequestException, ValueError, KeyError) as e:
            logger.debug(f"Wikipedia lookup failed for '{title}': {e}")
            continue

    return None


def _fetch_infobox(page_title: str) -> dict:
    """Parse Wikipedia infobox for structured company data."""
    result = {}
    try:
        resp = requests.get(
            WIKI_PARSE_URL,
            params={
                "action": "parse",
                "page": page_title,
                "prop": "wikitext",
                "section": 0,
                "format": "json",
            },
            timeout=REQUEST_TIMEOUT,
            headers={"User-Agent": "CareerOps-Pro/1.0"},
        )
        if resp.status_code != 200:
            return result

        wikitext = resp.json().get("parse", {}).get("wikitext", {}).get("*", "")
        if not wikitext:
            return result

        # Extract key fields from infobox wikitext
        field_map = {
            "industry": r"\|\s*industry\s*=\s*(.+)",
            "founded": r"\|\s*(?:founded|foundation)\s*=\s*(.+)",
            "headquarters": r"\|\s*(?:headquarters|hq_location_city|location_city|location)\s*=\s*(.+)",
            "employees": r"\|\s*(?:num_employees|employees)\s*=\s*(.+)",
            "website": r"\|\s*(?:website|url|homepage)\s*=\s*(.+)",
        }

        for field, pattern in field_map.items():
            match = re.search(pattern, wikitext, re.IGNORECASE)
            if match:
                value = _clean_wikitext(match.group(1).strip())
                if value:
                    result[field] = value

    except (requests.RequestException, ValueError, KeyError) as e:
        logger.debug(f"Infobox parse failed for '{page_title}': {e}")

    return result


def _clean_wikitext(text: str) -> str:
    """Remove wiki markup from a field value."""
    # Remove [[link|display]] → display, [[link]] → link
    text = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", text)
    # Remove {{plainlist|...}} and similar templates — keep inner text
    text = re.sub(r"\{\{(?:plainlist|flatlist|unbulleted list)\s*\|", "", text, flags=re.IGNORECASE)
    # Handle {{URL|example.com}} → example.com
    text = re.sub(r"\{\{(?:URL|url)\|([^}|]+)(?:\|[^}]*)?\}\}", r"\1", text, flags=re.IGNORECASE)
    # Remove remaining {{ }} templates but keep simple ones like {{circa|2010}}
    text = re.sub(r"\{\{(?:circa|c\.?)\|(\d{4})\}\}", r"~\1", text, flags=re.IGNORECASE)
    text = re.sub(r"\{\{[^}]*\}\}", "", text)
    # Remove HTML tags
    text = re.sub(r"<[^>]+>", "", text)
    # Remove ref tags and their content
    text = re.sub(r"<ref[^>]*>.*?</ref>", "", text, flags=re.DOTALL)
    text = re.sub(r"<ref[^/]*/?>", "", text)
    # Clean up whitespace and trailing markup
    text = re.sub(r"\s+", " ", text).strip()
    text = text.rstrip("|}")
    return text


def _lookup_via_llm(
    company_name: str, jd_text: str, model: str, api_key: str
) -> Optional[dict]:
    """LLM fallback: generate company info from JD context.

    Constrained prompt to only output facts it's confident about.
    """
    jd_snippet = jd_text[:1500] if jd_text else ""

    prompt = f"""You are a factual company research assistant. Given a company name and job description context, provide basic company information.

COMPANY: {company_name}

JOB DESCRIPTION CONTEXT:
{jd_snippet}

Return a JSON object with ONLY information you are confident about. For anything uncertain, use an empty string "".

{{
    "industry": "e.g. Fintech, SaaS, E-commerce, Healthcare Tech, etc.",
    "founded": "e.g. 2010 (year only, or empty if unknown)",
    "headquarters": "e.g. San Francisco, CA (city, state/country)",
    "employees": "e.g. 500+, 1,000-5,000 (approximate range, or empty if unknown)",
    "website": "e.g. https://stripe.com (official website URL, or empty if unknown)",
    "description": "One sentence describing what the company does. Max 150 chars."
}}

RULES:
- Only include facts you are highly confident about
- If unsure about ANY field, use "" (empty string)
- Do NOT fabricate or guess — accuracy matters more than completeness
- The description should be factual, not marketing language
- Return ONLY valid JSON"""

    try:
        llm = get_llm(model, api_key)
        res = llm.invoke([SystemMessage(content=prompt)])
        info = clean_json(res.content)

        # Validate: must have at least a description
        if not info.get("description"):
            return None

        info["source"] = "ai"
        return info

    except Exception as e:
        logger.debug(f"LLM company lookup failed for '{company_name}': {e}")
        return None
