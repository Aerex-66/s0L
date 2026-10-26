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

export const CLOSED_STATUSES = ['Closed Won', 'Closed Lost', 'Archived', 'Completed']

export const DONE_STATUSES = ['completed', 'approved', 'certified', 'done']

export const WEEKS_PER_MONTH = 4.345 // 52.14 / 12

export function isDoneStatus(status) {
  return DONE_STATUSES.includes((status || '').toLowerCase())
}
