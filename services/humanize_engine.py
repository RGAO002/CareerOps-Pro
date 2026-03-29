"""
AI Text Humanizer Engine

Two modes:
  1. Rule-based perturbation (no LLM) — swap 2-4 AI-telltale words per sentence
     using a static synonym table + Python random. Fast, free, deterministic randomness.
  2. Cross-model paraphrase (LLM) — rewrite via Together AI (Mistral/LLaMA/Qwen).
     Proven less effective at fooling detectors but kept for comparison.

Pipeline:
  1. Split text into sentences
  2. Score each sentence for "AI-likeness" (heuristics, display only)
  3. Perturb (rule-based) or Rewrite (LLM) all sentences
"""
import re
import random
import statistics
import logging
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

logger = logging.getLogger(__name__)


# ── AI-telltale vocabulary (for display scoring only) ──────────
AI_POWER_VERBS = {
    "spearheaded", "leveraged", "utilized", "orchestrated", "pioneered",
    "facilitated", "streamlined", "optimized", "architected", "championed",
    "devised", "cultivated", "galvanized", "synthesized", "conceptualized",
}

AI_FILLER_WORDS = {
    "comprehensive", "cutting-edge", "robust", "innovative", "meticulous",
    "multifaceted", "holistic", "state-of-the-art", "synergy", "paradigm",
    "endeavor", "delve", "foster", "harness", "realm", "landscape",
    "cornerstone", "pivotal", "instrumental", "transformative",
}

AI_VOCABULARY = AI_POWER_VERBS | AI_FILLER_WORDS

# ── Patterns ───────────────────────────────────────────────────
VAGUE_METRIC_RE = re.compile(
    r"\b(improv|reduc|increas|enhanc|boost|achiev)\w*\s.{0,30}\b\d+\s*%",
    re.IGNORECASE,
)

POWER_VERB_START_RE = re.compile(
    r"^(Led|Developed|Implemented|Designed|Built|Created|Managed|Directed|"
    r"Established|Executed|Delivered|Drove|Spearheaded|Leveraged|Utilized|"
    r"Orchestrated|Pioneered|Facilitated|Streamlined|Optimized|Architected|"
    r"Engineered|Automated|Deployed|Integrated|Maintained|Coordinated|"
    r"Oversaw|Initiated|Launched|Transformed|Revamped|Modernized)\b",
)

RESULT_BRIDGE_RE = re.compile(
    r"\b(resulting in|leading to|which led to|contributing to|enabling)\b",
    re.IGNORECASE,
)


# ── Sentence splitting ────────────────────────────────────────
def split_sentences(text: str) -> list[str]:
    """Split text into sentences. Handles bullet-point lists and paragraphs."""
    lines = [l.strip() for l in text.strip().split("\n") if l.strip()]
    sentences = []
    for line in lines:
        clean = re.sub(r"^[\-\*\•\d+\.]\s*", "", line).strip()
        if clean:
            sentences.append(clean)
    return sentences


# ── Per-sentence scoring (display only, does NOT gate rewrites) ─
def score_sentence(sentence: str) -> dict:
    """
    Score a single sentence for AI-likeness (heuristic, display only).
    Returns {"score": 0-10, "flags": ["reason1", ...]}
    """
    score = 0
    flags = []
    words = sentence.lower().split()

    if POWER_VERB_START_RE.match(sentence):
        score += 2
        flags.append("power_verb_start")

    ai_hits = [w.strip(".,;:") for w in words if w.strip(".,;:") in AI_VOCABULARY]
    if ai_hits:
        score += min(len(ai_hits) * 1.5, 4)
        flags.append(f"ai_vocab: {', '.join(ai_hits[:3])}")

    if VAGUE_METRIC_RE.search(sentence):
        score += 1.5
        flags.append("vague_metric")

    if RESULT_BRIDGE_RE.search(sentence):
        score += 1
        flags.append("result_bridge")

    if len(words) > 25:
        score += 1
        flags.append("long_sentence")

    if sentence.count(",") >= 3:
        score += 1
        flags.append("over_structured")

    return {"score": round(min(score, 10), 1), "flags": flags}


# ── Full text analysis (display only) ─────────────────────────
def analyze_text(text: str) -> dict:
    """Analyze full text. Returns per-sentence scores + structural signals."""
    sentences = split_sentences(text)
    if not sentences:
        return {"sentences": [], "structural": {}, "overall_score": 0}

    results = []
    for i, s in enumerate(sentences):
        info = score_sentence(s)
        info["index"] = i
        info["text"] = s
        results.append(info)

    structural = {}

    first_words = [s.split()[0].lower() if s.split() else "" for s in sentences]
    unique_ratio = len(set(first_words)) / len(first_words) if first_words else 1
    if unique_ratio < 0.6:
        structural["repetitive_starts"] = {
            "detail": f"{len(first_words) - len(set(first_words))} repeated openers",
            "severity": "high",
        }
        seen = set()
        for r in results:
            fw = r["text"].split()[0].lower() if r["text"].split() else ""
            if fw in seen:
                r["score"] = min(r["score"] + 1.5, 10)
                if "repeated_start" not in r["flags"]:
                    r["flags"].append("repeated_start")
            seen.add(fw)

    lengths = [len(s.split()) for s in sentences]
    if len(lengths) >= 3:
        var = statistics.variance(lengths)
        if var < 10:
            structural["uniform_length"] = {
                "detail": f"Sentence lengths too uniform (var={var:.1f})",
                "severity": "medium",
            }

    avg_score = statistics.mean([r["score"] for r in results]) if results else 0

    return {
        "sentences": results,
        "structural": structural,
        "overall_score": round(avg_score, 1),
        "total": len(results),
        "flagged": sum(1 for r in results if r["score"] >= 3),
    }


# ══════════════════════════════════════════════════════════════
# RULE-BASED PERTURBATION (no LLM)
# ══════════════════════════════════════════════════════════════

