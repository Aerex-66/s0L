/**
 * Phase Normalizer — Bidirectional mapping between s0L phase names and GSSM codes
 * ────────────────────────────────────────────────────────────────────────────────
 * s0L phases:  Prepare, Explore, Build, Test, Go-Live, Hypercare
 * GSSM codes:  PR, EX, RE (Realize), RT (Realize Test), DP (Deploy), SU (Sustain)
 * GSSM extras: DI (Discover), RB (Realize Build), RC (Realize Config), RD (Realize Data)
 *
 * Sub-phases RB/RC/RD roll up to Build; RT to Test; DI has no s0L equivalent.
 */

import dealConstants from '../constants/deal_constants.json'

// ── Core mapping tables ─────────────────────────────────────────────

const GSSM_CODES = dealConstants.gssm_phase_codes

/** s0L phase name → primary GSSM 2-letter code */
const TO_GSSM = {
  'Prepare':   'PR',
  'Explore':   'EX',
  'Build':     'RE',
  'Test':      'RT',
  'Go-Live':   'DP',
  'Hypercare': 'SU',
}

/** GSSM 2-letter code → s0L canonical phase name (null = no equivalent) */
const TO_CANONICAL = {}
for (const [code, def] of Object.entries(GSSM_CODES)) {
  TO_CANONICAL[code] = def.canonical
}

/** Sub-phases grouped by their parent GSSM code */
const SUB_PHASES = {}
for (const [code, def] of Object.entries(GSSM_CODES)) {
  if (def.subPhaseOf) {
    if (!SUB_PHASES[def.subPhaseOf]) SUB_PHASES[def.subPhaseOf] = []
    SUB_PHASES[def.subPhaseOf].push(code)
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Convert a GSSM 2-letter code to the s0L canonical phase name.
 * Returns null for codes with no canonical equivalent (e.g. 'DI').
 */
export function toCanonical(gssmCode) {
  if (!gssmCode) return null
  return TO_CANONICAL[gssmCode.toUpperCase()] ?? null
}

/**
 * Convert an s0L phase name to the primary GSSM 2-letter code.
 * Returns null if phase name is not recognized.
 */
export function toGssm(phaseName) {
  if (!phaseName) return null
  return TO_GSSM[phaseName] ?? null
}

/**
 * Get the human-readable GSSM label for a code (e.g. 'RE' → 'Realize').
 */
export function gssmLabel(code) {
  return GSSM_CODES[code]?.label ?? code
}

/**
 * Get GSSM sub-phase codes for a parent code.
 * e.g. getSubPhases('RE') → ['RB', 'RC', 'RD', 'RT']
 */
export function getSubPhases(parentCode) {
  return SUB_PHASES[parentCode] || []
}

/**
 * Check if a GSSM code is a sub-phase (not a primary phase).
 */
export function isSubPhase(code) {
  return !!GSSM_CODES[code]?.subPhaseOf
}

/**
 * Get the parent GSSM code for a sub-phase.
 * e.g. parentPhase('RB') → 'RE'
 */
export function parentPhase(code) {
  return GSSM_CODES[code]?.subPhaseOf ?? null
}

/**
 * Get all primary GSSM codes (excluding sub-phases).
 */
export function primaryGssmCodes() {
  return Object.entries(GSSM_CODES)
    .filter(([_, def]) => !def.subPhaseOf)
    .map(([code]) => code)
}

/**
 * Get all s0L phase names in order.
 */
export function phases() {
  return dealConstants.phases
}

/**
 * Normalize a phase reference from any source to canonical.
 * Accepts: s0L name, GSSM code, or GSSM label.
 */
export function normalizePhase(input) {
  if (!input) return null
  const upper = input.toUpperCase()

  // Direct s0L name match
  if (TO_GSSM[input]) return input

  // GSSM code match
  if (TO_CANONICAL[upper] !== undefined) return TO_CANONICAL[upper]

  // GSSM label match (case-insensitive)
  const lower = input.toLowerCase()
  for (const [code, def] of Object.entries(GSSM_CODES)) {
    if (def.label.toLowerCase() === lower) return def.canonical
  }

  return null
}
