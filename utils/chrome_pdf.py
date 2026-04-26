"""Chrome-based PDF generation via Playwright (headless Chromium).

Loads a frontend URL (the /resume/:id/print route) and prints THAT to PDF.
This is the single-source-of-truth approach: editor and PDF render through
the EXACT same React + TipTap + CSS code path. Whatever you see in the
browser's editor canvas is bit-for-bit what comes out of the PDF.

Cost: spawning Chromium per request is ~500 ms cold / ~200 ms warm. For a
single-user dev tool this is fine. Could keep a browser warm if needed.
"""
from typing import Optional

from playwright.async_api import async_playwright


async def url_to_pdf_chrome(url: str) -> Optional[bytes]:
    """Load `url` in headless Chromium and return its rendered PDF bytes.

    The page is expected to set `document.body.dataset.printReady = "true"`
    once it's done rendering — Playwright waits for this before printing
    so we don't capture a half-loaded canvas.
    """
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            try:
                page = await browser.new_page()
                # networkidle waits for the page's own fetches (resume API,
                # web fonts) to settle.
                await page.goto(url, wait_until="networkidle")
                # Belt-and-suspenders: explicitly wait for our ready flag
                # AND the document.fonts API.
                try:
                    await page.wait_for_selector(
                        'body[data-print-ready="true"]',
                        timeout=10_000,
                    )
                except Exception:
                    # Fall back to a short delay rather than failing — the
                    # page might just not have set the flag.
                    await page.wait_for_timeout(500)
                await page.evaluate("document.fonts.ready")
                # Per-page margin via Chromium (NOT canvas padding). The
                # print stylesheet zeros the canvas's vertical padding so
                # this is the SINGLE source of vertical margin — every PDF
                # page gets the same 0.75in top + 0.75in bottom whitespace
                # (Google Docs style). Horizontal margin still comes from
                # the canvas's own 0.9in horizontal padding so the content
                # column width matches the editor view exactly.
                pdf = await page.pdf(
                    format="Letter",
                    print_background=True,
                    margin={"top": "0.75in", "bottom": "0.75in", "left": "0", "right": "0"},
                    prefer_css_page_size=False,
                )
                return pdf
            finally:
                await browser.close()
    except Exception as e:  # noqa: BLE001
        print(f"[DEBUG] Chrome PDF conversion error: {e}")
        return None
