/** A seeded generator, so a deal always gets the same glyph (mulberry32). */
function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(text) {
  let h = 2166136261
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

/** How finely a deal's glyph subdivides: bigger deals get a denser mosaic. */
export function glyphDepth(tcv) {
  const value = Number(tcv) || 0
  if (value >= 100e6) return 5
  if (value >= 20e6) return 4
  if (value >= 3e6) return 3
  return 2
}

/** Square quadtree cells (in 0–100 units) for one deal; a few are "lit". */
export function glyphCells(seedText, depth) {
  const rand = seeded(hash(seedText))
  const cells = []
  const split = (x, y, size, level) => {
    const chance = level === 0 ? 1 : 0.7 - level * 0.1
    if (level < depth && rand() < chance) {
      const half = size / 2
      split(x, y, half, level + 1)
      split(x + half, y, half, level + 1)
      split(x, y + half, half, level + 1)
      split(x + half, y + half, half, level + 1)
      return
    }
    cells.push({ x, y, size, lit: rand() < 0.18 + level * 0.07 })
  }
  split(0, 0, 100, 0)
  return cells
}

/** Where a TCV sits between the smallest and largest deal on screen, on a log scale (0–1). */
export function tcvMeter(tcv, range) {
  const value = Number(tcv) || 0
  if (value <= 0 || !range) return 0
  const [low, high] = range
  return Math.max(0.06, Math.min(1, (Math.log10(value) - low) / ((high - low) || 1)))
}
