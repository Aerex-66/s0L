"""
Slide rendering service — converts PPTX files to per-slide JPEG images
via LibreOffice + pdftoppm, with an async render queue and status registry.
"""
import glob
import logging
import os
import shutil
import subprocess
import threading

from core.shared.state import DOCUMENTS_ROOT

_logger = logging.getLogger(__name__)

_render_lock = threading.Lock()
_render_status = {}  # doc_id -> 'pending' | 'done' | 'error'

_SOFFICE_BIN = shutil.which('soffice') or shutil.which('libreoffice')
_PDFTOPPM_BIN = shutil.which('pdftoppm')


def render_slide_images(pptx_path, output_dir, dpi=96):
    """Convert PPTX to per-slide JPEG images via LibreOffice + pdftoppm."""
    if not _SOFFICE_BIN or not _PDFTOPPM_BIN:
        _logger.warning("Slide rendering unavailable: soffice=%s, pdftoppm=%s", _SOFFICE_BIN, _PDFTOPPM_BIN)
        return []

    os.makedirs(output_dir, exist_ok=True)

    subprocess.run(
        [_SOFFICE_BIN, '--headless', '--convert-to', 'pdf', '--outdir', output_dir, pptx_path],
        capture_output=True, timeout=120,
    )

    pdf_files = glob.glob(os.path.join(output_dir, '*.pdf'))
    if not pdf_files:
        return []

    pdf_path = pdf_files[0]
    subprocess.run(
        [_PDFTOPPM_BIN, '-jpeg', '-r', str(dpi), pdf_path, os.path.join(output_dir, 'slide')],
        capture_output=True, timeout=120,
    )

    try:
        os.remove(pdf_path)
    except OSError as e:
        _logger.warning("Failed to remove intermediate PDF %s: %s", pdf_path, e)

    slide_images = sorted(glob.glob(os.path.join(output_dir, 'slide-*.jpg')))
    return slide_images


def _render_async(pptx_path, doc_id):
    """Render slides in a background thread so upload returns immediately."""
    render_dir = os.path.join(DOCUMENTS_ROOT, f'{doc_id}_slides')
    with _render_lock:
        if _render_status.get(doc_id) == 'pending':
            return  # Already rendering this doc
        _render_status[doc_id] = 'pending'
    try:
        render_slide_images(pptx_path, render_dir)
        with _render_lock:
            _render_status[doc_id] = 'done'
    except Exception as exc:
        _logger.error('Slide render failed for %s: %s', doc_id, exc)
        with _render_lock:
            _render_status[doc_id] = 'error'


def start_render(pptx_path, doc_id):
    """Kick off an async slide render in a daemon thread."""
    threading.Thread(target=_render_async, args=(pptx_path, doc_id), daemon=True).start()


def get_render_status(doc_id):
    """Return 'pending' | 'done' | 'error' | None for a document."""
    return _render_status.get(doc_id)
