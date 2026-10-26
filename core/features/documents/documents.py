"""
Documents blueprint — thin HTTP routes for document upload, extraction,
rendering, export, and cloud sync. Business logic lives in:
  pptx_io.py      — package summaries, stored copies, find/replace writes
  isbd_extract.py — iSBD field extraction from PPTX
  isbd_export.py  — iSBD PPTX export incl. native Gantt rendering
  slide_render.py — async LibreOffice slide-to-JPEG rendering
  records.py      — deal ↔ document linkage in the JSON store
  onedrive.py     — Windows registry OneDrive discovery
"""
import glob
import logging
import os
import shutil
import tempfile
import uuid
import zipfile
from datetime import datetime

from flask import Blueprint, jsonify, request, send_file
from werkzeug.utils import secure_filename

from core.shared.state import load_data, save_data, get_deal_by_id, DOCUMENTS_ROOT
from core.features.documents.pptx_io import (
    WORKSPACE_ROOT,
    normalize_replacements,
    persist_document_copy,
    pptx_summary_from_path,
    resolve_local_source_path,
    write_pptx_with_replacements,
)
from core.features.documents.isbd_extract import extract_isbd_fields
from core.features.documents.isbd_export import export_isbd_pptx
from core.features.documents.slide_render import get_render_status, start_render
from core.features.documents.records import (
    find_document_by_id,
    link_document_to_deal,
    store_isbd_data_on_deal,
)
from core.features.documents.onedrive import discover_onedrive_roots as _discover_roots

_logger = logging.getLogger(__name__)

documents_blueprint = Blueprint('documents', __name__)

_ISBD_IMAGES_DIR = os.path.join(DOCUMENTS_ROOT, '_isbd_images')
_ALLOWED_IMAGE_EXT = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'}


# ═══════════════════════════════════════════════════════════════════
#  iSBD image upload / serve
# ═══════════════════════════════════════════════════════════════════

@documents_blueprint.route('/api/documents/isbd/image', methods=['POST'])
def upload_isbd_image():
    """Upload an image for an iSBD slide. Returns a stable URL to the stored file."""
    uploaded = request.files.get('file')
    if not uploaded or not uploaded.filename:
        return jsonify({'error': 'No image file provided'}), 400

    ext = os.path.splitext(uploaded.filename)[1].lower()
    if ext not in _ALLOWED_IMAGE_EXT:
        return jsonify({'error': f'Unsupported image type: {ext}'}), 400

    deal_id = request.form.get('deal_id', 'shared')
    slide_type = request.form.get('slide_type', 'unknown')

    # Store under _isbd_images/<deal_id>/
    dest_dir = os.path.join(_ISBD_IMAGES_DIR, secure_filename(str(deal_id)))
    os.makedirs(dest_dir, exist_ok=True)

    token = uuid.uuid4().hex[:8]
    safe_slide = secure_filename(slide_type)
    stored_name = f'{safe_slide}_{token}{ext}'
    dest_path = os.path.join(dest_dir, stored_name)
    uploaded.save(dest_path)

    serve_url = f'/api/documents/isbd/image/{secure_filename(str(deal_id))}/{stored_name}'
    return jsonify({'url': serve_url, 'filename': stored_name})


@documents_blueprint.route('/api/documents/isbd/image/<deal_id>/<filename>', methods=['GET'])
def serve_isbd_image(deal_id, filename):
    """Serve a previously-uploaded iSBD slide image."""
    safe_deal = secure_filename(deal_id)
    safe_name = secure_filename(filename)
    path = os.path.join(_ISBD_IMAGES_DIR, safe_deal, safe_name)
    if not os.path.isfile(path):
        return jsonify({'error': 'Image not found'}), 404

    ext = os.path.splitext(safe_name)[1].lower()
    mime_map = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml'}
    return send_file(path, mimetype=mime_map.get(ext, 'application/octet-stream'))


# ═══════════════════════════════════════════════════════════════════
#  iSBD export
# ═══════════════════════════════════════════════════════════════════