# ── Word-level synonym swaps ─────────────────────────────────
# Key = AI-telltale word (lowercase), Value = list of casual alternatives
WORD_SWAPS: dict[str, list[str]] = {
    # Power verbs → casual
    "spearheaded":   ["led", "started", "kicked off"],
    "leveraged":     ["used", "relied on", "tapped into"],
    "utilized":      ["used", "worked with", "applied"],
    "orchestrated":  ["ran", "managed", "coordinated"],
    "pioneered":     ["started", "introduced", "was first to do"],
    "facilitated":   ["helped with", "ran", "supported"],
    "streamlined":   ["simplified", "cleaned up", "cut down"],
    "optimized":     ["improved", "tuned", "sped up"],
    "architected":   ["designed", "built", "planned"],
    "championed":    ["pushed for", "promoted", "backed"],
    "devised":       ["came up with", "created", "figured out"],
    "cultivated":    ["built", "grew", "developed"],
    "galvanized":    ["motivated", "rallied", "energized"],
    "synthesized":   ["combined", "pulled together", "merged"],
    "conceptualized": ["designed", "came up with", "thought up"],
    "developed":     ["built", "created", "put together"],
    "implemented":   ["set up", "put in place", "rolled out"],
    "engineered":    ["built", "created", "designed"],
    "automated":     ["set up automation for", "made automatic"],
    "deployed":      ["launched", "rolled out", "shipped"],
    "integrated":    ["combined", "connected", "linked"],
    "coordinated":   ["organized", "managed", "lined up"],
    "oversaw":       ["managed", "ran", "handled"],
    "initiated":     ["started", "kicked off", "began"],
    "launched":      ["started", "released", "put out"],
    "transformed":   ["changed", "reworked", "overhauled"],
    "revamped":      ["reworked", "redid", "refreshed"],
    "modernized":    ["updated", "upgraded", "brought up to date"],
    "established":   ["set up", "created", "started"],
    "executed":      ["ran", "carried out", "did"],
    "delivered":     ["shipped", "completed", "finished"],
    "drove":         ["pushed", "led", "moved forward"],
    "directed":      ["led", "managed", "guided"],
    "managed":       ["ran", "handled", "looked after"],
    "designed":      ["planned", "laid out", "mapped out"],
    "created":       ["built", "made", "put together"],

    # AI filler adjectives → casual
    "comprehensive": ["full", "complete", "thorough"],
    "cutting-edge":  ["latest", "modern", "new"],
    "robust":        ["strong", "solid", "reliable"],
    "innovative":    ["new", "creative", "novel"],
    "meticulous":    ["careful", "detailed", "thorough"],
    "multifaceted":  ["varied", "diverse", "wide-ranging"],
    "holistic":      ["full", "complete", "overall"],
    "state-of-the-art": ["latest", "modern", "current"],
    "scalable":      ["flexible", "expandable", "growable"],
    "pivotal":       ["key", "important", "critical"],
    "instrumental":  ["key", "important", "central"],
    "transformative": ["major", "significant", "game-changing"],
    "seamless":      ["smooth", "easy", "clean"],
    "dynamic":       ["active", "flexible", "fast-moving"],
    "cornerstone":   ["foundation", "base", "core"],
    "paradigm":      ["model", "approach", "framework"],
    "synergy":       ["teamwork", "collaboration", "combined effort"],
    "endeavor":      ["effort", "project", "work"],
    "realm":         ["area", "field", "space"],
    "landscape":     ["field", "space", "scene"],
    "foster":        ["encourage", "support", "grow"],
    "harness":       ["use", "tap into", "take advantage of"],
    "delve":         ["dig into", "look into", "explore"],
    "enhance":       ["improve", "boost", "strengthen"],
    "ensure":        ["make sure", "confirm", "check"],
    "leverage":      ["use", "take advantage of", "build on"],
    "utilize":       ["use", "work with", "apply"],
    "optimal":       ["best", "ideal", "top"],
    "impactful":     ["effective", "meaningful", "strong"],
    "actionable":    ["practical", "useful", "concrete"],
    "stakeholders":  ["team members", "people involved", "key people"],
    "cross-functional": ["multi-team", "mixed-team", "cross-team"],
    "spearhead":     ["lead", "start", "drive"],
    "ecosystem":     ["environment", "system", "setup"],
    "empower":       ["help", "enable", "give tools to"],
    "elevate":       ["raise", "improve", "lift"],
    "bolster":       ["strengthen", "support", "back up"],
    "augment":       ["add to", "expand", "boost"],
    "mitigate":      ["reduce", "lower", "cut down on"],
    "paramount":     ["top priority", "most important", "critical"],
    "unprecedented": ["record", "never-before-seen", "first-ever"],
}

# ── Phrase-level replacements (multi-word) ────────────────────
# Matched case-insensitively. Order matters — longer phrases first.
PHRASE_SWAPS: list[tuple[str, list[str]]] = [
    ("resulting in a",     ["cutting", "with a", "giving a"]),
    ("resulting in",       ["and", "which gave", "bringing"]),
    ("leading to a",      ["and achieving a", "with a"]),
    ("leading to",        ["and", "which gave", "bringing"]),
    ("contributing to",   ["helping with", "and supporting"]),
    ("which led to",      ["and", "giving", "producing"]),
    ("in order to",       ["to", "so we could"]),
    ("with the goal of",  ["to", "aiming to"]),
    ("across the organization", ["company-wide", "across the company", "org-wide"]),
    ("across the company", ["company-wide", "throughout the org"]),
    ("a team of",         ["a group of", ""]),  # "" means drop "a team of" → just the number
    ("as well as",        ["and", "plus", "along with"]),
    ("in addition to",    ["besides", "on top of", "plus"]),
    ("was responsible for", ["handled", "took care of", "owned"]),
    ("played a key role in", ["helped", "was central to"]),
    ("on a daily basis",  ["daily", "every day"]),
    ("in a timely manner", ["on time", "quickly"]),
    ("a wide range of",   ["many", "various", "all kinds of"]),
    ("the implementation of", ["setting up", "building", "rolling out"]),
    ("the development of", ["building", "creating", "making"]),
    ("the optimization of", ["improving", "tuning", "speeding up"]),
]

# ── Filler words to randomly drop (remove entirely) ──────────
DROPPABLE_FILLERS = {
    "effectively", "successfully", "significantly", "strategically",
    "proactively", "meticulously", "seamlessly", "holistically",
    "comprehensively", "diligently", "consistently", "notably",
    "substantially", "remarkably", "demonstrably", "crucially",
}

# ── Structural patterns ──────────────────────────────────────
# Regex-based replacements for common AI sentence structures
STRUCTURAL_SWAPS: list[tuple[re.Pattern, list[str]]] = [
    # "improved X by N%" → "cut X by N%" / "brought X down N%"
    (re.compile(r"\bimproved\b(.+?)\bby\s+(\d+%)", re.I),
     ["boosted{0} by {1}", "raised{0} by {1}"]),
    # "reduced X by N%" → "cut X by N%" / "lowered X by N%"
    (re.compile(r"\breduced\b(.+?)\bby\s+(\d+%)", re.I),
     ["cut{0} by {1}", "lowered{0} by {1}", "dropped{0} by {1}"]),
    # "increased X by N%" → "grew X by N%"
    (re.compile(r"\bincreased\b(.+?)\bby\s+(\d+%)", re.I),
     ["grew{0} by {1}", "raised{0} by {1}", "bumped{0} up by {1}"]),
    # "achieved a N% improvement" → "hit N% improvement"
    (re.compile(r"\bachieved\s+a\s+(\d+%)\s+(\w+)", re.I),
     ["hit a {0} {1}", "reached a {0} {1}", "got a {0} {1}"]),
]


def _match_case(original: str, replacement: str) -> str:
    """Match the case of the replacement to the original word."""
    if original.isupper():
        return replacement.upper()
    if original[0].isupper():
        # Capitalize first letter of replacement
        return replacement[0].upper() + replacement[1:] if replacement else ""
    return replacement.lower()


