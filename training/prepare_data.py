"""
DPO Training Data Preparation

Runs locally (CPU only, no GPU needed).

Steps:
  1. Download resume_seven_class dataset (78k human-written resume sentences)
  2. Filter for experience/project bullets (most useful for humanizer)
  3. Send each human bullet to an LLM → get an "AI-polished" version
  4. Save pairs as JSONL for DPO training:
       {"prompt": "...", "chosen": human_version, "rejected": ai_version}

Usage:
  pip install datasets openai tqdm
  python prepare_data.py --together-key sk-xxx --num-samples 2000
"""

from __future__ import annotations

import argparse
import json
import random
import time
import logging
from pathlib import Path
from typing import Optional

from datasets import load_dataset
from openai import OpenAI
from tqdm import tqdm

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger(__name__)

# ── Prompt to make human text sound "AI-polished" ──────────────
# We reverse the usual direction: human → AI, so we can train AI → human
AI_POLISH_SYSTEM = """You are a professional resume writer who uses sophisticated,
polished language. Rewrite the following resume bullet point to sound more
professional and impressive. Use strong action verbs, quantify achievements
where possible, and employ business terminology.

Rules:
- Keep the same core meaning and facts
- Make it sound polished and professional
- Use words like: spearheaded, leveraged, orchestrated, implemented,
  comprehensive, robust, streamlined, cross-functional, stakeholders
- Add connecting phrases like: resulting in, leading to, which enabled
- Make sentences longer and more complex with subordinate clauses
- Output ONLY the rewritten bullet, nothing else"""

# Categories from resume_seven_class that contain actual resume bullets
USEFUL_CATEGORIES = {
    "experience",
    "project",
    "summary",
    "knowledge",  # sometimes has descriptive sentences
}


def download_dataset() -> list[dict]:
    """Download resume_seven_class from HuggingFace."""
    logger.info("Downloading resume_seven_class dataset...")
    ds = load_dataset("ganchengguang/resume_seven_class", split="train")
    logger.info(f"Downloaded {len(ds)} rows")
    return list(ds)


def filter_useful_sentences(rows: list[dict], min_words: int = 8, max_words: int = 60) -> list[str]:
    """
    Extract sentences that look like resume bullets.
    Filter by category, length, and basic quality.
    """
    sentences = []
    seen = set()

    for row in rows:
        text = row.get("text", "").strip()
        if not text:
            continue

        # Dataset format: "Category\tContent" — extract content and category
        if "\t" in text:
            parts = text.split("\t", 1)
            category = parts[0].strip().lower()
            text = parts[1].strip() if len(parts) > 1 else text
            # Only keep experience, project, summary sentences
            if category not in ("exp", "sum", "pro", "kno",
                                "experience", "summary", "project", "knowledge"):
                continue

        # Basic quality filters
        words = text.split()
        if len(words) < min_words or len(words) > max_words:
            continue

        # Skip if it's just a header/title (all caps, no verb-like structure)
        if text.isupper() and len(words) < 5:
            continue

        # Skip duplicates
        normalized = text.lower().strip()
        if normalized in seen:
            continue
        seen.add(normalized)

        # Skip lines that are clearly not sentences
        # (phone numbers, emails, addresses, just names)
        if "@" in text or text.startswith("http"):
            continue
        if all(c.isdigit() or c in "()-+ " for c in text):
            continue

        sentences.append(text)

    logger.info(f"Filtered to {len(sentences)} useful sentences")
    return sentences


def generate_ai_version(client: OpenAI, human_text: str, model: str) -> str | None:
    """Send a human-written bullet to LLM, get back an AI-polished version."""
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": AI_POLISH_SYSTEM},
                {"role": "user", "content": human_text},
            ],
            max_tokens=256,
            temperature=0.7,
        )
        ai_text = response.choices[0].message.content.strip()

        # Basic validation
        if not ai_text or len(ai_text) < 10:
            return None
        # Remove quotes if the model wrapped the output
        if ai_text.startswith('"') and ai_text.endswith('"'):
            ai_text = ai_text[1:-1]

        return ai_text
    except Exception as e:
        logger.warning(f"API error: {e}")
        return None


