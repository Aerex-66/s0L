import { memo, useMemo } from 'react'
import { glyphCells } from '../glyph'

/** The deal's generative mark: a square quadtree mosaic, seeded by the deal and denser for bigger deals. */
const DealGlyph = memo(function DealGlyph({ seed, depth }) {
  const cells = useMemo(() => glyphCells(seed, depth), [seed, depth])
  return (
    <svg className="deal-glyph" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      {cells.map((cell, i) => (
        <rect
          key={i}
          x={cell.x + 0.8}
          y={cell.y + 0.8}
          width={cell.size - 1.6}
          height={cell.size - 1.6}
          className={cell.lit ? 'deal-glyph-lit' : 'deal-glyph-cell'}
        />
      ))}
    </svg>
  )
})

export default DealGlyph