def perturb_sentence(sentence: str, *, min_changes: int = 2, max_changes: int = 4) -> dict:
    """
    Apply rule-based perturbation to a single sentence.
    Returns {"text": str, "changes": [{"type": str, "from": str, "to": str}]}
    No LLM involved — pure Python random.
    """
    working = sentence
    changes = []
    available_swaps = []  # (priority, type, match_info)

    # Pass 1: Find all phrase-level swap opportunities
    for phrase, replacements in PHRASE_SWAPS:
        pattern = re.compile(re.escape(phrase), re.IGNORECASE)
        match = pattern.search(working)
        if match:
            available_swaps.append({
                "type": "phrase",
                "pattern": pattern,
                "original": match.group(),
                "replacements": replacements,
                "priority": 2,  # Phrases have higher priority
            })

    # Pass 2: Find all word-level swap opportunities
    words = working.split()
    for i, word in enumerate(words):
        clean = word.strip(".,;:!?()\"'–—")
        lower = clean.lower()

        # Check droppable fillers
        if lower in DROPPABLE_FILLERS:
            available_swaps.append({
                "type": "drop",
                "word_index": i,
                "original": clean,
                "priority": 1,
            })
        # Check word swaps
        elif lower in WORD_SWAPS:
            available_swaps.append({
                "type": "word",
                "word_index": i,
                "original": clean,
                "replacements": WORD_SWAPS[lower],
                "priority": 1,
            })

    # Pass 3: Find structural pattern opportunities
    for pattern, templates in STRUCTURAL_SWAPS:
        match = pattern.search(working)
        if match:
            available_swaps.append({
                "type": "structural",
                "pattern": pattern,
                "match": match,
                "templates": templates,
                "priority": 3,
            })

    if not available_swaps:
        return {"text": sentence, "changes": []}

    # Select how many changes to make (2-4, capped by available)
    n_changes = min(random.randint(min_changes, max_changes), len(available_swaps))

    # Weighted random selection — prioritize high-priority swaps
    # Shuffle first, then sort by priority (stable sort keeps randomness within same priority)
    random.shuffle(available_swaps)
    available_swaps.sort(key=lambda x: x["priority"], reverse=True)
    selected = available_swaps[:n_changes]

    # Apply changes (process phrases/structural first to avoid index shifts)
    # Sort: structural > phrase > word/drop (by type)
    selected.sort(key=lambda x: {"structural": 0, "phrase": 1, "word": 2, "drop": 3}.get(x["type"], 4))

    applied_indices = set()  # Track word indices already changed

    for swap in selected:
        if swap["type"] == "structural":
            match = swap["match"]
            template = random.choice(swap["templates"])
            groups = match.groups()
            try:
                replacement = template.format(*groups)
            except (IndexError, KeyError):
                replacement = template
                for gi, g in enumerate(groups):
                    replacement = replacement.replace(f"{{{gi}}}", g)
            new_working = working[:match.start()] + replacement + working[match.end():]
            if new_working != working:
                changes.append({"type": "structural", "from": match.group(), "to": replacement})
                working = new_working

        elif swap["type"] == "phrase":
            replacement = random.choice(swap["replacements"])
            if replacement == "":
                # Drop the phrase
                new_working = swap["pattern"].sub("", working, count=1).strip()
                new_working = re.sub(r"\s{2,}", " ", new_working)
            else:
                matched = swap["pattern"].search(working)
                if matched:
                    cased = _match_case(matched.group().split()[0], replacement.split()[0])
                    replacement = cased + replacement[len(replacement.split()[0]):]
                new_working = swap["pattern"].sub(replacement, working, count=1)
            if new_working != working:
                changes.append({"type": "phrase", "from": swap["original"], "to": replacement or "(removed)"})
                working = new_working

        elif swap["type"] == "word":
            idx = swap["word_index"]
            if idx in applied_indices:
                continue
            replacement = random.choice(swap["replacements"])
            words = working.split()
            if idx < len(words):
                old_word = words[idx]
                clean = old_word.strip(".,;:!?()\"'–—")
                # Preserve punctuation
                prefix = old_word[:old_word.index(clean)] if clean in old_word else ""
                suffix = old_word[old_word.index(clean) + len(clean):] if clean in old_word else ""
                cased = _match_case(clean, replacement)
                words[idx] = prefix + cased + suffix
                new_working = " ".join(words)
                if new_working != working:
                    changes.append({"type": "word", "from": clean, "to": cased})
                    working = new_working
                    applied_indices.add(idx)

        elif swap["type"] == "drop":
            idx = swap["word_index"]
            if idx in applied_indices:
                continue
            words = working.split()
            if idx < len(words):
                dropped = words[idx].strip(".,;:!?()\"'–—")
                words.pop(idx)
                new_working = " ".join(words)
                if new_working != working:
                    changes.append({"type": "drop", "from": dropped, "to": "(removed)"})
                    working = new_working
                    applied_indices.add(idx)

    return {"text": working, "changes": changes}


def perturb_all(text: str) -> dict:
    """
    Rule-based perturbation of all sentences. No LLM, no API key.
    Returns same shape as rewrite pipeline for easy frontend integration.
    """
    sentences = split_sentences(text)
    if not sentences:
        return {"rewrites": [], "result_text": "", "total": 0, "changed": 0}

    analysis = analyze_text(text)
    rewrites = []

    for i, sentence in enumerate(sentences):
        result = perturb_sentence(sentence)
        if result["changes"]:  # Only include if something actually changed
            rewrites.append({
                "index": i,
                "original": sentence,
                "rewritten": result["text"],
                "changes": result["changes"],
            })

    rewrite_map = {rw["index"]: rw["rewritten"] for rw in rewrites}
    final_lines = []
    for i, s in enumerate(sentences):
        final_lines.append(rewrite_map.get(i, s))

    return {
        "analysis": analysis,
        "rewrites": rewrites,
        "result_text": "\n".join(final_lines),
        "message": f"Perturbed {len(rewrites)}/{len(sentences)} sentences (rule-based, no AI).",
        "total": len(sentences),
        "changed": len(rewrites),
    }


# ══════════════════════════════════════════════════════════════
# HYBRID: Rule-based targeting + LLM word replacement
# ══════════════════════════════════════════════════════════════

def _find_replaceable_words(sentence: str) -> list[dict]:
    """
    Find all AI-telltale words/phrases in a sentence that could be replaced.
    Returns list of {"word": str, "type": str, "position": int_or_None}
    """
    targets = []
    words = sentence.split()

    # Phrase targets
    for phrase, _ in PHRASE_SWAPS:
        pattern = re.compile(re.escape(phrase), re.IGNORECASE)
        match = pattern.search(sentence)
        if match:
            targets.append({
                "word": match.group(),
                "type": "phrase",
                "position": None,
            })

    # Word targets
    for i, word in enumerate(words):
        clean = word.strip(".,;:!?()\"'–—")
        lower = clean.lower()
        if lower in DROPPABLE_FILLERS:
            targets.append({"word": clean, "type": "filler", "position": i})
        elif lower in WORD_SWAPS:
            targets.append({"word": clean, "type": "word", "position": i})

    return targets


HYBRID_SYSTEM = """You are a word-replacement assistant. You will receive sentences with specific words marked in [brackets].

Your ONLY job: suggest a natural, casual replacement for EACH bracketed word/phrase.

RULES:
1. ONLY replace the bracketed words — do NOT change anything else
2. Keep the replacement natural and professional (resume context)
3. Prefer simpler, more casual words over formal/fancy ones
4. For filler words marked [DROP:word], remove them entirely (output empty string "")
5. Do NOT add new words or change sentence structure

Return ONLY valid JSON:
{
  "replacements": [
    {"original": "the bracketed word", "replacement": "your suggestion"},
    {"original": "DROP:word", "replacement": ""}
  ]
}
"""