@documents_blueprint.route('/api/documents/isbd/export', methods=['POST'])
def export_isbd():
    payload = request.get_json(silent=True) or {}
    deal_id = payload.get('deal_id')
    isbd_data = payload.get('isbd_data') or {}

    if not deal_id:
        return jsonify({'error': 'deal_id required'}), 400

    data = load_data()
    deal = get_deal_by_id(data, deal_id)
    if not deal:
        return jsonify({'error': 'Deal not found'}), 404

    if not isbd_data:
        isbd_data = deal.get('isbd_data', {})

    source_doc = None
    for doc in reversed(deal.get('documents', [])):
        if doc.get('module') == 'isbd' and doc.get('stored_path'):
            path = doc['stored_path']
            if os.path.exists(path) and path.lower().endswith('.pptx'):
                source_doc = doc
                break

    if not source_doc:
        return jsonify({'error': 'No source iSBD PPTX found for this deal. Import one first.'}), 404

    try:
        output_path = export_isbd_pptx(source_doc['stored_path'], isbd_data, timelines=deal.get('timelines', []))
        client_name = deal.get('client_name', 'Deal').replace(' ', '_')
        opp_num = deal.get('opportunity_number', '')
        filename = f'iSBD_{client_name}_{opp_num}.pptx' if opp_num else f'iSBD_{client_name}.pptx'
        return send_file(
            output_path,
            mimetype='application/vnd.openxmlformats-officedocument.presentationml.presentation',
            as_attachment=True,
            download_name=filename,
        )
    except Exception as exc:
        return jsonify({'error': f'Export failed: {exc}'}), 500


# ═══════════════════════════════════════════════════════════════════
#  PPTX read / write / ingest
# ═══════════════════════════════════════════════════════════════════

def _process_pptx(source_path, original_name, deal_id, module_id, source_type):
    try:
        doc_id = uuid.uuid4().hex
        stored_path = persist_document_copy(source_path, original_name=original_name)
        relative_path = os.path.relpath(stored_path, WORKSPACE_ROOT)
        summary = pptx_summary_from_path(stored_path, doc_id=doc_id)

        # ── iSBD extraction & validation ──────────────────────
        extracted_fields = {}
        slide_titles = []
        not_applied = []

        if module_id == 'isbd':
            extracted_fields, slide_titles, is_valid, validation_msg = extract_isbd_fields(stored_path)

            if not is_valid:
                # Clean up the stored copy — reject invalid uploads
                try:
                    os.remove(stored_path)
                except OSError as e:
                    _logger.warning("Failed to remove invalid iSBD uploaded file %s: %s", stored_path, e)
                return jsonify({
                    'error': validation_msg or 'This file does not appear to be an iSBD document.',
                    'hint': 'Upload a PowerPoint file that contains standard iSBD sections like "Deal Profile Summary", "Executive Summary", "Risk Assessment", etc.',
                    'slide_titles_found': slide_titles[:10],
                }), 422

            # Store extracted fields on the deal for the editor
            not_applied = store_isbd_data_on_deal(deal_id, extracted_fields, doc_id)

        start_render(stored_path, doc_id)

        document_record = {
            'id': doc_id,
            'name': original_name,
            'module': module_id,
            'format': 'pptx',
            'stored_path': stored_path,
            'stored_relative_path': relative_path,
            'ingested_at': datetime.utcnow().isoformat() + 'Z',
            'source': source_type,
        }

        if module_id == 'isbd' and extracted_fields:
            document_record['extracted_field_count'] = len(extracted_fields)

        link_document_to_deal(deal_id, document_record)

        response = {
            'source': source_type,
            'filename' if source_type == 'upload' else 'path': original_name if source_type == 'upload' else source_path,
            'summary': summary,
            'document': document_record,
        }

        if module_id == 'isbd':
            response['extracted_fields'] = extracted_fields
            response['extracted_field_count'] = len(extracted_fields)
            response['not_applied'] = not_applied

        return jsonify(response)
    except zipfile.BadZipFile as e:
        _logger.error("Invalid .pptx package for %s: %s", source_path, e)
        return jsonify({'error': 'Invalid .pptx package'}), 400


