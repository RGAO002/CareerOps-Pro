"""
Humanizer Service - Undetectable.ai API integration
Humanizes AI-generated resume text to bypass AI detection tools.

Strategy: Submit each text block (summary, experience bullets, project bullets)
as a separate API call. This avoids delimiter-mangling issues where the API
rewrites structural markers along with the content.
"""
import os
import re
import copy
import time
import requests


BASE_URL = "https://humanize.undetectable.ai"

# Minimum character count for API submission
MIN_CHARS = 50


def check_credits(api_key: str) -> dict:
    """
    Check remaining Undetectable.ai credits.
    Returns dict with base_credits, boost_credits, credits (total).
    """
    response = requests.get(
        f"{BASE_URL}/check-user-credits",
        headers={"apikey": api_key},
        timeout=10
    )
    response.raise_for_status()
    return response.json()


def submit_for_humanization(api_key: str, text: str, settings: dict) -> str:
    """
    Submit text to Undetectable.ai for humanization.
    Returns document ID for polling.
    """
    if not api_key:
        raise ValueError("Undetectable.ai API key is missing.")

    payload = {
        "content": text,
        "readability": settings.get("readability", "University"),
        "purpose": settings.get("purpose", "General Writing"),
        "strength": settings.get("strength", "More Human"),
        "model": settings.get("model", "v11"),
    }

    response = requests.post(
        f"{BASE_URL}/submit",
        headers={"apikey": api_key},
        json=payload,
        timeout=30
    )

    if response.status_code != 200:
        try:
            detail = response.json()
        except Exception:
            detail = response.text
        raise Exception(f"Undetectable.ai submit failed ({response.status_code}): {detail}")

    data = response.json()
    doc_id = data.get("id")
    if not doc_id:
        raise Exception(f"Submit failed - no document ID returned: {data}")

    return doc_id


def poll_for_result(api_key: str, doc_id: str, max_attempts: int = 60, interval: int = 5) -> str:
    """
    Poll for humanization result until ready.
    Returns the humanized text string.
    """
    for attempt in range(1, max_attempts + 1):
        response = requests.post(
            f"{BASE_URL}/document",
            headers={"apikey": api_key},
            json={"id": doc_id},
            timeout=15
        )

        if response.status_code != 200:
            try:
                detail = response.json()
            except Exception:
                detail = response.text
            raise Exception(f"Poll failed ({response.status_code}): {detail}")

        data = response.json()
        output = data.get("output")
        if output:
            return output

        time.sleep(interval)

    raise TimeoutError(
        f"Humanization not ready after {max_attempts * interval}s (doc_id: {doc_id})"
    )


def _collect_text_blocks(resume_data: dict, sections: list) -> list:
    """
    Collect text blocks to humanize from resume data.
    Returns list of dicts: [{"addr": "summary", "text": "..."}, ...]

    Bullets that are too short (<50 chars) are grouped with adjacent bullets
    from the same entry to meet the API minimum.
    """
    blocks = []

    # Summary — always a single block
    if "summary" in sections:
        summary = (resume_data.get("summary") or "").strip()
        if len(summary) >= MIN_CHARS:
            blocks.append({"addr": "summary", "text": summary})

    # Experience — group all bullets of each entry into one block
    if "experience" in sections:
        for i, exp in enumerate(resume_data.get("experience", [])):
            bullets = exp.get("bullets", [])
            if not bullets:
                continue
            # Concatenate all bullets with newline separator
            combined = "\n".join(b.strip() for b in bullets if b.strip())
            if len(combined) >= MIN_CHARS:
                blocks.append({
                    "addr": f"experience[{i}]",
                    "text": combined,
                    "bullet_count": len([b for b in bullets if b.strip()])
                })

    # Projects — group all bullets of each entry into one block
    if "projects" in sections:
        for i, proj in enumerate(resume_data.get("projects", [])):
            bullets = proj.get("bullets", [])
            if not bullets:
                continue
            combined = "\n".join(b.strip() for b in bullets if b.strip())
            if len(combined) >= MIN_CHARS:
                blocks.append({
                    "addr": f"projects[{i}]",
                    "text": combined,
                    "bullet_count": len([b for b in bullets if b.strip()])
                })

    return blocks


def _apply_block(resume_data: dict, addr: str, humanized_text: str, original_bullet_count: int = 0) -> list:
    """
    Apply a humanized text block back to resume data.
    Returns list of warnings.
    """
    warnings = []

    if addr == "summary":
        resume_data["summary"] = humanized_text.strip()
        return warnings

    # Parse "experience[0]" or "projects[1]"
    match = re.match(r"(\w+)\[(\d+)\]", addr)
    if not match:
        warnings.append(f"Unrecognized address: {addr}")
        return warnings

    section = match.group(1)
    idx = int(match.group(2))

    try:
        entry = resume_data[section][idx]
    except (IndexError, KeyError):
        warnings.append(f"Entry not found: {addr}")
        return warnings

    # Split humanized text back into individual bullets
    humanized_lines = [line.strip() for line in humanized_text.strip().split("\n") if line.strip()]

    original_bullets = [b for b in entry.get("bullets", []) if b.strip()]

    if len(humanized_lines) == len(original_bullets):
        # Perfect match — map 1:1
        entry["bullets"] = humanized_lines
    elif len(humanized_lines) > 0:
        # Line count mismatch — still use what we got
        entry["bullets"] = humanized_lines
        if len(humanized_lines) != len(original_bullets):
            warnings.append(
                f"{addr}: bullet count changed ({len(original_bullets)} → {len(humanized_lines)})"
            )
    else:
        warnings.append(f"{addr}: API returned empty text, keeping original")

    return warnings


