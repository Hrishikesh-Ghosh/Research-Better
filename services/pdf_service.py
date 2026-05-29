import fitz  # PyMuPDF
import os


def extract_text_from_pdf(file_path: str) -> str:
    """
    Extract all text from a PDF file using PyMuPDF.
    Returns the full text as a single string.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"PDF not found: {file_path}")

    doc = fitz.open(file_path)
    full_text = []

    for page_num, page in enumerate(doc):
        text = page.get_text("text", flags=fitz.TEXT_PRESERVE_WHITESPACE)
        if text.strip():
            full_text.append(f"[Page {page_num + 1}]\n{text}")

    doc.close()

    if not full_text:
        raise ValueError("Could not extract text from PDF. It may be a scanned/image-only PDF.")

    return "\n\n".join(full_text)


def get_pdf_metadata(file_path: str) -> dict:
    """Extract basic metadata from a PDF."""
    doc = fitz.open(file_path)
    meta = doc.metadata or {}
    page_count = len(doc)
    doc.close()

    return {
        "title":    meta.get("title", ""),
        "author":   meta.get("author", ""),
        "subject":  meta.get("subject", ""),
        "pages":    page_count,
    }