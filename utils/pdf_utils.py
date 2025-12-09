"""
PDF Utilities - HTML to PDF conversion
"""
from weasyprint import HTML


def convert_html_to_pdf(source_html):
    """Convert HTML string to PDF bytes."""
    try:
        return HTML(string=source_html).write_pdf()
    except Exception as e:
        print(f"[DEBUG] PDF conversion error: {e}")
        return None
