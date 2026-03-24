"""
OCR utilities for MediRAG — handles scanned and aged clinical documents.

Detection logic:
  1. Try PyPDF text extraction first (fast, free, works for digital PDFs)
  2. If pages return < 50 chars average, treat as scanned → Cloud Vision OCR
  3. Cloud Vision handles printed text, semi-handwritten, mixed scripts
     (Hindi, Telugu, Tamil, Bengali, English — common in APAC clinical records)

Why Cloud Vision over Tesseract:
  - Tesseract fails on low-resolution scans (< 200 DPI) and handwriting
  - Cloud Vision handles mixed-language documents natively
  - No local dependencies to install in Docker / Cloud Run
  - Stays within the GCP stack already in use

HIPAA note:
  - Documents are sent to Cloud Vision transiently for OCR only
  - Not stored, not used for model training (Vision API default)
  - Same GCP project as the rest of the stack — no cross-boundary data transfer
"""

import io
import logging
import os
import re
from pathlib import Path

logger = logging.getLogger(__name__)

# Minimum average characters per page to be considered "digital" (has real text)
# A scanned page with no text layer returns empty string or stray chars
DIGITAL_TEXT_THRESHOLD = 50


def _is_scanned_pdf(raw_docs: list) -> bool:
    """
    Detect whether a PDF is a scanned image or a digital document.

    Args:
        raw_docs: Pages returned by PyPDFLoader

    Returns:
        True if the PDF appears to be scanned (needs OCR)
        False if it already has extractable text
    """
    if not raw_docs:
        return True

    total_chars = sum(len(page.page_content.strip()) for page in raw_docs)
    avg_chars   = total_chars / len(raw_docs)

    is_scanned = avg_chars < DIGITAL_TEXT_THRESHOLD
    logger.info(
        "PDF scan detection: avg_chars=%.1f per page → %s",
        avg_chars,
        "SCANNED (needs OCR)" if is_scanned else "DIGITAL (PyPDF sufficient)"
    )
    return is_scanned


def _sanitize_ocr_text(text: str) -> str:
    """
    Clean OCR output for clinical documents.
    Removes common OCR artefacts while preserving medical terms,
    numbers (critical for dosages and lab values), and punctuation.
    """
    # Remove non-printable control characters but keep newlines and tabs
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    # Collapse 3+ blank lines into 2 (preserve paragraph structure)
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Remove lines that are just noise (single chars, only special chars)
    lines = [l for l in text.splitlines() if len(l.strip()) > 2 or l.strip() == '']
    return '\n'.join(lines).strip()


def ocr_pdf_with_vision(file_path: str) -> list[dict]:
    """
    Extract text from a scanned PDF using Google Cloud Vision API.

    Converts each PDF page to an image, sends to Vision API,
    returns structured text with page numbers.

    Args:
        file_path: Absolute path to the PDF file

    Returns:
        List of dicts: [{page_number: int, text: str, confidence: float}]
        Returns empty list if Vision API is unavailable.

    Raises:
        ImportError: If pdf2image or google-cloud-vision not installed
    """
    try:
        import pdf2image
        from google.cloud import vision
    except ImportError as e:
        logger.error(
            "OCR dependencies missing: %s. "
            "Install: pip install pdf2image google-cloud-vision poppler-utils",
            e
        )
        return []

    results = []

    try:
        logger.info("Converting PDF to images for OCR: %s", file_path)

        # Convert PDF pages to PIL images (300 DPI recommended for OCR accuracy)
        # Higher DPI = better accuracy on aged/faded documents, slower processing
        images = pdf2image.convert_from_path(
            file_path,
            dpi=300,
            fmt='PNG',
            thread_count=2,
        )
        logger.info("Converted %d pages to images", len(images))

        client = vision.ImageAnnotatorClient()

        for page_num, image in enumerate(images, start=1):
            logger.info("OCR processing page %d/%d", page_num, len(images))

            # Convert PIL image to bytes for Vision API
            img_buffer = io.BytesIO()
            image.save(img_buffer, format='PNG')
            img_bytes = img_buffer.getvalue()

            vision_image = vision.Image(content=img_bytes)

            # DOCUMENT_TEXT_DETECTION is optimised for dense text like clinical docs
            # vs TEXT_DETECTION which is better for sparse text / signs / labels
            response = client.document_text_detection(image=vision_image)

            if response.error.message:
                logger.warning(
                    "Vision API error on page %d: %s",
                    page_num, response.error.message
                )
                results.append({
                    'page_number': page_num,
                    'text': '',
                    'confidence': 0.0,
                    'error': response.error.message,
                })
                continue

            full_text = response.full_text_annotation.text if response.full_text_annotation else ''
            clean_text = _sanitize_ocr_text(full_text)

            # Calculate average confidence from word-level annotations
            words      = [
                word
                for page in response.full_text_annotation.pages
                for block in page.blocks
                for para in block.paragraphs
                for word in para.words
            ]
            confidence = (
                sum(w.confidence for w in words) / len(words)
                if words else 0.0
            )

            logger.info(
                "Page %d: extracted %d chars (confidence: %.2f)",
                page_num, len(clean_text), confidence
            )

            results.append({
                'page_number': page_num,
                'text':        clean_text,
                'confidence':  round(confidence, 3),
            })

    except Exception as e:
        logger.error("OCR processing failed: %s", e, exc_info=True)

    return results


def extract_text_from_pdf(file_path: str, raw_docs: list) -> list[dict]:
    """
    Smart text extraction: PyPDF for digital PDFs, Cloud Vision for scanned.

    This is the single entry point called by ingest_document().
    Returns a unified format regardless of which method was used.

    Args:
        file_path: Path to the PDF
        raw_docs:  Pages already loaded by PyPDFLoader (may have empty text)

    Returns:
        List of dicts: [{page_number, text, source, confidence}]
        source is 'pypdf' or 'vision_ocr'
    """
    if not _is_scanned_pdf(raw_docs):
        # Digital PDF — PyPDF already got the text, just reformat
        logger.info("Using PyPDF extraction (digital PDF)")
        return [
            {
                'page_number': i + 1,
                'text':        page.page_content,
                'source':      'pypdf',
                'confidence':  1.0,
            }
            for i, page in enumerate(raw_docs)
            if page.page_content.strip()
        ]

    # Scanned document — use Cloud Vision OCR
    logger.info("Scanned PDF detected — switching to Cloud Vision OCR")
    ocr_results = ocr_pdf_with_vision(file_path)

    if not ocr_results:
        # Vision unavailable — fall back to whatever PyPDF got (may be partial)
        logger.warning(
            "Cloud Vision unavailable — falling back to PyPDF "
            "(text quality may be poor for scanned documents)"
        )
        return [
            {
                'page_number': i + 1,
                'text':        page.page_content,
                'source':      'pypdf_fallback',
                'confidence':  0.3,
            }
            for i, page in enumerate(raw_docs)
        ]

    # Add source metadata to OCR results
    for r in ocr_results:
        r['source'] = 'vision_ocr'
    return ocr_results
