"""Chrome-based PDF generation via Playwright (headless Chromium).

Architecture (Paged.js polyfill path):
    1. Playwright loads the frontend's /resume/:id/print URL.
    2. The route renders TipTap (editable=false) into the body, then loads
       /paged.polyfill.js via <Script>. The polyfill rewrites body content
       into <div class="pagedjs_page"> page cards, applying @page CSS
       (size, margins, break rules).
    3. The polyfill's `after` hook sets body[data-paged-ready="true"]
       once pagination completes.
    4. Playwright waits for that flag, then calls page.pdf() with margin: 0
       (Paged.js has already inset content per @page; adding more margin
       would double-margin and overflow).

Same polyfill, same render → editor preview (iframing this URL) and
exported PDF are guaranteed identical.
"""
from typing import Optional

from playwright.async_api import async_playwright


async def url_to_pdf_chrome(url: str) -> Optional[bytes]:
    """Load `url` in headless Chromium, wait for Paged.js, return PDF bytes."""
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            try:
                page = await browser.new_page()
                await page.goto(url, wait_until="networkidle", timeout=30_000)

                # Paged.js polyfill sets body[data-paged-ready="true"] from
                # its `after` hook. Generous timeout because the polyfill is
                # 900KB and pagination can take several seconds for long docs.
                try:
                    await page.wait_for_selector(
                        'body[data-paged-ready="true"]',
                        timeout=20_000,
                    )
                except Exception:
                    print("[chrome_pdf] timed out waiting for paged.js, falling back")
                    await page.wait_for_timeout(1000)

                await page.evaluate("document.fonts.ready")

                # margin: 0 — Paged.js's @page rules already inset content
                # within each pagedjs_page card. Chromium just stamps each
                # card to a PDF page directly.
                pdf = await page.pdf(
                    format="Letter",
                    print_background=True,
                    margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
                    prefer_css_page_size=False,
                )
                return pdf
            finally:
                await browser.close()
    except Exception as e:  # noqa: BLE001
        print(f"[DEBUG] Chrome PDF conversion error: {e}")
        return None