async def hybrid_perturb(
    text: str,
    *,
    together_api_key: str,
    model: str = "zai-org/GLM-5",
) -> dict:
    """
    Hybrid approach: rule-based engine finds AI-telltale words,
    LLM provides context-aware replacements for ONLY those words.
    """
    import asyncio
    import json

    sentences = split_sentences(text)
    if not sentences:
        return {"rewrites": [], "result_text": "", "total": 0, "changed": 0}

    analysis = analyze_text(text)

    llm = ChatOpenAI(
        model=model,
        base_url="https://api.together.xyz/v1",
        api_key=together_api_key,
        temperature=0.7,
        max_tokens=4096,
    )

    # Build marked-up sentences (only those with replaceable words)
    tasks = []  # (sentence_index, original_sentence, marked_sentence, targets)
    for i, sentence in enumerate(sentences):
        targets = _find_replaceable_words(sentence)
        if not targets:
            continue

        # Select 2-5 targets per sentence
        random.shuffle(targets)
        selected = targets[:min(random.randint(2, 5), len(targets))]

        # Mark up the sentence with brackets
        marked = sentence
        for t in sorted(selected, key=lambda x: len(x["word"]), reverse=True):
            if t["type"] == "filler":
                # Mark for dropping
                marked = re.sub(
                    r"\b" + re.escape(t["word"]) + r"\b",
                    f"[DROP:{t['word']}]",
                    marked, count=1, flags=re.IGNORECASE,
                )
            else:
                marked = re.sub(
                    re.escape(t["word"]),
                    f"[{t['word']}]",
                    marked, count=1, flags=re.IGNORECASE,
                )

        if marked != sentence:  # Something was actually marked
            tasks.append((i, sentence, marked, selected))

    if not tasks:
        return {
            "analysis": analysis,
            "rewrites": [],
            "result_text": "\n".join(sentences),
            "message": "No AI-telltale words found to replace.",
            "total": len(sentences),
            "changed": 0,
        }

    # Batch sentences for LLM (all in one call for efficiency)
    batch_lines = []
    for idx, (sent_i, orig, marked, _) in enumerate(tasks):
        batch_lines.append(f"[{idx}] {marked}")

    user_msg = (
        f"For each sentence below, suggest a natural replacement for every [bracketed] word. "
        f"For [DROP:word] items, the replacement should be empty string. "
        f"Return JSON with a \"sentences\" array, each having \"index\" (integer) and \"replacements\" (array of {{\"original\": ..., \"replacement\": ...}}).\n\n"
        + "\n".join(batch_lines)
    )

    loop = asyncio.get_event_loop()
    try:
        res = await loop.run_in_executor(
            None,
            lambda: llm.invoke([
                SystemMessage(content=HYBRID_SYSTEM),
                HumanMessage(content=user_msg),
            ]),
        )
    except Exception as e:
        logger.error(f"Hybrid LLM call failed: {e}")
        # Fallback to pure rule-based
        return perturb_all(text)

    content = res.content.strip()
    logger.info(f"Hybrid LLM response ({len(content)} chars): {content[:500]}...")

    # Strip markdown fences
    if content.startswith("```"):
        lines = content.split("\n")[1:]
        end = next((i for i, l in enumerate(lines) if l.strip() == "```"), len(lines))
        content = "\n".join(lines[:end])

    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        logger.error(f"Hybrid JSON parse failed: {e}\nContent: {content[:500]}")
        return perturb_all(text)

    # Apply replacements
    rewrites = []
    llm_sentences = data.get("sentences", [])

    # Build lookup: batch_index → replacements
    replacement_map = {}
    for item in llm_sentences:
        try:
            batch_idx = int(item.get("index", -1))
        except (ValueError, TypeError):
            continue
        replacement_map[batch_idx] = item.get("replacements", [])

    for batch_idx, (sent_i, original, marked, targets) in enumerate(tasks):
        replacements = replacement_map.get(batch_idx, [])
        if not replacements:
            continue

        # Apply each replacement to the original sentence
        working = original
        changes = []
        for rep in replacements:
            orig_word = rep.get("original", "").replace("DROP:", "")
            new_word = rep.get("replacement", "")

            if not orig_word:
                continue

            # Apply the swap in the sentence
            pattern = re.compile(re.escape(orig_word), re.IGNORECASE)
            match = pattern.search(working)
            if not match:
                continue

            if new_word == "" or new_word is None:
                # Drop the word
                new_working = pattern.sub("", working, count=1)
                new_working = re.sub(r"\s{2,}", " ", new_working).strip()
                change_type = "drop"
                display_to = "(removed)"
            else:
                # Case-match the replacement
                cased = _match_case(match.group(), new_word)
                new_working = working[:match.start()] + cased + working[match.end():]
                change_type = "word"
                display_to = cased

            if new_working != working:
                changes.append({
                    "type": change_type,
                    "from": match.group(),
                    "to": display_to,
                })
                working = new_working

        if changes and working != original:
            # Garbage check
            if not _is_garbage(working):
                rewrites.append({
                    "index": sent_i,
                    "original": original,
                    "rewritten": working,
                    "changes": changes,
                })

    rewrite_map = {rw["index"]: rw["rewritten"] for rw in rewrites}
    final_lines = [rewrite_map.get(i, s) for i, s in enumerate(sentences)]

    return {
        "analysis": analysis,
        "rewrites": rewrites,
        "result_text": "\n".join(final_lines),
        "message": f"Hybrid perturb: {len(rewrites)}/{len(sentences)} sentences (rule-targeted + LLM synonyms).",
        "total": len(sentences),
        "changed": len(rewrites),
    }


# ══════════════════════════════════════════════════════════════
# MULTI-MODEL: 3 models → word-level diff → random mix
# ══════════════════════════════════════════════════════════════

from difflib import SequenceMatcher

MULTI_MODELS = [
    ("Kimi K2.5", "moonshotai/Kimi-K2.5"),
    ("GLM-5", "zai-org/GLM-5"),
    ("Qwen 2.5", "Qwen/Qwen2.5-7B-Instruct-Turbo"),
]

MULTI_SYSTEM = """You are rewriting resume bullet points to sound more natural and human-written.

For EVERY sentence below, rewrite it by:
- Replacing formal words with casual ones
- Simplifying complex phrases
- Changing sentence structure slightly
- Using different word choices

IMPORTANT:
- Keep ALL facts, numbers, company names, and technical terms EXACTLY the same
- You MUST rewrite EVERY sentence — do NOT skip any, do NOT return the original unchanged
- Each rewrite should be noticeably different from the original

Return ONLY valid JSON:
{"rewrites": [{"index": 0, "text": "..."}, {"index": 1, "text": "..."}, ...]}
"""


def _extract_word_diffs(original: str, rewritten: str, source: str) -> list[dict]:
    """
    Diff two sentences at the word level. Extract small (1-3 word) changes.
    Returns list of {"pos": (start, end), "original": str, "replacement": str, "source": str}
    """
    orig_words = original.split()
    new_words = rewritten.split()

    matcher = SequenceMatcher(None, orig_words, new_words)
    changes = []

    for op, i1, i2, j1, j2 in matcher.get_opcodes():
        if op == "equal":
            continue
        orig_span = i2 - i1
        new_span = j2 - j1
        # Only keep small changes (1-3 words) — skip massive structural rewrites
        if op == "replace" and orig_span <= 3 and new_span <= 4:
            changes.append({
                "pos": (i1, i2),
                "original": " ".join(orig_words[i1:i2]),
                "replacement": " ".join(new_words[j1:j2]),
                "source": source,
            })
        elif op == "delete" and orig_span <= 2:
            changes.append({
                "pos": (i1, i2),
                "original": " ".join(orig_words[i1:i2]),
                "replacement": "",
                "source": source,
            })
        elif op == "insert" and new_span <= 2:
            changes.append({
                "pos": (i1, i1),
                "original": "",
                "replacement": " ".join(new_words[j1:j2]),
                "source": source,
            })

    return changes


def _apply_word_changes(original: str, changes: list[dict]) -> str:
    """
    Apply selected word-level changes to the original sentence.
    Changes must be sorted by position (reverse) to avoid index shifting.
    """
    words = original.split()

    # Sort by position descending so we can apply from end to start
    sorted_changes = sorted(changes, key=lambda c: c["pos"][0], reverse=True)

    for ch in sorted_changes:
        start, end = ch["pos"]
        replacement_words = ch["replacement"].split() if ch["replacement"] else []
        words[start:end] = replacement_words

    result = " ".join(words)
    # Clean up double spaces
    result = re.sub(r"\s{2,}", " ", result).strip()
    return result