def humanize_text(api_key: str, text: str, settings: dict, progress_callback=None) -> str:
    """
    Humanize a plain text string (no structural mapping needed).
    Used for cover letters and other free-form text.

    Args:
        api_key: Undetectable.ai API key
        text: Plain text to humanize
        settings: {readability, purpose, strength, model}
        progress_callback: optional callable(stage, detail)

    Returns:
        Humanized text string
    """
    if not text or len(text.strip()) < MIN_CHARS:
        raise ValueError(f"Text too short to humanize (minimum {MIN_CHARS} characters).")

    word_count = len(text.split())

    if progress_callback:
        progress_callback("check", f"~{word_count} words. Checking credits...")

    # Check credits
    try:
        credits_info = check_credits(api_key)
        available = credits_info.get("credits", 0)
        if word_count > available:
            raise ValueError(
                f"Insufficient credits: need ~{word_count} words but only {available} credits remaining. "
                f"Try shortening the text or upgrade at undetectable.ai/pricing"
            )
        if progress_callback:
            progress_callback("check", f"Credits OK ({available} available, ~{word_count} needed)")
    except ValueError:
        raise
    except Exception:
        pass  # If credit check fails, still try

    if progress_callback:
        progress_callback("submit", "Submitting text for humanization...")

    doc_id = submit_for_humanization(api_key, text, settings)

    if progress_callback:
        progress_callback("poll", "Waiting for result...")

    result = poll_for_result(api_key, doc_id)

    if progress_callback:
        progress_callback("done", "Humanization complete!")

    return result


def humanize_resume(api_key: str, resume_data: dict, sections: list, settings: dict, progress_callback=None) -> tuple:
    """
    Humanize resume text by submitting each section separately to Undetectable.ai.

    Each text block (summary, experience entry bullets, project entry bullets) is
    submitted as a separate API call to avoid delimiter-mangling issues.

    Args:
        api_key: Undetectable.ai API key
        resume_data: Full resume data dict
        sections: Sections to humanize ("summary", "experience", "projects")
        settings: {readability, purpose, strength, model}
        progress_callback: optional callable(stage, detail) for UI updates

    Returns:
        (updated_resume_data, warnings) or raises on failure
    """
    updated = copy.deepcopy(resume_data)
    all_warnings = []

    if progress_callback:
        progress_callback("build", "Collecting text blocks...")

    blocks = _collect_text_blocks(updated, sections)

    if not blocks:
        raise ValueError("No text content found to humanize.")

    # Estimate total word count
    total_words = sum(len(b["text"].split()) for b in blocks)

    if progress_callback:
        progress_callback("check", f"Found {len(blocks)} blocks (~{total_words} words). Checking credits...")

    # Check credits
    try:
        credits_info = check_credits(api_key)
        available = credits_info.get("credits", 0)
        if total_words > available:
            raise ValueError(
                f"Insufficient credits: need ~{total_words} words but only {available} credits remaining. "
                f"Try selecting fewer sections or upgrade at undetectable.ai/pricing"
            )
        if progress_callback:
            progress_callback("check", f"Credits OK ({available} available, ~{total_words} needed)")
    except ValueError:
        raise
    except Exception:
        pass  # If credit check fails, still try

    # Submit all blocks
    doc_ids = []
    for i, block in enumerate(blocks):
        if progress_callback:
            progress_callback("submit", f"Submitting {block['addr']}... ({i+1}/{len(blocks)})")

        try:
            doc_id = submit_for_humanization(api_key, block["text"], settings)
            doc_ids.append((i, doc_id))
        except Exception as e:
            all_warnings.append(f"Failed to submit {block['addr']}: {e}")

    if not doc_ids:
        raise Exception("All submissions failed. Check your API key and credits.")

    # Poll for all results
    if progress_callback:
        progress_callback("poll", f"Waiting for {len(doc_ids)} results...")

    for idx, (block_idx, doc_id) in enumerate(doc_ids):
        block = blocks[block_idx]
        if progress_callback:
            progress_callback("poll", f"Waiting for {block['addr']}... ({idx+1}/{len(doc_ids)})")

        try:
            humanized_text = poll_for_result(api_key, doc_id)

            # Apply result back to resume data
            block_warnings = _apply_block(
                updated,
                block["addr"],
                humanized_text,
                block.get("bullet_count", 0)
            )
            all_warnings.extend(block_warnings)

        except Exception as e:
            all_warnings.append(f"Failed to get result for {block['addr']}: {e}")

    if progress_callback:
        progress_callback("done", "Humanization complete!")

    return updated, all_warnings
