"""
Humanize API — analyze text for AI patterns + perturb/rewrite.

Two modes:
  - /perturb: Rule-based word swaps (no AI, no API key, fast)
  - /rewrite: Cross-model paraphrase via Together AI (LLM-based)
"""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.humanize_engine import (
    analyze_text,
    split_sentences,
    rewrite_sentences,
    assemble_result,
    perturb_all,
    hybrid_perturb,
    multi_model_rewrite,
    translate_via_chinese,
    translate_via_google,
    humanize_pipeline,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()


class AnalyzeRequest(BaseModel):
    text: str


class RewriteRequest(BaseModel):
    text: str
    together_api_key: str
    model: str = "mistralai/Mistral-7B-Instruct-v0.3"


@router.post("/analyze")
async def analyze(req: AnalyzeRequest):
    """Analyze text for AI-generated patterns (heuristic, display only)."""
    if not req.text.strip():
        raise HTTPException(400, "Text is empty")
    return analyze_text(req.text)


@router.post("/perturb")
async def perturb(req: AnalyzeRequest):
    """Rule-based perturbation: swap 2-4 AI-telltale words per sentence. No AI, no API key."""
    if not req.text.strip():
        raise HTTPException(400, "Text is empty")
    result = perturb_all(req.text)
    logger.info(f"Perturbed {result['changed']}/{result['total']} sentences")
    return result


class MultiRequest(BaseModel):
    text: str
    together_api_key: str


@router.post("/multi")
async def multi(req: MultiRequest):
    """3 models in parallel, random pick per sentence. Shows all options."""
    if not req.text.strip():
        raise HTTPException(400, "Text is empty")
    if not req.together_api_key.strip():
        raise HTTPException(400, "Together AI API key is required")

    try:
        result = await multi_model_rewrite(
            req.text,
            together_api_key=req.together_api_key,
        )
    except Exception as e:
        logger.error(f"Multi-model failed: {e}", exc_info=True)
        raise HTTPException(502, f"Multi-model error: {str(e)}")

    logger.info(f"Multi: {result['changed']}/{result['total']} sentences")
    return result


@router.post("/hybrid")
async def hybrid(req: RewriteRequest):
    """Hybrid: rule-based targeting + LLM word-level replacement. Best of both."""
    if not req.text.strip():
        raise HTTPException(400, "Text is empty")
    if not req.together_api_key.strip():
        raise HTTPException(400, "Together AI API key is required")

    try:
        result = await hybrid_perturb(
            req.text,
            together_api_key=req.together_api_key,
            model=req.model,
        )
    except Exception as e:
        logger.error(f"Hybrid perturb failed: {e}", exc_info=True)
        raise HTTPException(502, f"Hybrid perturb error: {str(e)}")

    logger.info(f"Hybrid: {result['changed']}/{result['total']} sentences")
    return result


@router.post("/translate")
async def translate(req: RewriteRequest):
    """English → Chinese → English: cross-language humanization."""
    if not req.text.strip():
        raise HTTPException(400, "Text is empty")
    if not req.together_api_key.strip():
        raise HTTPException(400, "Together AI API key is required")

    try:
        result = await translate_via_chinese(
            req.text,
            together_api_key=req.together_api_key,
            model=req.model,
        )
    except Exception as e:
        logger.error(f"Translate failed: {e}", exc_info=True)
        raise HTTPException(502, f"Translation error: {str(e)}")

    logger.info(f"Translate: {result['changed']}/{result['total']} sentences differ")
    return result


@router.post("/pipeline")
async def pipeline(req: AnalyzeRequest):
    """Perturb + Google Translate word-level finish. No LLM, no API key."""
    if not req.text.strip():
        raise HTTPException(400, "Text is empty")

    try:
        result = humanize_pipeline(req.text)
    except Exception as e:
        logger.error(f"Pipeline failed: {e}", exc_info=True)
        raise HTTPException(502, f"Pipeline error: {str(e)}")

    logger.info(f"Pipeline: {result['changed']}/{result['total']} sentences, "
                f"{result['perturb_changes']} perturb + {result['google_changes']} google")
    return result


@router.post("/translate-google")
async def translate_google(req: AnalyzeRequest):
    """English → Chinese → English via Google Translate (no LLM, no API key)."""
    if not req.text.strip():
        raise HTTPException(400, "Text is empty")

    try:
        result = translate_via_google(req.text)
    except Exception as e:
        logger.error(f"Google Translate failed: {e}", exc_info=True)
        raise HTTPException(502, f"Google Translate error: {str(e)}")

    logger.info(f"Google Translate: {result['changed']}/{result['total']} sentences differ")
    return result


@router.post("/rewrite")
async def rewrite(req: RewriteRequest):
    """Full pipeline: analyze (display) → rewrite ALL sentences via cross-model paraphrase."""
    if not req.text.strip():
        raise HTTPException(400, "Text is empty")
    if not req.together_api_key.strip():
        raise HTTPException(400, "Together AI API key is required")

    # Step 1: analyze (for display only)
    analysis = analyze_text(req.text)
    sentences = split_sentences(req.text)

    # Step 2: rewrite ALL sentences — no threshold gating
    all_sentences = [{"index": i, "text": s} for i, s in enumerate(sentences)]
    logger.info(f"Sending {len(all_sentences)} sentences to rewrite via {req.model}")

    try:
        rewrites = await rewrite_sentences(
            all_sentences,
            together_api_key=req.together_api_key,
            model=req.model,
        )
    except Exception as e:
        logger.error(f"Rewrite failed: {e}", exc_info=True)
        raise HTTPException(502, f"Rewrite model error: {str(e)}")

    logger.info(f"Got {len(rewrites)} rewrites back")

    # Step 3: assemble
    result_text = assemble_result(sentences, rewrites)

    return {
        "analysis": analysis,
        "rewrites": rewrites,
        "result_text": result_text,
        "message": f"Rewrote {len(rewrites)}/{len(sentences)} sentences.",
    }
