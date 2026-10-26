/**
 * Sheet grouping constants for the s0L GSSM shell — which sheets are
 * visible by default and which generic view renders each sheet family.
 *
 * s0L-only shell module — NOT part of the standalone sync boundary.
 */

export const DEFAULT_VISIBLE_SHEETS = new Set([
  'Home', 'Staffing', 'PTI_Estimator', 'Bid Metrics', 'Imp TL', 'Rates',
  'FS Estimation', 'RICEFW Estimation',
])

export const GPE_SHEETS = new Set([
  'GPE_Workbook', 'GPE_Month', 'GPE_Day', 'GPE Aggregator', 'GPE-Automation', 'Non-Labor in GPE',
])

export const SUMMARY_SHEETS = new Set([
  'FTE_By_Role', 'FTE_Flat_IBM_Summary_15', 'DF_Team', 'iSBD Summary',
])

export const DATA_TABLE_SHEETS = new Set([
  'WRICEF List', 'RICEFW Split Guidance', 'SAP Metrics Input', 'Gen AI Assumptions',
  'Rates Adjustment', 'PMR Calculator',
])

export const REFERENCE_SHEETS = new Set([
  'vars__Rates_Look_up_Table', 'vars__Rates', 'vars__Country', 'vars__CurrencySource',
  'vars__EqComp', 'vars__bands', 'vars__OthParms', 'vars__Inflation', 'vars__WACC',
  'vars__CategoryDesc', 'var__Hours', 'OKBands', 'BandOrdering', 'WorkLocations',
  'WorkLocations (2)', 'HoursLocMapping', 'RA__Mapping__Table', 'JRS_Map',
  'BidMetricsTbl', 'JRSS', 'PhaseMatrix', 'PivotInfo', 'Background',
])

export const LOG_SHEETS = new Set(['GSSM Change Log', 'Sheet1'])