@documents_blueprint.route('/api/documents/powerpoint/read', methods=['POST'])
def read_powerpoint_document():
    uploaded = request.files.get('file')

    if uploaded and uploaded.filename:
        filename = uploaded.filename
        if not filename.lower().endswith('.pptx'):
            return jsonify({'error': 'Only .pptx files are currently supported'}), 400

        deal_id = request.form.get('deal_id')
        module_id = request.form.get('module_id', 'isbd')

        with tempfile.NamedTemporaryFile(suffix='.pptx', delete=False) as temp:
            uploaded.save(temp.name)
            temp_path = temp.name

        try:
            return _process_pptx(temp_path, filename, deal_id, module_id, 'upload')
        finally:
            try:
                os.remove(temp_path)
            except OSError as e:
                _logger.warning("Failed to clean up temporary file %s: %s", temp_path, e)

    payload = request.get_json(silent=True) or {}
    source_path = payload.get('path')
    deal_id = payload.get('deal_id')
    module_id = payload.get('module_id', 'isbd')
    if not source_path:
        return jsonify({'error': 'Provide multipart file upload or JSON body with path'}), 400

    resolved = resolve_local_source_path(source_path)
    if not resolved:
        return jsonify({'error': 'Path outside workspace is not allowed'}), 403
    if not os.path.exists(resolved):
        return jsonify({'error': 'File not found'}), 404
    if not resolved.lower().endswith('.pptx'):
        return jsonify({'error': 'Only .pptx files are currently supported'}), 400

    return _process_pptx(resolved, os.path.basename(resolved), deal_id, module_id, 'path')


@documents_blueprint.route('/api/documents/powerpoint/write', methods=['POST'])
def write_powerpoint_document():
    payload = request.get_json(silent=True) or {}
    source_doc_id = payload.get('doc_id')
    replacements = normalize_replacements(payload.get('replacements'))
    module_id = payload.get('module_id', 'isbd')

    if not source_doc_id:
        return jsonify({'error': 'doc_id is required'}), 400

    data, deal, source_doc = find_document_by_id(source_doc_id)
    if not source_doc:
        return jsonify({'error': 'Source document not found'}), 404

    source_path = source_doc.get('stored_path')
    if not source_path or not os.path.exists(source_path):
        return jsonify({'error': 'Source file missing from disk'}), 404
    if not str(source_path).lower().endswith('.pptx'):
        return jsonify({'error': 'Only .pptx write is supported'}), 400

    source_name = source_doc.get('name', 'document.pptx')
    base_name, ext = os.path.splitext(source_name)
    previous_revision = int(source_doc.get('revision', 1) or 1)
    new_revision = previous_revision + 1
    versioned_name = f"{base_name}_v{new_revision}{ext or '.pptx'}"

    with tempfile.NamedTemporaryFile(suffix='.pptx', delete=False) as temp_out:
        temp_out_path = temp_out.name

    try:
        changed_files = write_pptx_with_replacements(source_path, temp_out_path, replacements)
        new_doc_id = uuid.uuid4().hex
        stored_path = persist_document_copy(temp_out_path, original_name=versioned_name)
        relative_path = os.path.relpath(stored_path, WORKSPACE_ROOT)
        summary = pptx_summary_from_path(stored_path, doc_id=new_doc_id)

        start_render(stored_path, new_doc_id)

        new_record = {
            'id': new_doc_id,
            'name': versioned_name,
            'module': module_id,
            'format': 'pptx',
            'stored_path': stored_path,
            'stored_relative_path': relative_path,
            'ingested_at': datetime.utcnow().isoformat() + 'Z',
            'source': 'write',
            'parent_document_id': source_doc_id,
            'revision': new_revision,
            'changed_files': changed_files,
        }

        if deal is not None:
            docs = deal.setdefault('documents', [])
            docs.append(new_record)
            save_data(data)

        return jsonify({
            'document': new_record,
            'summary': summary,
            'write': {
                'source_doc_id': source_doc_id,
                'new_doc_id': new_doc_id,
                'changed_files': changed_files,
                'replacement_count': len(replacements),
            }
        })
    finally:
        try:
            os.remove(temp_out_path)
        except OSError as e:
            _logger.warning("Failed to clean up temporary output file %s: %s", temp_out_path, e)


