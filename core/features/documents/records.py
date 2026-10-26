"""
Document records — deal ↔ document linkage in the JSON store.
"""
from core.shared.migrations import route_isbd_values
from core.shared.state import load_data, save_data, get_deal_by_id


def link_document_to_deal(deal_id, document_record):
    if not deal_id:
        return

    data = load_data()
    target = get_deal_by_id(data, deal_id)
    if not target:
        return

    docs = target.setdefault('documents', [])
    docs.append(document_record)
    save_data(data)


def find_document_by_id(doc_id):
    """Return (data, deal, doc) for a document id, or (data, None, None)."""
    data = load_data()
    for deal in data.get('deals', []):
        for doc in deal.get('documents', []):
            if str(doc.get('id')) == str(doc_id):
                return data, deal, doc
    return data, None, None


def apply_isbd_import(deal, fields):
    """Merge values extracted from an iSBD deck into a deal by owner: iSBD-only
    content into isbd_data, deal fields only where the deal is still empty.
    Returns the values that were not applied, each with a reason."""
    isbd_only, _, skipped = route_isbd_values(deal, fields)
    current = deal.get('isbd_data') if isinstance(deal.get('isbd_data'), dict) else {}
    deal['isbd_data'] = {**current, **isbd_only}
    return skipped


def store_isbd_data_on_deal(deal_id, extracted_fields, doc_id):
    """Apply an imported deck to its deal; returns the values not applied."""
    if not deal_id or not extracted_fields:
        return []
    data = load_data()
    target = get_deal_by_id(data, deal_id)
    if not target:
        return []
    skipped = apply_isbd_import(target, extracted_fields)
    target['isbd_data']['_source_doc_id'] = doc_id
    save_data(data)
    return skipped
