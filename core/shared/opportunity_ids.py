"""
Salesforce opportunity IDs as people type them on the monday board. An ID is
15 characters (case-sensitive) or 18 (those 15 plus a suffix recording which
letters are capitals); opportunity IDs start with 006.
"""
import re

_SUFFIX = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'
_EXACT = re.compile(r'006[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?')
_INSIDE = re.compile(r'(?<![A-Za-z0-9])006[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?(?![A-Za-z0-9])')


def _suffix(id15):
    return ''.join(
        _SUFFIX[sum(1 << i for i, ch in enumerate(id15[start:start + 5]) if 'A' <= ch <= 'Z')]
        for start in (0, 5, 10)
    )


def canonical_id(text):
    """The 18-character form of a 15- or 18-character opportunity ID with its letters in the right case; None if it isn't one."""
    text = (text or '').strip()
    if not _EXACT.fullmatch(text):
        return None
    if len(text) == 15:
        return text + _suffix(text)
    suffix = text[15:].upper()
    if any(ch not in _SUFFIX for ch in suffix):
        return None
    chars = list(text[:15])
    for chunk, code in enumerate(suffix):
        bits = _SUFFIX.index(code)
        for i in range(5):
            pos = chunk * 5 + i
            chars[pos] = chars[pos].upper() if bits >> i & 1 else chars[pos].lower()
    id15 = ''.join(chars)
    # A suffix that marks a digit as a capital doesn't belong to these 15 characters.
    return id15 + suffix if _suffix(id15) == suffix else None


def parse_cell(text):
    """('id' | 'id_with_text' | 'two_ids' | 'not_an_id', canonical ID or None) for a board's opportunity-number cell."""
    text = (text or '').strip()
    exact = canonical_id(text)
    if exact:
        return 'id', exact
    found = list(dict.fromkeys(filter(None, (canonical_id(match) for match in _INSIDE.findall(text)))))
    if len(found) > 1:
        return 'two_ids', None
    return ('id_with_text', found[0]) if found else ('not_an_id', None)
