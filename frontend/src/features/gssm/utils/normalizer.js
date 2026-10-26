/**
 * normalizer.js — Centralized Excel → UI display translations.
 *
 * Everything in this file is cosmetic. Internal names (keys) match the XLSM
 * workbook exactly and are used for all data flow, edits, and export.
 * Display names (values) are shown in the UI only — never written to Excel.
 */

/* ═══ Sheet tab & panel titles ═══ */
export const SHEET_DISPLAY_NAMES = {
  'Home':           'Home',
  'Staffing':       'Staffing',
  'Bid Metrics':    'Bid Metrics',
  'Imp TL':         'Implementation Timeline',
  'Rates':          'Rates',
  'PTI_Estimator':  'PTI Overview',
  'Forex':          'Forex',
  'Inflation':      'Inflation',
  'Effort Matrix':  'Effort Matrix',
  'JRS':            'JRS',
  'Cloud':          'Cloud',
  'PMP Template':   'PMP Template',
}

export const getSheetDisplayName = (internalName) =>
  SHEET_DISPLAY_NAMES[internalName] ?? internalName

/* ═══ View & feature labels ═══ */
export const VIEW_LABELS = {
  pivot:     'Deal Financial Summary',
  pivotMaker: 'GSSM PivotMaker',
}

/* ═══ Timeline phase codes → display labels ═══ */
export const PHASE_LABELS = {
  DI: 'Discover',
  PR: 'Prepare',
  EX: 'Explore',
  RE: 'Realize',
  RB: 'Realize Build',
  RT: 'Realize Test',
  RC: 'Realize Config',
  RD: 'Realize Data',
  DP: 'Deploy',
  SU: 'Sustain',
  XX: 'User-Defined',
  YY: 'User-Defined',
  ZZ: 'User-Defined',
}

/* ═══ Staffing band abbreviations ═══ */
export const BAND_ABBREVIATIONS = {
  'Application Operations':                    'AO',
  'Bus Apps+CSS+Hybrid Cloud & Data+S&T':      'BAP/HCD/S+T',
  'Bus Apps+CSS+Hybrid Cloud & Data':           'BAP/HCD',
  'GRCOREREMOTE':                               'GR Remote',
}

/* ═══ Pivot table names ═══ */
export const PIVOT_NAMES = {
  'company-team':     'By Company & Team',
  'team-role':        'By Team & Role',
  'band-company':     'By Band & Company',
  'rollout-team':     'By Rollout & Team',
  'phase-team':       'By Phase & Team',
  'team-monthly-fte': 'Monthly FTE by Team',
}
