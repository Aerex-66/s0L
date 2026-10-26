/**
 * gssmData — the sanctioned seam for non-GSSM modules that need GSSM
 * workbook data (e.g. Greenstar's staffing pivots).
 *
 * Features must not import from each other directly; shared logic goes
 * through shared/. The GSSM engine internals (utils/, calc/, sheets/)
 * are pinned to the standalone-repo sync boundary (see GSSM_SYNC.md), so
 * they cannot physically move into shared/. This module re-exports the
 * stable read-only surface instead, keeping the cross-module dependency
 * in exactly one documented place.
 */
export { fetchCatalog, fetchWorkbookData } from '../../features/gssm/gssmApi'
export { pickWorkbookForDeal } from './pickWorkbook'
export {
  parsePivotInfo,
  executePivotInfoPivot,
  flattenPivotToGrid,
} from '../../features/gssm/utils/parsePivotInfo'
export {
  pivot,
  extractStaffingRows,
  detectFteColumns,
} from '../../features/gssm/utils/pivotEngine'
