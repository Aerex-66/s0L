"""
Write down what the signed-in Salesforce account can reach: `npm run salesforce:inventory`
writes docs/salesforce/inventory.md. It only describes objects and fields (names, labels,
types, pick-list values) and never reads a record, so no deal values can end up in the file.
"""
import argparse
import os
import re
import sys
from datetime import date

from core.features.integrations.salesforce import client, oauth

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
DEFAULT_OUT = os.path.join(ROOT, 'docs', 'salesforce', 'inventory.md')
_INTERESTING = re.compile(r'greenstar|estimat', re.IGNORECASE)


def _cell(value):
    return str(value or '').replace('|', '\\|').replace('\n', ' ') or '—'


def _code(value):
    return f'`{value}`' if value else '—'


def _field_table(described):
    lines = ['| API name | Label | Type | Pick-list values |', '|---|---|---|---|']
    for field in sorted(described.get('fields') or [], key=lambda f: f.get('name') or ''):
        values = [v.get('value') for v in field.get('picklistValues') or [] if v.get('active') and v.get('value')]
        lines.append(f"| {_code(field.get('name'))} | {_cell(field.get('label'))} | {_cell(field.get('type'))} | {_cell(', '.join(values))} |")
    return lines


def build_inventory(objects, describe, *, written_for=''):
    """Markdown listing every queryable object, Opportunity's child records, and the fields of the objects that matter."""
    queryable = sorted((o for o in objects() if o.get('queryable')), key=lambda o: o.get('name') or '')
    by_name = {o.get('name'): o for o in queryable}
    opportunity = describe('Opportunity')
    children = sorted(opportunity.get('childRelationships') or [], key=lambda c: c.get('childSObject') or '')

    detailed = ['Opportunity', 'Account']
    for child in children:
        name = child.get('childSObject')
        if (by_name.get(name) or {}).get('custom') and name not in detailed:
            detailed.append(name)
    for obj in queryable:
        name = obj.get('name')
        if name not in detailed and (_INTERESTING.search(name or '') or _INTERESTING.search(obj.get('label') or '')):
            detailed.append(name)

    lines = ['# What s0L can reach in Salesforce', '',
             f'Written by `npm run salesforce:inventory` on {date.today().isoformat()}{written_for}. '
             'Object and field names only, never record values.', '',
             f'## Objects ({len(queryable)})', '', '| API name | Label | Custom |', '|---|---|---|']
    lines += [f"| {_code(o.get('name'))} | {_cell(o.get('label'))} | {'yes' if o.get('custom') else ''} |" for o in queryable]
    lines += ['', "## Opportunity's child records", '', '| Relationship | Object | Field on the child |', '|---|---|---|']
    lines += [f"| {_code(c.get('relationshipName'))} | {_code(c.get('childSObject'))} | {_code(c.get('field'))} |" for c in children]
    for name in detailed:
        described = opportunity if name == 'Opportunity' else describe(name)
        lines += ['', f"## {name} · {_cell(described.get('label'))}", '', *_field_table(described)]
    return '\n'.join(lines) + '\n'


def main(argv=None):
    parser = argparse.ArgumentParser(description='Write down what the signed-in Salesforce account can reach.')
    parser.add_argument('--out', default=DEFAULT_OUT, help='where to write the markdown')
    args = parser.parse_args(argv)
    state = oauth.status()
    who = (state.get('user') or {}).get('name')
    written_for = f" for {state['host']}" if state.get('host') else ''
    if who:
        written_for += f', signed in as {who}'
    try:
        text = build_inventory(client.objects, client.describe, written_for=written_for)
    except client.SalesforceError as error:
        print(error)
        return 1
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as handle:
        handle.write(text)
    print(f'Wrote {os.path.abspath(args.out)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