@documents_blueprint.route('/api/documents/ingest', methods=['POST'])
def ingest_document():
    uploaded = request.files.get('file')
    if not uploaded or not uploaded.filename:
        return jsonify({'error': 'Provide a document file upload'}), 400

    deal_id = request.form.get('deal_id')
    module_id = request.form.get('module_id', '')
    filename = uploaded.filename

    with tempfile.NamedTemporaryFile(suffix=os.path.splitext(filename)[1] or '.bin', delete=False) as temp:
        uploaded.save(temp.name)
        temp_path = temp.name

    try:
        stored_path = persist_document_copy(temp_path, original_name=filename)
        relative_path = os.path.relpath(stored_path, WORKSPACE_ROOT)
        document_record = {
            'id': uuid.uuid4().hex,
            'name': filename,
            'module': module_id,
            'format': (os.path.splitext(filename)[1] or '').lstrip('.').lower(),
            'stored_path': stored_path,
            'stored_relative_path': relative_path,
            'ingested_at': datetime.utcnow().isoformat() + 'Z',
            'source': 'upload',
        }
        link_document_to_deal(deal_id, document_record)
        return jsonify({'document': document_record})
    finally:
        try:
            os.remove(temp_path)
        except OSError as e:
            _logger.warning("Failed to clean up temporary file %s: %s", temp_path, e)


# ═══════════════════════════════════════════════════════════════════
#  Slide images & render status
# ═══════════════════════════════════════════════════════════════════

@documents_blueprint.route('/api/documents/slides/<doc_id>/<int:slide_number>', methods=['GET'])
def serve_slide_image(doc_id, slide_number):
    safe_id = secure_filename(doc_id)
    slides_dir = os.path.join(DOCUMENTS_ROOT, f'{safe_id}_slides')
    if not os.path.isdir(slides_dir):
        return jsonify({'error': 'Slide images not found'}), 404

    # try both 2-digit and 3-digit zero-padded names
    for pattern_name in [f'slide-{slide_number:02d}', f'slide-{slide_number:03d}']:
        for ext in ['jpg', 'jpeg', 'png']:
            path = os.path.join(slides_dir, f'{pattern_name}.{ext}')
            if os.path.exists(path):
                mime = 'image/jpeg' if ext in ('jpg', 'jpeg') else 'image/png'
                return send_file(path, mimetype=mime)

    return jsonify({'error': f'Slide {slide_number} image not found'}), 404


@documents_blueprint.route('/api/documents/render-status/<doc_id>', methods=['GET'])
def render_status(doc_id):
    status = get_render_status(doc_id)
    slides_dir = os.path.join(DOCUMENTS_ROOT, f'{secure_filename(doc_id)}_slides')
    slide_count = 0
    if status is None:
        if os.path.isdir(slides_dir) and glob.glob(os.path.join(slides_dir, 'slide-*')):
            status = 'done'
        else:
            status = 'unknown'
    if status == 'done' and os.path.isdir(slides_dir):
        slide_count = len(glob.glob(os.path.join(slides_dir, 'slide-*')))
    return jsonify({'doc_id': doc_id, 'status': status, 'slide_count': slide_count})


# ═══════════════════════════════════════════════════════════════════
#  Document records
# ═══════════════════════════════════════════════════════════════════

@documents_blueprint.route('/api/documents/<doc_id>', methods=['DELETE'])
def delete_document(doc_id):
    """Remove a document record from the deal (does NOT delete the original source file)."""
    data = load_data()
    for deal in data.get('deals', []):
        docs = deal.get('documents', [])
        for i, doc in enumerate(docs):
            if str(doc.get('id')) == str(doc_id):
                docs.pop(i)
                save_data(data)
                return jsonify({'ok': True, 'deleted': doc_id})
    return jsonify({'error': 'Document not found'}), 404


