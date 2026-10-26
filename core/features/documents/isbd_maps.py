"""
iSBD slide maps — slide-title and table-row dictionaries used by both the
extraction (isbd_extract.py) and export (isbd_export.py) pipelines. Field
labels live in shared/field_index.json (core.shared.field_index.isbd_key_for).
"""

RISK_COLS = ['risk_description', 'risk_probability', 'risk_impact', 'risk_mitigation', 'risk_timing']

# Slide titles that identify a file as a real iSBD
ISBD_SIGNATURE_TITLES = {
    'deal profile summary',
    'executive summary',
    'executive summary & solution strategy',
    'levers of scope',
    'risk assessment',
    'risk assessment summary',
    'compliance and review status',
    'scope assumptions',
}

ISBD_MIN_TITLE_MATCHES = 2

SLIDE_TITLE_MAP = {
    'deal profile summary':                         'deal_profile_summary',
    'additional deal profile':                      'additional_deal_profile',
    'executive summary':                            'executive_summary',
    'executive summary & solution strategy':        'executive_summary',
    'solution history':                             'solution_history',
    'solution history \u2013 current bafo position': 'solution_history',
    'solution history \u2013 current position':     'solution_history',
    'risk assessment':                              'risk_assessment',
    'risk assessment summary':                      'risk_assessment',
    'compliance and review status':                 'compliance_review',
    'compliance review':                             'compliance_review',
    'staffing approvals':                           'staffing_approvals',
    'key proposed resources':                       'key_proposed_resources',
    'detailed staffing':                            'detailed_staffing',
    'financial summary':                            'financial_summary',
    'scope assumptions':                            'assumptions',
    'assumptions':                                  'assumptions',
    'implementation timeline':                      'proposed_timeline',
    'ibm proposed timeline':                        'proposed_timeline',
    'proposed timeline':                            'proposed_timeline',
}

SOLUTION_ROW_KEYS = {
    'type': 'type', 'type (indicative, bafo, b&p)': 'type',
    'scope': 'scope',
    'tcv ($)': 'tcv', 'tcv': 'tcv',
    'npv gp$/ gp%': 'npv_gp', 'npv gp%': 'npv_gp',
    'services tcv': 'services_tcv',
    'services npv gp%': 'services_gp',
    'oem software tcv': 'oem_tcv',
    'oem software npv gp%': 'oem_gp',
    '% on / off / nearshore': 'on_off_near',
    'first 12-month cash flow gp%': 'cashflow',
    'term (months)': 'term', 'term': 'term',
    'team size (peak ftes)': 'team_size',
}
