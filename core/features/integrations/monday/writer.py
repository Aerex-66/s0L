"""The only code that stores monday-owned fields on a deal."""
from core.features.deals.writes import apply_deal_write, prepare_deal_write


def write_monday_fields(deal, values, *, synced_at=None):
    """Store board values on a deal; synced_at marks a full board sync (a cell s0L just changed passes none)."""
    changes, error = prepare_deal_write(deal, values, owners={'monday'}, enforce_required=False)
    if error:
        raise ValueError(error[1])
    apply_deal_write(deal, changes)
    if synced_at:
        deal['monday_synced_at'] = synced_at
        deal.pop('monday_missing_since', None)
