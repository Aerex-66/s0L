"""
Slide rendering service — converts PPTX files to per-slide JPEG images with
PowerPoint (when installed) or LibreOffice + pdftoppm, with an async render
queue and status registry.
"""
import glob
import logging
import os
import shutil
import subprocess
import sys
import threading
from contextlib import contextmanager

from core.shared.state import DOCUMENTS_ROOT

_logger = logging.getLogger(__name__)

_render_lock = threading.Lock()
_render_status = {}  # doc_id -> 'pending' | 'done' | 'error'
_powerpoint_lock = threading.Lock()

_SOFFICE_BIN = shutil.which('soffice') or shutil.which('libreoffice')
_PDFTOPPM_BIN = shutil.which('pdftoppm')

_MSO_TRUE, _MSO_FALSE = -1, 0


def powerpoint_available():
    if sys.platform != 'win32':
        return False
    try:
        import comtypes.client  # noqa: F401
        import winreg
        winreg.CloseKey(winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, r'PowerPoint.Application\CLSID'))
    except (ImportError, OSError):
        return False
    return True


@contextmanager
def _com_apartment():
    import comtypes
    comtypes.CoInitialize()
    try:
        yield
    finally:
        comtypes.CoUninitialize()


def _open_powerpoint():
    """Attach to the user's PowerPoint if it's running, else start one; True when this call started it."""
    import comtypes
    import comtypes.client
    try:
        return comtypes.client.GetActiveObject('PowerPoint.Application', dynamic=True), False
    except (OSError, comtypes.COMError):
        return comtypes.client.CreateObject('PowerPoint.Application', dynamic=True), True


def render_with_powerpoint(pptx_path, output_dir, width=1280):
    """Export every slide as slide-001.jpg, slide-002.jpg… without touching decks the user has open."""
    os.makedirs(output_dir, exist_ok=True)
    with _powerpoint_lock, _com_apartment():
        return _export_with_powerpoint(os.path.abspath(pptx_path), output_dir, width)


def _export_with_powerpoint(pptx_path, output_dir, width):
    app, started = _open_powerpoint()
    try:
        presentation = app.Presentations.Open(pptx_path, _MSO_TRUE, _MSO_FALSE, _MSO_FALSE)
        try:
            setup = presentation.PageSetup
            height = round(width * setup.SlideHeight / setup.SlideWidth)
            images = []
            for number in range(1, presentation.Slides.Count + 1):
                path = os.path.join(output_dir, f'slide-{number:03d}.jpg')
                presentation.Slides.Item(number).Export(path, 'JPG', width, height)
                images.append(path)
            return images
        finally:
            presentation.Close()
    finally:
        if started and app.Presentations.Count == 0:
            app.Quit()


def render_slide_images(pptx_path, output_dir, dpi=96):
    """Convert PPTX to per-slide JPEG images: PowerPoint first, then LibreOffice + pdftoppm."""
    if powerpoint_available():
        try:
            return render_with_powerpoint(pptx_path, output_dir)
        except Exception as exc:
            _logger.warning('PowerPoint could not render %s: %s', pptx_path, exc)
    if _SOFFICE_BIN and _PDFTOPPM_BIN:
        return _render_with_libreoffice(pptx_path, output_dir, dpi)
    _logger.warning('Slide rendering unavailable: no PowerPoint, and soffice=%s, pdftoppm=%s',
                    _SOFFICE_BIN, _PDFTOPPM_BIN)
    return []


def _render_with_libreoffice(pptx_path, output_dir, dpi):
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