async def multi_model_rewrite(
    text: str,
    *,
    together_api_key: str,
) -> dict:
    """
    3 models rewrite in parallel → extract word-level diffs → randomly mix
    changes from different models at the word level.
    """
    import asyncio
    import json

    sentences = split_sentences(text)
    if not sentences:
        return {"sentence_results": [], "result_text": "", "total": 0, "changed": 0}

    analysis = analyze_text(text)

    # Build input block (same for all 3 models)
    input_block = "\n".join(f"[{i}] {s}" for i, s in enumerate(sentences))
    user_msg = (
        f"Rewrite each of the {len(sentences)} sentences below to sound more natural. "
        f"Make each rewrite NOTICEABLY different. "
        f"You MUST return a rewrite for ALL {len(sentences)} sentences.\n\n"
        f"{input_block}"
    )

    async def _call_model(label: str, model_id: str) -> dict[int, str]:
        """Call one model, return {sentence_index: rewritten_text}."""
        llm = ChatOpenAI(
            model=model_id,
            base_url="https://api.together.xyz/v1",
            api_key=together_api_key,
            temperature=0.9,
            max_tokens=8192,
        )
        loop = asyncio.get_event_loop()
        try:
            res = await loop.run_in_executor(
                None,
                lambda: llm.invoke([
                    SystemMessage(content=MULTI_SYSTEM),
                    HumanMessage(content=user_msg),
                ]),
            )
        except Exception as e:
            logger.error(f"[{label}] LLM call failed: {e}")
            return {}

        content = res.content.strip()
        logger.info(f"[{label}] response ({len(content)} chars): {content[:300]}...")

        # Strip markdown fences
        if content.startswith("```"):
            lines = content.split("\n")[1:]
            end = next((i for i, l in enumerate(lines) if l.strip() == "```"), len(lines))
            content = "\n".join(lines[:end])

        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            logger.error(f"[{label}] JSON parse failed: {e}\nContent: {content[:500]}")
            return {}

        result = {}
        for rw in data.get("rewrites", []):
            try:
                idx = int(rw.get("index", -1))
            except (ValueError, TypeError):
                continue
            rw_text = rw.get("text", "")
            if rw_text and not _is_garbage(rw_text):
                result[idx] = rw_text

        logger.info(f"[{label}] got {len(result)}/{len(sentences)} rewrites")
        return result

    # Call all 3 models in parallel
    model_results = await asyncio.gather(
        *[_call_model(label, model_id) for label, model_id in MULTI_MODELS],
        return_exceptions=True,
    )

    # Build per-model lookup: label → {index: text}
    model_outputs: dict[str, dict[int, str]] = {}
    for i, (label, _) in enumerate(MULTI_MODELS):
        if isinstance(model_results[i], dict):
            model_outputs[label] = model_results[i]
        else:
            logger.error(f"[{label}] failed: {model_results[i]}")
            model_outputs[label] = {}

    # ── Word-level diff extraction + random mixing ──
    sentence_results = []
    for sent_i, original in enumerate(sentences):
        # Collect full rewrites for display
        options = {}
        for label, _ in MULTI_MODELS:
            rewritten = model_outputs[label].get(sent_i)
            if rewritten and rewritten != original:
                options[label] = rewritten
            else:
                options[label] = None

        # Extract word-level diffs from each model's rewrite
        all_word_changes = []
        for label, _ in MULTI_MODELS:
            rewritten = model_outputs[label].get(sent_i)
            if rewritten and rewritten != original:
                diffs = _extract_word_diffs(original, rewritten, label)
                all_word_changes.extend(diffs)

        if not all_word_changes:
            # No model changed this sentence — use rule-based fallback
            fallback = perturb_sentence(original, min_changes=1, max_changes=3)
            if fallback["changes"]:
                sentence_results.append({
                    "index": sent_i,
                    "original": original,
                    "options": options,
                    "selected_model": "rule-fallback",
                    "selected_text": fallback["text"],
                    "word_changes": [
                        {"original": c["from"], "replacement": c["to"], "source": "rules"}
                        for c in fallback["changes"]
                    ],
                })
            else:
                sentence_results.append({
                    "index": sent_i,
                    "original": original,
                    "options": options,
                    "selected_model": None,
                    "selected_text": original,
                    "word_changes": [],
                })
            continue

        # Group changes by position — for each position, pick from available models
        position_groups: dict[tuple, list[dict]] = {}
        for ch in all_word_changes:
            pos_key = ch["pos"]
            if pos_key not in position_groups:
                position_groups[pos_key] = []
            position_groups[pos_key].append(ch)

        # For overlapping positions, keep only non-overlapping changes
        # Sort positions by start index
        sorted_positions = sorted(position_groups.keys())
        non_overlapping = []
        last_end = -1
        for pos in sorted_positions:
            start, end = pos
            if start >= last_end:
                non_overlapping.append(pos)
                last_end = max(end, start + 1)

        # Randomly select 40-70% of available positions to change
        n_positions = len(non_overlapping)
        n_to_change = max(1, int(n_positions * random.uniform(0.4, 0.7)))
        selected_positions = random.sample(non_overlapping, min(n_to_change, n_positions))

        # For each selected position, randomly pick one model's change
        selected_changes = []
        for pos in selected_positions:
            candidates = position_groups[pos]
            chosen = random.choice(candidates)
            selected_changes.append(chosen)

        # Apply changes to original
        mixed_text = _apply_word_changes(original, selected_changes)
        word_changes_display = [
            {"original": c["original"] or "(insert)", "replacement": c["replacement"] or "(removed)", "source": c["source"]}
            for c in selected_changes
        ]

        sentence_results.append({
            "index": sent_i,
            "original": original,
            "options": options,
            "selected_model": "mixed",
            "selected_text": mixed_text if mixed_text != original else original,
            "word_changes": word_changes_display,
        })

    # Assemble final text
    final_lines = [sr["selected_text"] for sr in sentence_results]
    changed = sum(1 for sr in sentence_results if sr["selected_model"] is not None)

    # Stats per model
    model_stats = {
        label: sum(1 for sr in sentence_results if sr["options"].get(label) is not None)
        for label, _ in MULTI_MODELS
    }
    stats_str = ", ".join(f"{label}: {count}/{len(sentences)}" for label, count in model_stats.items())

    # Count word-level changes
    total_word_changes = sum(len(sr.get("word_changes", [])) for sr in sentence_results)

    return {
        "analysis": analysis,
        "sentence_results": sentence_results,
        "result_text": "\n".join(final_lines),
        "message": f"Word-level mix: {changed}/{len(sentences)} sentences, {total_word_changes} word changes. [{stats_str}]",
        "total": len(sentences),
        "changed": changed,
        "model_stats": model_stats,
        "total_word_changes": total_word_changes,
    }


# ══════════════════════════════════════════════════════════════
# TRANSLATE VIA CHINESE — English → Chinese → English
# ══════════════════════════════════════════════════════════════

TRANSLATE_TO_ZH_SYSTEM = """You are a professional translator. Translate the following English resume bullet points into natural, fluent Chinese (Mandarin).

Rules:
- Translate ALL content faithfully — keep every fact, number, metric, company name, and technical term
- Use natural Chinese phrasing, NOT word-for-word translation
- Technical terms (e.g. Kubernetes, CI/CD, React) keep in English
- Company names and product names keep in English
- Numbers and percentages keep as-is
- Each line is one bullet point — translate each line separately
- Return ONLY the Chinese translation, nothing else

Example:
IN: Developed a real-time monitoring dashboard using React and D3.js, reducing incident response time by 40%
OUT: 使用 React 和 D3.js 开发了实时监控仪表板，将事故响应时间缩短了 40%"""

TRANSLATE_TO_EN_SYSTEM = """You are a professional translator. Translate the following Chinese resume bullet points back into natural, professional English.

Rules:
- Translate ALL content faithfully — keep every fact, number, metric, company name, and technical term
- Use natural English phrasing — do NOT produce overly formal or "AI-sounding" text
- Write like a real person would write their resume — direct, clear, slightly informal is OK
- Vary your sentence structures — some short, some longer
- Avoid overused AI words like: spearheaded, leveraged, utilized, orchestrated, pioneered, comprehensive, robust, cutting-edge, innovative, streamlined
- Use simpler verbs: built, set up, ran, handled, worked on, put together, cut down, brought up
- Technical terms keep in English
- Each line is one bullet point — translate each line separately
- Return ONLY the English translation, nothing else"""


