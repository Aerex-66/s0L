import { Suspense } from 'react'
import { AnimatePresence } from 'framer-motion'

/**
 * Conditional Suspense gate for lazy-loaded components.
 * Renders children only when `when` is truthy, wrapped in Suspense + AnimatePresence.
 * AnimatePresence enables exit animations for framer-motion components inside.
 */
export default function LazyGate({ when, fallback = null, children }) {
  return (
    <AnimatePresence>
      {when && <Suspense fallback={fallback}>{children}</Suspense>}
    </AnimatePresence>
  )
}