@documents_blueprint.route('/api/documents/download/<doc_id>', methods=['GET'])
def download_document(doc_id):
    data = load_data()
    for deal in data.get('deals', []):
        for doc in deal.get('documents', []):
            if doc.get('id') == doc_id:
                path = doc.get('stored_path', '')
                if os.path.exists(path):
                    return send_file(path, as_attachment=True, download_name=doc.get('name', 'document'))
                return jsonify({'error': 'File missing from disk'}), 404

    for entry in os.listdir(DOCUMENTS_ROOT):
        if entry.startswith(doc_id[:12]):
            full = os.path.join(DOCUMENTS_ROOT, entry)
            if os.path.isfile(full):
                return send_file(full, as_attachment=True, download_name=entry)

    return jsonify({'error': 'Document not found'}), 404


# ═══════════════════════════════════════════════════════════════════
#  OneDrive / local-folder sync
# ═══════════════════════════════════════════════════════════════════

@documents_blueprint.route('/api/documents/cloud-sync/discover', methods=['GET'])
def discover_onedrive_roots():
    """Auto-discover local OneDrive sync roots from the Windows registry."""
    try:
        roots = _discover_roots()
    except Exception as e:
        _logger.warning('OneDrive discovery failed: %s', e)
        roots = []

    # For each root, list top-level subdirectories so the user can pick one
    result = []
    for root in roots:
        folders = []
        try:
            for name in sorted(os.listdir(root['path'])):
                full = os.path.join(root['path'], name)
                if os.path.isdir(full):
                    folders.append(name)
        except OSError:
            pass
        result.append({**root, 'folders': folders})

    return jsonify(result)


@documents_blueprint.route('/api/documents/cloud-sync/browse', methods=['POST'])
def browse_sync_folder():
    """List subfolders and files at a local path (OneDrive sync root or subfolder)."""
    payload = request.json or {}
    folder_path = payload.get('path', '').strip()

    if not folder_path:
        return jsonify({'error': 'path is required'}), 400

    # Normalise and resolve
    folder_path = os.path.normpath(os.path.expanduser(folder_path))

    if not os.path.isdir(folder_path):
        return jsonify({'error': 'Folder does not exist'}), 404

    try:
        entries = []
        for name in sorted(os.listdir(folder_path)):
            full = os.path.join(folder_path, name)
            entry = {'name': name, 'is_dir': os.path.isdir(full)}
            if not entry['is_dir']:
                try:
                    entry['size'] = os.path.getsize(full)
                except OSError:
                    entry['size'] = 0
            entries.append(entry)
        return jsonify({'path': folder_path, 'entries': entries})
    except PermissionError:
        return jsonify({'error': 'Permission denied'}), 403


@documents_blueprint.route('/api/documents/<doc_id>/send-to-cloud', methods=['POST'])
def send_document_to_cloud(doc_id):
    """Copy a stored document to a local OneDrive sync folder."""
    payload = request.json or {}
    target_folder = payload.get('target_folder', '').strip()

    if not target_folder:
        return jsonify({'error': 'target_folder is required'}), 400

    target_folder = os.path.normpath(os.path.expanduser(target_folder))

    if not os.path.isdir(target_folder):
        return jsonify({'error': 'Target folder does not exist'}), 404

    # Find the document
    data = load_data()
    source_path = None
    doc_name = None
    for deal in data.get('deals', []):
        for doc in deal.get('documents', []):
            if str(doc.get('id')) == str(doc_id):
                source_path = doc.get('stored_path', '')
                doc_name = doc.get('name', 'document')
                break
        if source_path:
            break

    if not source_path or not os.path.isfile(source_path):
        return jsonify({'error': 'Document not found or file missing'}), 404

    dest_path = os.path.join(target_folder, doc_name)

    # Avoid overwriting: add suffix if file exists
    if os.path.exists(dest_path):
        base, ext = os.path.splitext(doc_name)
        counter = 1
        while os.path.exists(dest_path):
            dest_path = os.path.join(target_folder, f"{base} ({counter}){ext}")
            counter += 1

    try:
        shutil.copy2(source_path, dest_path)
    except PermissionError:
        return jsonify({'error': 'Permission denied writing to target folder'}), 403
    except OSError as e:
        return jsonify({'error': f'Copy failed: {e}'}), 500

    return jsonify({
        'ok': True,
        'dest_path': dest_path,
        'dest_name': os.path.basename(dest_path),
    })