async def translate_via_chinese(
    text: str,
    *,
    together_api_key: str,
    model: str = "mistralai/Mistral-7B-Instruct-v0.3",
) -> dict:
    """
    Two-step translation: English → Chinese → English.
    Returns intermediate Chinese text and final English text, plus per-sentence breakdown.
    """
    import asyncio

    sentences = split_sentences(text)
    if not sentences:
        return {
            "analysis": analyze_text(text),
            "chinese_text": "",
            "result_text": "",
            "sentences": [],
            "total": 0,
            "message": "No sentences found.",
        }

    analysis = analyze_text(text)
    input_block = "\n".join(sentences)

    llm = ChatOpenAI(
        model=model,
        base_url="https://api.together.xyz/v1",
        api_key=together_api_key,
        temperature=0.8,
        max_tokens=8192,
    )

    loop = asyncio.get_event_loop()

    # ── Step 1: English → Chinese ──
    logger.info(f"[translate] Step 1: EN→ZH with {model}, {len(sentences)} sentences")
    try:
        zh_res = await loop.run_in_executor(
            None,
            lambda: llm.invoke([
                SystemMessage(content=TRANSLATE_TO_ZH_SYSTEM),
                HumanMessage(content=input_block),
            ]),
        )
    except Exception as e:
        logger.error(f"[translate] EN→ZH failed: {e}", exc_info=True)
        raise RuntimeError(f"EN→ZH translation failed: {e}")

    chinese_text = zh_res.content.strip()
    logger.info(f"[translate] Chinese output ({len(chinese_text)} chars): {chinese_text[:300]}...")

    # ── Step 2: Chinese → English ──
    logger.info(f"[translate] Step 2: ZH→EN with {model}")
    try:
        en_res = await loop.run_in_executor(
            None,
            lambda: llm.invoke([
                SystemMessage(content=TRANSLATE_TO_EN_SYSTEM),
                HumanMessage(content=chinese_text),
            ]),
        )
    except Exception as e:
        logger.error(f"[translate] ZH→EN failed: {e}", exc_info=True)
        raise RuntimeError(f"ZH→EN translation failed: {e}")

    english_text = en_res.content.strip()
    logger.info(f"[translate] English output ({len(english_text)} chars): {english_text[:300]}...")

    # ── Build per-sentence breakdown ──
    zh_lines = [l.strip() for l in chinese_text.split("\n") if l.strip()]
    en_lines = [l.strip() for l in english_text.split("\n") if l.strip()]

    sentence_results = []
    for i, orig in enumerate(sentences):
        zh = zh_lines[i] if i < len(zh_lines) else "(missing)"
        en = en_lines[i] if i < len(en_lines) else orig
        sentence_results.append({
            "index": i,
            "original": orig,
            "chinese": zh,
            "translated": en,
            "changed": en.strip().lower() != orig.strip().lower(),
        })

    changed_count = sum(1 for s in sentence_results if s["changed"])

    return {
        "analysis": analysis,
        "chinese_text": chinese_text,
        "result_text": english_text,
        "sentences": sentence_results,
        "total": len(sentences),
        "changed": changed_count,
        "message": f"Translated {len(sentences)} sentences via Chinese ({model}). {changed_count}/{len(sentences)} differ from original.",
    }


# ══════════════════════════════════════════════════════════════
# TRANSLATE VIA GOOGLE TRANSLATE (non-LLM) — EN → ZH → EN
# ══════════════════════════════════════════════════════════════

def translate_via_google(text: str) -> dict:
    """
    Two-step translation using Google Translate (NOT an LLM).
    English → Chinese → English. No API key needed.
    Uses encoder-decoder NMT model with fundamentally different
    token probability distribution from autoregressive LLMs.
    """
    from deep_translator import GoogleTranslator

    sentences = split_sentences(text)
    if not sentences:
        return {
            "analysis": analyze_text(text),
            "chinese_text": "",
            "result_text": "",
            "sentences": [],
            "total": 0,
            "message": "No sentences found.",
        }

    analysis = analyze_text(text)

    en_to_zh = GoogleTranslator(source="en", target="zh-CN")
    zh_to_en = GoogleTranslator(source="zh-CN", target="en")

    sentence_results = []
    zh_lines = []
    en_lines = []

    for i, orig in enumerate(sentences):
        try:
            # Step 1: EN → ZH
            zh = en_to_zh.translate(orig)
            zh_lines.append(zh or "(empty)")

            # Step 2: ZH → EN
            en = zh_to_en.translate(zh) if zh else orig
            en_lines.append(en or orig)

            sentence_results.append({
                "index": i,
                "original": orig,
                "chinese": zh or "(empty)",
                "translated": en or orig,
                "changed": (en or "").strip().lower() != orig.strip().lower(),
            })
        except Exception as e:
            logger.error(f"[google-translate] sentence {i} failed: {e}")
            zh_lines.append("(error)")
            en_lines.append(orig)
            sentence_results.append({
                "index": i,
                "original": orig,
                "chinese": "(error)",
                "translated": orig,
                "changed": False,
            })

    chinese_text = "\n".join(zh_lines)
    english_text = "\n".join(en_lines)
    changed_count = sum(1 for s in sentence_results if s["changed"])

    return {
        "analysis": analysis,
        "chinese_text": chinese_text,
        "result_text": english_text,
        "sentences": sentence_results,
        "total": len(sentences),
        "changed": changed_count,
        "message": f"Google Translate: {changed_count}/{len(sentences)} sentences differ (EN→ZH→EN, no LLM).",
    }


# ══════════════════════════════════════════════════════════════
# STRUCTURAL SIMPLIFICATION — address GPTZero's structural flags
# ══════════════════════════════════════════════════════════════

# Split points: transition phrases that create compound AI sentences.
# Each: (regex matching the transition, list of replacement connectors for the new sentence)
_SPLIT_TRANSITIONS: list[tuple[re.Pattern, list[str]]] = [
    (re.compile(r',\s*resulting\s+in\s+(?:a\s+)?', re.I),
     ["Achieved ", "Got ", "This brought "]),
    (re.compile(r',\s*leading\s+to\s+(?:a\s+)?', re.I),
     ["This led to ", "This caused "]),
    (re.compile(r',\s*which\s+', re.I),
     ["This ", "It "]),
    (re.compile(r',\s*thereby\s+', re.I),
     ["That way, "]),
    (re.compile(r',\s*enabling\s+', re.I),
     ["This enabled ", "This let "]),
    (re.compile(r',\s*ensuring\s+(?:that\s+)?', re.I),
     ["Made sure ", "This ensured "]),
    (re.compile(r',\s*achieving\s+(?:a\s+)?', re.I),
     ["Hit ", "Got "]),
    (re.compile(r',\s*contributing\s+to\s+', re.I),
     ["Helped with ", "This supported "]),
    (re.compile(r',\s*allowing\s+(?:the\s+|us\s+to\s+)?', re.I),
     ["This allowed ", "Let "]),
    (re.compile(r',\s*improving\s+', re.I),
     ["Improved ", "Boosted "]),
    (re.compile(r',\s*reducing\s+', re.I),
     ["Cut ", "Lowered "]),
    (re.compile(r',\s*increasing\s+', re.I),
     ["Raised ", "Grew ", "Boosted "]),
    (re.compile(r',\s*enhancing\s+', re.I),
     ["Improved ", "Boosted "]),
    (re.compile(r',\s*driving\s+(?:a\s+)?', re.I),
     ["Drove ", "Pushed "]),
    (re.compile(r',\s*delivering\s+(?:a\s+)?', re.I),
     ["Delivered ", "Gave "]),
    (re.compile(r',\s*saving\s+', re.I),
     ["Saved ", "Cut "]),
]

