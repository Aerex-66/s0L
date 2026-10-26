DEFAULT_APPROVERS = {
    'RTR_SAL': {'name': 'Michael Wolf', 'email': '', 'slack': '', 'phone': ''},
    'RTR_PAL': {'name': '', 'email': '', 'slack': '', 'phone': ''},
    'OTC_SAL': {'name': 'Sachin Chavan', 'email': '', 'slack': '', 'phone': ''},
    'OTC_PAL': {'name': '', 'email': '', 'slack': '', 'phone': ''},
    'PTP_Ariba_SAL': {'name': 'Dan C Berard / Matt Langer', 'email': '', 'slack': '', 'phone': ''},
    'PTP_Ariba_PAL': {'name': '', 'email': '', 'slack': '', 'phone': ''},
    'FTPL_SAL': {'name': 'Glenn E Ranchero', 'email': '', 'slack': '', 'phone': ''},
    'FTPL_PAL': {'name': '', 'email': '', 'slack': '', 'phone': ''},
    'Data_SAL': {'name': 'Satish M Hiranandani / Steve Herda', 'email': '', 'slack': '', 'phone': ''},
    'Data_PAL': {'name': '', 'email': '', 'slack': '', 'phone': ''},
    'Analytics_SAL': {'name': 'Satish M Hiranandani', 'email': '', 'slack': '', 'phone': ''},
    'Analytics_PAL': {'name': '', 'email': '', 'slack': '', 'phone': ''},
    'IBP_SAL': {'name': 'Ryan Misquita / Amol Palsodkar', 'email': '', 'slack': '', 'phone': ''},
    'IBP_PAL': {'name': '', 'email': '', 'slack': '', 'phone': ''},
    'Security_SAL': {'name': 'Rocky Singh', 'email': '', 'slack': '', 'phone': ''},
    'Security_PAL': {'name': '', 'email': '', 'slack': '', 'phone': ''},
    'OCM_SAL': {'name': 'Kristi Choate', 'email': '', 'slack': '', 'phone': ''},
    'OCM_PAL': {'name': '', 'email': '', 'slack': '', 'phone': ''},
    'EPL_SAL': {'name': 'Gina Haver / Heidi Cook', 'email': '', 'slack': '', 'phone': ''},
    'EPL_PAL': {'name': '', 'email': '', 'slack': '', 'phone': ''},
    'Group_Reporting_SAL': {'name': 'Dilip Radhakrishnan', 'email': '', 'slack': '', 'phone': ''},
    'Group_Reporting_PAL': {'name': '', 'email': '', 'slack': '', 'phone': ''},
    'SAC_SAL': {'name': 'Dilip Radhakrishnan', 'email': '', 'slack': '', 'phone': ''},
    'SAC_PAL': {'name': '', 'email': '', 'slack': '', 'phone': ''},
}


# Approver-key → service area / role mapping used during migration
APPROVER_KEY_META = {}
for _key, _val in DEFAULT_APPROVERS.items():
    _parts = _key.rsplit('_', 1)
    if len(_parts) == 2:
        _area_raw, _role = _parts
        _area = _area_raw.replace('_', '/').replace('PTP/Ariba', 'PTP/Ariba').replace('Group/Reporting', 'Group Reporting').replace('FTP&L', 'FTP&L')
        # Re-normalise known areas
        _AREA_MAP = {
            'RTR': 'RTR', 'OTC': 'OTC', 'PTP/Ariba': 'PTP/Ariba',
            'FTPL': 'FTP&L', 'Data': 'Data', 'Analytics': 'Analytics',
            'IBP': 'IBP', 'Security': 'Security', 'OCM': 'OCM',
            'EPL': 'EPL', 'Group/Reporting': 'Group Reporting', 'SAC': 'SAC',
        }
        APPROVER_KEY_META[_key] = {'area': _AREA_MAP.get(_area_raw, _area_raw), 'role': _role}
