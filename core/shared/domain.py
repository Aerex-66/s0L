"""
Domain constants loader — exposes shared/domain_constants.json (phase
palette/codes, service areas) as Python constants. Shared with the frontend
via frontend/src/shared/constants/gssmFieldMap.js. Field definitions live in
shared/field_index.json (see core/shared/field_index.py).
"""
import json
import os

_SHARED_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), '..', '..', 'shared'
))


def _load_json(filename):
    path = os.path.join(_SHARED_DIR, filename)
    with open(path, 'r', encoding='utf-8') as fh:
        return json.load(fh)


_constants = _load_json('domain_constants.json')

# ── Phase / timeline constants ───────────────────────────────────
PHASE_PALETTE = _constants['phase_palette']            # code -> {label, color}
PHASE_CODE_TO_DEAL = _constants['phase_code_to_deal']  # code -> deal phase name
PHASE_NAME_TO_CODE = _constants['phase_name_to_code']  # phase name -> code

# code -> RRGGBB (no '#'), for python-pptx RGBColor
PHASE_COLORS_RGB = {
    code: meta['color'].lstrip('#').upper()
    for code, meta in PHASE_PALETTE.items()
}

# code -> human label
PHASE_LABELS = {code: meta['label'] for code, meta in PHASE_PALETTE.items()}

# ── Service areas ────────────────────────────────────────────────
SERVICE_AREAS = _constants['service_areas']  # code -> label
