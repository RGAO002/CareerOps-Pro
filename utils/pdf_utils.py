"""
PDF Utilities - HTML to PDF conversion

Uses a threading lock to prevent concurrent WeasyPrint calls,
which can cause malloc crashes in the underlying C libraries (cairo/pango).
"""
import threading

from weasyprint import HTML

_pdf_lock = threading.Lock()


def convert_html_to_pdf(source_html):
    """Convert HTML string to PDF bytes (thread-safe)."""
    try:
        with _pdf_lock:
            return HTML(string=source_html).write_pdf()
    except Exception as e:
        print(f"[DEBUG] PDF conversion error: {e}")
        return None
