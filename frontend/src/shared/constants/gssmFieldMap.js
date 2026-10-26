/**
 * gssmFieldMap.js — GSSM sheet layouts (Imp TL, Staffing, Bid Metrics) and the
 * phase palette. Individual field cells (PTI_Estimator, Home) live in the
 * field index, shared/field_index.json, as Excel A1 references.
 *
 * Phase codes, labels, and colors come from shared/domain_constants.json —
 * the cross-runtime contract also consumed by core/shared/domain.py, so
 * the Flask Gantt export and every frontend view share one palette.
 *
 * All row/col indices are 0-based (matching workbookDataRef.rowDataBySheet).
 */
import domainConstants from '../../../../shared/domain_constants.json'

/* ── Imp TL (Implementation Timeline) sheet coordinates ── */
export const IMP_TL = {
  START_DATE_ROW: 7,        // 1-based row 8, col C
  START_DATE_COL: 2,
  TIME_UNIT_ROW: 8,         // 1-based row 9
  TIME_UNIT_COL: 2,
  DURATION_ROW: 10,          // 1-based row 11
  DURATION_COL: 2,
  END_DATE_ROW: 10,
  END_DATE_COL: 4,
  LEGEND_START_ROW: 1,       // rows 2-10 (1-based) → 1-9 (0-based)
  LEGEND_END_ROW: 9,
  LEGEND_CODE_COL: 6,
  LEGEND_LABEL_COL: 7,
  LEGEND_COLOR_COL: 8,
  LANE_START_ROW: 15,        // row 16 (1-based)
  LANE_NAME_COLS: [0, 1, 2],
  LANE_DATA_START_COL: 3,
}

/* ── Bid Metrics sheet coordinates ── */
export const BID_METRICS = {
  REGION:   { row: 0, col: 1 },
  BID_TYPE: { row: 1, col: 1 },
  AVG_FTE:  { row: 2, col: 1 },
  CRITERIA_START_ROW: 5,
  CRITERIA_END_ROW: 34,
  COL_SL: 0,
  COL_CRITERIA: 1,
  COL_LOW: 2,
  COL_HIGH: 3,
  COL_ACTUAL: 4,
  COL_MET: 5,
  COL_HARD_SOFT: 6,
  COL_COMMENT: 7,
}

/* ── Staffing sheet coordinates ── */
export const STAFFING = {
  DEFAULT_HEADER_ROW: 26,
  DEFAULT_DATA_START_ROW: 27,
  FTE_START_COL: 42,
}

/* ── Phase code ↔ deal timeline mapping (from shared contract) ── */
export const PHASE_CODE_TO_DEAL = domainConstants.phase_code_to_deal

export const DEAL_PHASE_TO_CODE = domainConstants.phase_name_to_code

/**
 * Canonical SAP Activate phase palette — single source of truth for colors/labels.
 * Used by Home Timeline, GSSM ImpTimelineView, TimelineBar, the Flask iSBD
 * Gantt export, and any other phase visualization.
 */
export const PHASE_PALETTE = domainConstants.phase_palette

/** Service area code → label map (from shared contract). */
export const SERVICE_AREAS = domainConstants.service_areas