# Compound verb openings that AI loves — simplify to one word.
_COMPOUND_VERBS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'^Developed\s+and\s+implemented\b', re.I), "Built"),
    (re.compile(r'^Designed\s+and\s+deployed\b', re.I), "Set up"),
    (re.compile(r'^Designed\s+and\s+developed\b', re.I), "Built"),
    (re.compile(r'^Designed\s+and\s+implemented\b', re.I), "Built"),
    (re.compile(r'^Led\s+and\s+managed\b', re.I), "Ran"),
    (re.compile(r'^Managed\s+and\s+maintained\b', re.I), "Ran"),
    (re.compile(r'^Planned\s+and\s+executed\b', re.I), "Ran"),
    (re.compile(r'^Researched\s+and\s+developed\b', re.I), "Built"),
    (re.compile(r'^Created\s+and\s+maintained\b', re.I), "Built"),
    (re.compile(r'^Built\s+and\s+deployed\b', re.I), "Shipped"),
    (re.compile(r'^Analyzed\s+and\s+optimized\b', re.I), "Improved"),
    (re.compile(r'^Monitored\s+and\s+maintained\b', re.I), "Kept up"),
    (re.compile(r'^Developed\s+and\s+deployed\b', re.I), "Shipped"),
    (re.compile(r'^Developed\s+and\s+maintained\b', re.I), "Built"),
    (re.compile(r'^Implemented\s+and\s+maintained\b', re.I), "Set up"),
    (re.compile(r'^Developed\s+and\s+executed\b', re.I), "Ran"),
    (re.compile(r'^Coordinated\s+and\s+managed\b', re.I), "Ran"),
    (re.compile(r'^Created\s+and\s+implemented\b', re.I), "Built"),
]


def structural_simplify(sentence: str) -> list[str]:
    """
    Break a complex AI-style sentence into shorter, simpler sentences.

    Targets GPTZero's structural complaints:
    - "Complex grammatical structures use subordinate clauses"
    - "Mechanical transitions connecting ideas smoothly"
    - "Formulaic organization"
    - "Lacks creative grammar deviations"

    Returns a list of 1+ shorter sentences.
    """
    working = sentence.strip()
    if not working:
        return []

    # Step 1: Simplify compound verb openings
    for pattern, replacement in _COMPOUND_VERBS:
        m = pattern.search(working)
        if m:
            working = replacement + working[m.end():]
            break

    # Step 2: Try to split at transition phrases
    for pattern, connectors in _SPLIT_TRANSITIONS:
        m = pattern.search(working)
        if m:
            first_half = working[:m.start()].rstrip()
            second_half = working[m.end():].strip()

            # Don't split if either half is too short
            if len(first_half.split()) < 3 or len(second_half.split()) < 2:
                continue

            # Close first sentence
            if first_half and first_half[-1] not in '.!?':
                first_half += '.'

            # Start second sentence with a connector
            connector = random.choice(connectors)
            second_half = connector + second_half

            # Capitalize
            if second_half:
                second_half = second_half[0].upper() + second_half[1:]

            # Recursively try to split further
            results = []
            results.extend(structural_simplify(first_half))
            results.extend(structural_simplify(second_half))
            return results

    # Step 3: Split at semicolons
    if '; ' in working:
        parts = working.split('; ')
        results = []
        for part in parts:
            part = part.strip()
            if part and part[-1] not in '.!?':
                part += '.'
            if len(part.split()) >= 2:
                results.extend(structural_simplify(part))
        if results:
            return results

    return [working]


# ══════════════════════════════════════════════════════════════
# PIPELINE: Google Translate FIRST → Structural Simplify → Perturb
# ══════════════════════════════════════════════════════════════

def humanize_pipeline(text: str) -> dict:
    """
    Three-stage humanization pipeline (no LLM, no API key):
      1. Google Translate EN→ZH→EN on the ORIGINAL text — maximum
         statistical disruption (this is what got us to 49% AI)
      2. Structural simplify: break compound sentences, fix AI structure
      3. Rule-based perturb: swap remaining AI vocabulary

    Order matters: Google Translate must see the ORIGINAL AI text to
    maximally disrupt its token probability distribution. If we simplify
    or perturb first, the input to Google is already altered and the
    translation changes are too small to fool detectors.
    """
    from deep_translator import GoogleTranslator

    original_sentences = split_sentences(text)
    if not original_sentences:
        return {
            "analysis": analyze_text(text),
            "result_text": "",
            "sentences": [],
            "total": 0,
            "changed": 0,
            "message": "No sentences found.",
        }

    analysis = analyze_text(text)

    en_to_zh = GoogleTranslator(source="en", target="zh-CN")
    zh_to_en = GoogleTranslator(source="zh-CN", target="en")

    # ── Stage 1: Google Translate the ORIGINAL sentences ──
    google_results = []
    for i, orig in enumerate(original_sentences):
        try:
            zh = en_to_zh.translate(orig)
            google_en = zh_to_en.translate(zh) if zh else orig
        except Exception as e:
            logger.error(f"[pipeline] Google Translate failed for sentence {i}: {e}")
            zh = "(error)"
            google_en = orig

        if not google_en:
            google_en = orig

        google_results.append({
            "original": orig,
            "chinese": zh or "",
            "google_en": google_en,
        })

    logger.info(f"[pipeline] Google Translate: {len(original_sentences)} sentences translated")

    # ── Stage 2: Structural simplification on the Google output ──
    # Break any remaining compound AI-style sentences
    all_parts = []  # (orig_idx, simplified_text, chinese, google_en_full)
    for orig_idx, gr in enumerate(google_results):
        parts = structural_simplify(gr["google_en"])
        for part in parts:
            all_parts.append({
                "orig_idx": orig_idx,
                "simplified": part,
                "chinese": gr["chinese"],
                "google_en_full": gr["google_en"],
                "original": gr["original"],
            })

    logger.info(f"[pipeline] Structural: {len(original_sentences)} → {len(all_parts)} sentences")

    # ── Stage 3: Rule-based perturb on each simplified part ──
    sentence_results = []
    for i, part in enumerate(all_parts):
        perturbed = perturb_sentence(part["simplified"], min_changes=1, max_changes=3)
        final_text = perturbed["text"]

        # Similarity: compare final to ORIGINAL (shows total change magnitude)
        orig_words = part["original"].lower().split()
        final_words = final_text.lower().split()
        matcher = SequenceMatcher(None, orig_words, final_words)
        similarity = matcher.ratio()

        sentence_results.append({
            "index": i,
            "orig_index": part["orig_idx"],
            "original": part["original"],
            "simplified": part["simplified"],
            "stage1": final_text,
            "stage1_changes": perturbed["changes"],
            "chinese": part["chinese"],
            "google_raw": part["google_en_full"],
            "final": final_text,
            "source": "google",
            "similarity": round(similarity, 2),
            "google_changes": [{"from": "full sentence", "to": "Google Translate"}],
            "changed": final_text.strip().lower() != part["original"].strip().lower(),
        })

    # Assemble
    final_lines = [sr["final"] for sr in sentence_results]
    changed_count = sum(1 for s in sentence_results if s["changed"])
    perturb_change_count = sum(len(s["stage1_changes"]) for s in sentence_results)
    split_count = len(all_parts) - len(original_sentences)

    return {
        "analysis": analysis,
        "sentences": sentence_results,
        "result_text": " ".join(final_lines),
        "total": len(original_sentences),
        "changed": changed_count,
        "perturb_changes": perturb_change_count,
        "google_changes": len(sentence_results),
        "google_sentence_count": len(sentence_results),
        "perturb_sentence_count": 0,
        "split_count": split_count,
        "simplified_count": len(all_parts),
        "message": (
            f"Pipeline: Google Translate first (max disruption) → "
            f"structural simplify ({len(original_sentences)}→{len(all_parts)} sentences) → "
            f"perturb ({perturb_change_count} word swaps)."
        ),
    }


