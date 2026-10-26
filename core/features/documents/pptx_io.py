"""
PPTX file I/O — package summaries, stored copies, path resolution, and
raw find/replace writing. No deal/JSON-store knowledge lives here.
"""
import logging
import os
import re
import shutil
import uuid
import zipfile

from defusedxml import ElementTree as ET
from werkzeug.utils import secure_filename

from core.shared.state import DOCUMENTS_ROOT

_logger = logging.getLogger(__name__)

# Repo root (three levels up from core/features/documents/).
# NOTE: the pre-refactor code computed this as two levels up, which resolved
# to core/ — breaking resolve_local_source_path and producing '..' relative paths.
WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

_A_NS = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
_SLIDE_PATH_PATTERN = re.compile(r'^ppt/slides/slide(\d+)\.xml$')


def _extract_slide_index(slide_path):
    match = _SLIDE_PATH_PATTERN.match(slide_path)
    if not match:
        return None
    return int(match.group(1))


def pptx_summary_from_path(file_path, doc_id=None):
    """Read slide titles/text previews and package stats from a .pptx."""
    with zipfile.ZipFile(file_path, 'r') as archive:
        names = archive.namelist()
        slide_paths = sorted(
            [name for name in names if _SLIDE_PATH_PATTERN.match(name)],
            key=lambda name: _extract_slide_index(name) or 0
        )

        slides = []
        for idx, slide_path in enumerate(slide_paths, start=1):
            try:
                xml_bytes = archive.read(slide_path)
                root = ET.fromstring(xml_bytes)
                text_nodes = [node.text or '' for node in root.iter(f'{_A_NS}t')]
                text_nodes = [text.strip() for text in text_nodes if text and text.strip()]
            except Exception as e:
                _logger.error("Failed to parse slide XML from %s: %s", slide_path, e)
                text_nodes = []

            title = text_nodes[0] if text_nodes else f'Slide {idx}'
            preview = ' '.join(text_nodes[:10])[:280]

            image_url = f'/api/documents/slides/{doc_id}/{idx}' if doc_id else None

            slides.append({
                'index': idx,
                'path': slide_path,
                'title': title,
                'text_preview': preview,
                'text_count': len(text_nodes),
                'image_url': image_url,
            })

        media_files = [name for name in names if name.startswith('ppt/media/')]
        layouts = [name for name in names if name.startswith('ppt/slideLayouts/') and name.endswith('.xml')]
        masters = [name for name in names if name.startswith('ppt/slideMasters/') and name.endswith('.xml')]

        return {
            'format': 'pptx',
            'slide_count': len(slides),
            'slides': slides,
            'media_count': len(media_files),
            'layout_count': len(layouts),
            'master_count': len(masters),
        }


def resolve_local_source_path(path_value):
    """Only allow paths inside the workspace root."""
    requested = os.path.realpath(os.path.abspath(path_value))
    if not requested.startswith(WORKSPACE_ROOT + os.sep) and requested != WORKSPACE_ROOT:
        return None
    return requested


def persist_document_copy(source_path, original_name=None):
    """Copy a source file into the documents store with a unique name."""
    os.makedirs(DOCUMENTS_ROOT, exist_ok=True)

    safe_name = secure_filename(original_name or os.path.basename(source_path) or 'document.bin')
    token = uuid.uuid4().hex[:12]
    stored_name = f'{token}_{safe_name}'
    destination = os.path.join(DOCUMENTS_ROOT, stored_name)
    shutil.copy2(source_path, destination)
    return destination


def normalize_replacements(payload_replacements):
    """Accept dict or list-of-{token,value} payloads; return a str→str dict."""
    if isinstance(payload_replacements, dict):
        return {str(key): str(value) for key, value in payload_replacements.items()}

    if isinstance(payload_replacements, list):
        normalized = {}
        for entry in payload_replacements:
            if not isinstance(entry, dict):
                continue
            token = entry.get('token')
            value = entry.get('value')
            if token is None:
                continue
            normalized[str(token)] = '' if value is None else str(value)
        return normalized

    return {}


def write_pptx_with_replacements(source_path, destination_path, replacements):
    """Clone a .pptx applying plain-text find/replace across slide and
    notes XML. Returns the number of changed files."""
    changed_files = 0
    slide_xml_pattern = re.compile(r'^ppt/slides/slide\d+\.xml$')
    notes_xml_pattern = re.compile(r'^ppt/notesSlides/notesSlide\d+\.xml$')

    # Sanitise replacement values: cap length to prevent DoS via bloated XML
    MAX_REPLACEMENT_LEN = 10_000
    safe_replacements = {}
    if replacements:
        for token, value in replacements.items():
            v = str(value) if value is not None else ''
            safe_replacements[str(token)] = v[:MAX_REPLACEMENT_LEN]

    with zipfile.ZipFile(source_path, 'r') as src_zip:
        with zipfile.ZipFile(destination_path, 'w') as out_zip:
            for item in src_zip.infolist():
                raw = src_zip.read(item.filename)

                if safe_replacements and (slide_xml_pattern.match(item.filename) or notes_xml_pattern.match(item.filename)):
                    try:
                        text = raw.decode('utf-8')
                        updated = text
                        for token, value in safe_replacements.items():
                            updated = updated.replace(token, value)
                        if updated != text:
                            changed_files += 1
                            raw = updated.encode('utf-8')
                    except UnicodeDecodeError as e:
                        _logger.warning("Unicode decode error matching %s: %s", item.filename, e)

                out_zip.writestr(item, raw)

    return changed_files
