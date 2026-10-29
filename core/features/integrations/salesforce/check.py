"""
Board deals -> their Salesforce opportunities. Every deal still on the monday
board is looked up by the opportunity number in its row, and Salesforce's
answer is stored through writer.py.
"""
from core.shared.opportunity_ids import parse_cell
from core.features.integrations.salesforce import writer


def board_deals(data):
    return [deal for deal in data.get('deals', []) if deal.get('monday_item_id') and not deal.get('monday_missing_since')]


def last_check(data):
    stamps = [deal['salesforce_checked_at'] for deal in data.get('deals', []) if deal.get('salesforce_checked_at')]
    return max(stamps) if stamps else None


def board_ids(data):
    """The 18-character IDs the board's cells name, one lookup each."""
    cells = (parse_cell(deal.get('opportunity_number')) for deal in board_deals(data))
    return sorted({canonical for _, canonical in cells if canonical})


def check_deals(data, found, *, now_iso):
    """Store Salesforce's answers ({18-character id: values}) on every board deal; returns a summary."""
    parsed = [(deal, *parse_cell(deal.get('opportunity_number'))) for deal in board_deals(data)]
    summary = {'checked': len(parsed), 'found': 0, 'not_returned': 0, 'not_an_id': 0, 'two_ids': 0, 'replaced': []}
    for deal, kind, canonical in parsed:
        if canonical in found:
            summary['replaced'].extend(writer.write_found(deal, canonical, found[canonical], checked_at=now_iso))
            summary['found'] += 1
            continue
        lookup_state = 'not_returned' if canonical else kind
        writer.write_lookup(deal, lookup_state, checked_at=now_iso)
        summary[lookup_state] += 1
    return summary