# ══════════════════════════════════════════════════════════════
# LLM-BASED REWRITE (Together AI) — kept for comparison
# ══════════════════════════════════════════════════════════════

# ── Targeted perturbation prompt ───────────────────────────────
REWRITE_SYSTEM = """You are making SMALL, targeted changes to text — NOT rewriting it.

CRITICAL RULE: For each sentence, change ONLY 2-4 words or one short phrase. The rest of the sentence must stay EXACTLY the same, word for word.

WHAT TO CHANGE (pick 2-4 per sentence):
- Swap a verb for a less formal synonym: "Developed" → "Built", "Implemented" → "Set up", "Utilized" → "Used"
- Change a connector: "resulting in" → "and", "in order to" → "to"
- Swap an adjective: "comprehensive" → "full", "scalable" → "large-scale"
- Change phrasing slightly: "a team of 8" → "8 people", "across the organization" → "company-wide"
- Drop one filler word entirely

WHAT NOT TO CHANGE:
- Do NOT rewrite the whole sentence
- Do NOT change sentence structure or word order
- Do NOT change any numbers, metrics, names, or technical terms
- Do NOT add new information
- Do NOT make it longer

EXAMPLES (changes shown in caps for clarity, output should be normal case):

IN:  "Developed and implemented a comprehensive monitoring solution using Prometheus and Grafana, resulting in a 60% reduction in mean time to detection"
OUT: "Built a full monitoring solution using Prometheus and Grafana, cutting mean time to detection by 60%"
(changed 3 things: Developed→Built, comprehensive→full, "resulting in a 60% reduction in"→"cutting...by 60%")

IN:  "Led a cross-functional team of 12 engineers in designing and deploying a scalable microservices architecture that improved system reliability by 99.9%"
OUT: "Led a cross-functional team of 12 engineers in designing and deploying a large-scale microservices architecture that brought system reliability to 99.9%"
(changed 2 things: scalable→large-scale, improved...by→brought...to)

IN:  "The architecture was designed with scalability in mind, incorporating load balancing and automated failover mechanisms"
OUT: "The architecture was built with scalability in mind, with load balancing and automated failover mechanisms"
(changed 2 things: designed→built, incorporating→with)

You MUST modify EVERY sentence. Each sentence must have exactly 2-4 small changes.

Return ONLY valid JSON:
{
  "rewrites": [
    {"index": 0, "text": "sentence with 2-4 small changes"},
    {"index": 1, "text": "sentence with 2-4 small changes"}
  ]
}
"""

# Max sentences per LLM call — keep small for 7-8B models
_BATCH_SIZE = 10


def _is_garbage(text: str) -> bool:
    """Detect degenerated / garbage output from small models."""
    if not text or len(text) < 5:
        return True
    # Repeated 3-char+ chunks (e.g. "curlthere curlthere curlthere")
    words = text.split()
    if len(words) >= 6:
        # Check if any 3-word sequence repeats
        trigrams = [" ".join(words[i:i+3]) for i in range(len(words)-2)]
        if len(trigrams) != len(set(trigrams)) and len(set(trigrams)) < len(trigrams) * 0.5:
            return True
    # Too many non-ASCII / control chars
    non_ascii = sum(1 for c in text if ord(c) > 127 or ord(c) < 32)
    if non_ascii > len(text) * 0.1:
        return True
    # Contains obvious degeneration markers
    garbage_markers = [".Invalid", "_{", "()->", "config ...", "breathe\"},"]
    if any(m in text for m in garbage_markers):
        return True
    # Way too long compared to reasonable output (likely runaway generation)
    if len(text) > 2000:
        return True
    return False


async def rewrite_sentences(
    sentences_to_rewrite: list[dict],
    *,
    together_api_key: str,
    model: str = "mistralai/Mistral-7B-Instruct-v0.3",
) -> list[dict]:
    """
    Rewrite ALL given sentences via Together AI (cross-model paraphrase).
    Each item: {"index": int, "text": str}
    Returns list of {"index": int, "original": str, "rewritten": str}.
    """
    if not sentences_to_rewrite:
        return []

    import asyncio
    import json

    llm = ChatOpenAI(
        model=model,
        base_url="https://api.together.xyz/v1",
        api_key=together_api_key,
        temperature=0.95,
        frequency_penalty=0.5,
        presence_penalty=0.3,
        max_tokens=4096,
    )

    original_map = {item["index"]: item["text"] for item in sentences_to_rewrite}

    # Smaller batches for small models
    batches = []
    for i in range(0, len(sentences_to_rewrite), _BATCH_SIZE):
        batches.append(sentences_to_rewrite[i : i + _BATCH_SIZE])

    async def _call_batch(batch: list[dict]) -> list[dict]:
        input_block = "\n".join(
            f"[{item['index']}] {item['text']}" for item in batch
        )
        user_msg = (
            f"Make 2-4 SMALL word changes in each of the {len(batch)} sentences below. "
            f"Keep everything else exactly the same. "
            f"Return JSON with a \"rewrites\" array, each having \"index\" (integer) and \"text\" (string).\n\n"
            f"{input_block}"
        )

        loop = asyncio.get_event_loop()
        try:
            res = await loop.run_in_executor(
                None,
                lambda: llm.invoke([
                    SystemMessage(content=REWRITE_SYSTEM),
                    HumanMessage(content=user_msg),
                ]),
            )
        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            return []

        content = res.content.strip()
        logger.info(f"Raw LLM response ({len(content)} chars): {content[:300]}...")

        # Strip markdown code fences
        if content.startswith("```"):
            lines = content.split("\n")[1:]
            end = next(
                (i for i, l in enumerate(lines) if l.strip() == "```"), len(lines)
            )
            content = "\n".join(lines[:end])

        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            logger.error(f"JSON parse failed: {e}\nContent: {content[:500]}")
            return []

        return data.get("rewrites", [])

    # Run batches (concurrently if multiple)
    if len(batches) == 1:
        all_rewrites = await _call_batch(batches[0])
    else:
        batch_results = await asyncio.gather(
            *[_call_batch(b) for b in batches], return_exceptions=True
        )
        all_rewrites = []
        for br in batch_results:
            if isinstance(br, list):
                all_rewrites.extend(br)
            elif isinstance(br, Exception):
                logger.error(f"Batch failed: {br}")

    # Build result — handle index as both int and string
    result = []
    for rw in all_rewrites:
        raw_idx = rw.get("index", -1)
        try:
            idx = int(raw_idx)
        except (ValueError, TypeError):
            logger.warning(f"Bad index value: {raw_idx}")
            continue

        if idx not in original_map:
            logger.warning(f"Index {idx} not in original_map (keys: {list(original_map.keys())[:5]}...)")
            continue

        rewritten = rw.get("text", "")
        if not rewritten or rewritten == original_map[idx]:
            continue

        # Garbage detection — discard degenerated output
        if _is_garbage(rewritten):
            logger.warning(f"Garbage detected for index {idx}, keeping original")
            continue

        result.append({
            "index": idx,
            "original": original_map[idx],
            "rewritten": rewritten,
        })

    logger.info(f"Rewrite result: {len(result)}/{len(original_map)} sentences rewritten")
    return result


def assemble_result(
    original_sentences: list[str],
    rewrites: list[dict],
) -> str:
    """
    Assemble final text by merging originals with rewrites.
    rewrites: [{"index": int, "original": str, "rewritten": str}]
    """
    rewrite_map = {rw["index"]: rw["rewritten"] for rw in rewrites}
    final = []
    for i, s in enumerate(original_sentences):
        if i in rewrite_map:
            final.append(rewrite_map[i])
        else:
            final.append(s)
    return "\n".join(final)
