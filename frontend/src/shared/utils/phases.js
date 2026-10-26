/** SAP Activate phase helpers shared by Home's timeline painter and the GSSM bridge. */
export const PHASE_ORDER = ['Prepare', 'Explore', 'Build', 'Test', 'Go-Live', 'Hypercare']

const GSSM_PHASE_NAMES = [['REALIZE', 'Build'], ['DEPLOY', 'Go-Live'], ['SUSTAIN', 'Hypercare'], ['DISCOVER', 'Prepare']]

/** Match a phase key, possibly decorated ("◆ PREPARE  Wk 1–4"), to a canonical phase name. */
export function matchPhase(key) {
  const upper = String(key || '').toUpperCase()
  const phase = PHASE_ORDER.find((name) => upper.includes(name.toUpperCase()))
  if (phase) return phase
  return GSSM_PHASE_NAMES.find(([name]) => upper.includes(name))?.[1] ?? null
}
