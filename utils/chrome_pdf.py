"""Chrome-based PDF generation via Playwright (headless Chromium).

Architecture (v2 — print route paginates itself):
    1. Playwright loads the frontend's /resume/:id/print URL.
    2. The route renders TipTap (editable=false) and runs its own
       pagination logic, applying @page CSS (size, margins, break rules)
       directly in the document.
    3. Once pagination completes, the route sets
       body[data-paginated="true"].
    4. Playwright waits for that flag, then calls page.pdf() with
       margin: 0 and prefer_css_page_size=True so Chromium honors the
       document's @page size/margins (no Letter override).

Same render path → editor preview (iframing this URL) and exported PDF
are guaranteed identical.
"""
from typing import Optional

from playwright.async_api import async_playwright


async def url_to_pdf_chrome(url: str) -> Optional[bytes]:
    """Load `url` in headless Chromium, wait for pagination, return PDF bytes."""
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            try:
                page = await browser.new_page()
                await page.goto(url, wait_until="networkidle", timeout=30_000)

                # The print route sets body[data-paginated="true"] once it
                # has finished laying out content into pages. Wait up to 30s
                # for long docs.
                try:
                    await page.wait_for_selector(
                        'body[data-paginated="true"]',
                        timeout=30_000,
                    )
                except Exception:
                    print("[chrome_pdf] timed out waiting for pagination, falling back")
                    await page.wait_for_timeout(1000)

                await page.evaluate("document.fonts.ready")

                # margin: 0 — the document's @page rules already inset
                # content per page. prefer_css_page_size=True lets the
                # CSS @page size win (no hardcoded Letter override).
                pdf = await page.pdf(
                    print_background=True,
                    margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
                    prefer_css_page_size=True,
                )
                return pdf
            finally:
                await browser.close()
    except Exception as e:  # noqa: BLE001
        print(f"[DEBUG] Chrome PDF conversion error: {e}")
        return None
