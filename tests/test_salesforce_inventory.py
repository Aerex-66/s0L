from core.features.integrations.salesforce import client, inventory


def _field(name, label, kind, picklist=()):
    return {'name': name, 'label': label, 'type': kind,
            'picklistValues': [{'value': value, 'active': True} for value in picklist] + [{'value': 'Old', 'active': False}]}


OBJECTS = [
    {'name': 'Opportunity', 'label': 'Opportunity', 'queryable': True, 'custom': False},
    {'name': 'Account', 'label': 'Account', 'queryable': True, 'custom': False},
    {'name': 'Estimate__c', 'label': 'Greenstar Estimate', 'queryable': True, 'custom': True},
    {'name': 'Pricing__c', 'label': 'Estimation Pricing', 'queryable': True, 'custom': True},
    {'name': 'Task', 'label': 'Task', 'queryable': True, 'custom': False},
    {'name': 'Hidden__c', 'label': 'Hidden', 'queryable': False, 'custom': True},
]
DESCRIBES = {
    'Opportunity': {'name': 'Opportunity', 'label': 'Opportunity',
                    'fields': [_field('StageName', 'Stage', 'picklist', ['Qualify', 'Won'])],
                    'childRelationships': [
                        {'childSObject': 'Estimate__c', 'field': 'Opportunity__c', 'relationshipName': 'Estimates__r'},
                        {'childSObject': 'Task', 'field': 'WhatId', 'relationshipName': 'Tasks'},
                    ]},
    'Account': {'name': 'Account', 'label': 'Account', 'fields': [_field('Name', 'Account Name', 'string')], 'childRelationships': []},
    'Estimate__c': {'name': 'Estimate__c', 'label': 'Greenstar Estimate',
                    'fields': [_field('Total__c', 'Total', 'currency'), _field('CurrencyIsoCode', 'Currency', 'picklist', ['USD', 'EUR'])],
                    'childRelationships': []},
    'Pricing__c': {'name': 'Pricing__c', 'label': 'Estimation Pricing', 'fields': [_field('Rate__c', 'Rate', 'number')],
                   'childRelationships': []},
}


def test_inventory_lists_objects_and_the_fields_that_matter():
    asked = []

    def describe(name):
        asked.append(name)
        return DESCRIBES[name]

    text = inventory.build_inventory(lambda: OBJECTS, describe)
    assert '`Opportunity`' in text and '`Task`' in text and 'Hidden__c' not in text
    assert '`StageName`' in text and 'Qualify, Won' in text and 'Old' not in text
    assert '`Total__c`' in text and 'USD, EUR' in text
    assert '`Rate__c`' in text
    assert '`Estimates__r`' in text and '`Tasks`' in text
    assert 'Task' not in asked


def test_inventory_never_reads_records(sf_vault, monkeypatch, tmp_path):
    def no_records(soql):
        raise AssertionError('the inventory must not read records')

    monkeypatch.setattr(client, 'query', no_records)
    monkeypatch.setattr(client, 'objects', lambda: OBJECTS)
    monkeypatch.setattr(client, 'describe', lambda name: DESCRIBES[name])
    target = tmp_path / 'inventory.md'
    assert inventory.main(['--out', str(target)]) == 0
    assert '`Total__c`' in target.read_text(encoding='utf-8')


def test_inventory_says_why_it_could_not_run(sf_vault, tmp_path, capsys):
    assert inventory.main(['--out', str(tmp_path / 'inventory.md')]) == 1
    assert 'Sign in to Salesforce' in capsys.readouterr().out
