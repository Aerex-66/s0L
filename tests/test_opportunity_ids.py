import pytest

from core.shared.opportunity_ids import canonical_id, parse_cell

ID15 = '006A0000006Vm9r'
ID18 = '006A0000006Vm9rIAC'


def test_short_id_gains_its_suffix():
    assert canonical_id(ID15) == ID18


def test_wrong_letter_case_is_restored_from_the_suffix():
    assert canonical_id('006a0000006vM9RIAC') == ID18
    assert canonical_id('006A0000006Vm9riac') == ID18


@pytest.mark.parametrize('text', ['0061234', '001A0000006Vm9rIAC', '006A0000006Vm9rIA!', '', None])
def test_anything_else_is_not_an_id(text):
    assert canonical_id(text) is None


@pytest.mark.parametrize('cell,expected', [
    (ID18, ('id', ID18)),
    (f'  {ID15} ', ('id', ID18)),
    (f'{ID18} (renewal)', ('id_with_text', ID18)),
    (f'XXX#{ID18}', ('id_with_text', ID18)),
    (f'{ID18} / 006B0000006Vm9rIAC', ('two_ids', None)),
    (f'{ID18} / {ID15}', ('id_with_text', ID18)),
    ('TBD', ('not_an_id', None)),
    ('', ('not_an_id', None)),
    (None, ('not_an_id', None)),
])
def test_parse_cell(cell, expected):
    assert parse_cell(cell) == expected