def build_dpo_pairs(
    human_sentences: list[str],
    client: OpenAI,
    model: str,
    num_samples: int,
    output_path: Path,
    batch_delay: float = 0.1,
):
    """
    Generate DPO training pairs and save incrementally to JSONL.

    Each pair:
      prompt:   "Rewrite this text to sound natural and human-written:\n{ai_text}"
      chosen:   human_text  (what we want the model to learn)
      rejected: ai_text     (what we want to avoid)
    """
    # Randomly sample if we have more sentences than needed
    if len(human_sentences) > num_samples:
        selected = random.sample(human_sentences, num_samples)
    else:
        selected = human_sentences
        logger.warning(
            f"Only {len(selected)} sentences available, "
            f"requested {num_samples}"
        )

    logger.info(f"Generating {len(selected)} DPO pairs...")

    success = 0
    errors = 0

    with open(output_path, "w") as f:
        for i, human_text in enumerate(tqdm(selected, desc="Generating pairs")):
            ai_text = generate_ai_version(client, human_text, model)

            if ai_text is None:
                errors += 1
                continue

            # Skip if AI version is too similar (model didn't change much)
            if ai_text.lower().strip() == human_text.lower().strip():
                errors += 1
                continue

            pair = {
                "prompt": f"Rewrite this text to sound natural and human-written:\n{ai_text}",
                "chosen": human_text,
                "rejected": ai_text,
            }

            f.write(json.dumps(pair, ensure_ascii=False) + "\n")
            success += 1

            # Rate limiting
            if batch_delay > 0:
                time.sleep(batch_delay)

            # Progress logging every 100
            if (i + 1) % 100 == 0:
                logger.info(f"Progress: {i+1}/{len(selected)}, success={success}, errors={errors}")

    logger.info(f"Done! {success} pairs saved to {output_path} ({errors} errors)")
    return success


def main():
    parser = argparse.ArgumentParser(description="Prepare DPO training data")
    parser.add_argument(
        "--together-key", required=True,
        help="Together AI API key"
    )
    parser.add_argument(
        "--model", default="Qwen/Qwen2.5-7B-Instruct-Turbo",
        help="Model to use for generating AI versions"
    )
    parser.add_argument(
        "--num-samples", type=int, default=2000,
        help="Number of training pairs to generate"
    )
    parser.add_argument(
        "--output", default="training/dpo_data.jsonl",
        help="Output JSONL file path"
    )
    parser.add_argument(
        "--min-words", type=int, default=8,
        help="Minimum words per sentence"
    )
    parser.add_argument(
        "--max-words", type=int, default=60,
        help="Maximum words per sentence"
    )
    parser.add_argument(
        "--delay", type=float, default=0.1,
        help="Delay between API calls (seconds)"
    )
    args = parser.parse_args()

    # 1. Download dataset
    rows = download_dataset()

    # 2. Filter useful sentences
    sentences = filter_useful_sentences(
        rows,
        min_words=args.min_words,
        max_words=args.max_words,
    )

    if not sentences:
        logger.error("No usable sentences found!")
        return

    logger.info(f"Sample sentences:")
    for s in random.sample(sentences, min(5, len(sentences))):
        logger.info(f"  → {s}")

    # 3. Generate AI versions and build DPO pairs
    client = OpenAI(
        api_key=args.together_key,
        base_url="https://api.together.xyz/v1",
    )

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    count = build_dpo_pairs(
        human_sentences=sentences,
        client=client,
        model=args.model,
        num_samples=args.num_samples,
        output_path=output_path,
        batch_delay=args.delay,
    )

    # 4. Print stats
    logger.info(f"\n{'='*50}")
    logger.info(f"Training data ready!")
    logger.info(f"  File: {output_path}")
    logger.info(f"  Pairs: {count}")
    logger.info(f"  Format: JSONL (DPO)")
    logger.info(f"{'='*50}")
    logger.info(f"\nNext step: upload to Google Colab and run train_dpo.py")


if __name__ == "__main__":
    main()
