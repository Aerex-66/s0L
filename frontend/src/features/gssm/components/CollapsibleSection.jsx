import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'

/**
 * Collapsible section — wraps a section-divider + body.
 * Collapsed by default (startOpen = false).
 * Optional rightContent renders inline at the far right of the header row.
 *
 * Usage:
 *   <CollapsibleSection label="Filters" rightContent={<TabBar />}>
 *     <div className="sheet-form-grid">...</div>
 *   </CollapsibleSection>
 */
export default function CollapsibleSection({ label, children, startOpen = false, rightContent }) {
  const [open, setOpen] = useState(startOpen)
  const toggle = useCallback(() => setOpen((p) => !p), [])

  return (
    <div className="collapsible-section">
      <div
        className={`section-divider collapsible-toggle${open ? '' : ' collapsed'}`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle() }}
      >
        <span onClick={toggle} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
          {label}
          <ChevronDown size={14} className={`collapsible-arrow${open ? '' : ' collapsed'}`} />
        </span>
        {rightContent && (
          <div className="collapsible-right" onClick={(e) => e.stopPropagation()}>
            {rightContent}
          </div>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0.38, 0.9] }}
            style={{ overflow: 'hidden' }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
