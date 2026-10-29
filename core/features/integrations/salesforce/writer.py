"""The only code that stores Salesforce-owned fields on a deal."""
from core.shared import field_index as fi
from core.features.deals.writes import apply_deal_write, prepare_deal_write


def _store(deal, changes):
    prepared, error = prepare_deal_write(deal, changes, owners={'salesforce'}, enforce_required=False)
    if error:
        raise ValueError(error[1])
    apply_deal_write(deal, prepared)


def _fills(key):
    entry = fi.FIELDS.get(key) or {}
    return entry.get('owner') == 'salesforce' and bool(entry.get('editable_until_linked'))


def write_found(deal, salesforce_id, values, *, checked_at):
    """Store the opportunity Salesforce returned. A blank never replaces a field s0L may edit; a value does, and
    takes the field over. Returns the typed values a Salesforce value replaced."""
    previously = set(deal.get('salesforce_supplied') or ())
    changes, supplied, replaced = {}, [], []
    for key, value in values.items():
        if _fills(key):
            if not value:
                continue
            supplied.append(key)
            old = str(deal.get(key) or '')
            if old and old != value and key not in previously:
                replaced.append({'deal_id': deal.get('id'), 'key': key, 'label': fi.FIELDS[key]['label'], 'old': old})
        changes[key] = value
    changes.update(salesforce_id=salesforce_id, salesforce_lookup='found', salesforce_checked_at=checked_at,
                   salesforce_supplied=sorted(supplied))
    _store(deal, changes)
    return replaced


def write_lookup(deal, lookup, *, checked_at):
    """Store a check that found no opportunity; earlier Salesforce values stay as they were."""
    _store(deal, {'salesforce_lookup': lookup, 'salesforce_checked_at': checked_at})
