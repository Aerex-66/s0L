export const WORK_STATUS_OPTIONS = ['Not Started', 'In Progress', 'Completed', 'Blocked', 'N/A']

export const WORK_STATUS_STYLE_MAP = {
  'Not Started': {
    color: 'var(--status-gray)',
    bg: 'var(--status-gray-bg)',
    label: 'Not Started',
  },
  'In Progress': {
    color: 'var(--status-info)',
    bg: 'var(--status-info-bg)',
    label: 'In Progress',
  },
  Completed: {
    color: 'var(--status-success)',
    bg: 'var(--status-success-bg)',
    label: 'Completed',
  },
  Blocked: {
    color: 'var(--status-error)',
    bg: 'var(--status-error-bg)',
    label: 'Blocked',
  },
  'N/A': {
    color: 'var(--status-gray)',
    bg: 'rgba(141, 141, 141, 0.04)',
    label: 'N/A',
  },
}

export function getWorkStatusStyle(status) {
  return WORK_STATUS_STYLE_MAP[status] || WORK_STATUS_STYLE_MAP['Not Started']
}

export function getWorkStatusColor(status) {
  return getWorkStatusStyle(status).color
}

/** s0L's own closed statuses plus the monday board's Status labels for finished deals. */
export const CLOSED_STATUSES = ['Closed Won', 'Closed Lost', 'Archived', 'Completed', 'Won', 'Lost', 'Submitted', 'No Bid', 'CDNP']

/** Board Sales Stages that put a deal in Archives ("Submitted" matches once the board has that label). */
export const CLOSED_SALES_STAGES = ['Won', 'Lost', 'Submitted']

/** Closed = a closing Status (board or s0L) or a closing Sales Stage. */
export function isClosedDeal(deal) {
  return CLOSED_SALES_STAGES.includes(deal?.sales_stage) || CLOSED_STATUSES.includes(deal?.status)
}

export const isWonDeal = (deal) => ['Won', 'Closed Won'].includes(deal?.status) || deal?.sales_stage === 'Won'

const DEAL_STATUS_COLORS = {
  Active: 'var(--status-success)',
  'In Progress': 'var(--accent)',
  'On Hold': 'var(--status-warning)',
  'Assignment Needed': 'var(--status-error)',
  Submitted: 'var(--accent)',
  Won: 'var(--status-success)',
  'Closed Won': 'var(--status-success)',
  Lost: 'var(--status-error)',
  'Closed Lost': 'var(--status-error)',
}

/** Colour token for a deal Status label (board or s0L); anything else is neutral. */
export const dealStatusColor = (status) => DEAL_STATUS_COLORS[status] || 'var(--status-gray)'

export const DONE_STATUSES = ['completed', 'approved', 'certified', 'done']

export const WEEKS_PER_MONTH = 4.345 // 52.14 / 12

export function isDoneStatus(status) {
  return DONE_STATUSES.includes((status || '').toLowerCase())
}
