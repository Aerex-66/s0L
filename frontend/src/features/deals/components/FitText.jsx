import { useRef } from 'react'
import { useFitText } from '../fitText'

/** Text that shrinks to show itself whole on one line (see useFitText). */
export default function FitText({ as = 'span', children, ...props }) {
  const Tag = as
  const ref = useRef(null)
  useFitText(ref, children)
  return <Tag ref={ref} {...props}>{children}</Tag>
}
