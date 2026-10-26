/**
 * Constants Index — Central barrel export.
 * Field definitions live in shared/field_index.json (see ./fieldIndex.js);
 * this barrel re-exports reference data and UI constants.
 */

export * from './referenceData'

// UI constants
export * from './uiStates'
export * from './uiInteraction'

// Deal constants from JSON
import dealConstants from './deal_constants.json'

export const PHASES = dealConstants.phases
export const PHASE_DISTRIBUTIONS = dealConstants.phase_distributions
export const TIMELINE_METHODOLOGY = dealConstants.timeline_methodology
export const IMPLEMENTATION_TYPE_COLORS = dealConstants.implementation_type_colors

export const formatDealName = (projectName) => {
  if (!projectName) return ''
  return projectName.split(' - ')[0].toUpperCase()
}

export { API_URL } from './config'
