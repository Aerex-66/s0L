/** A collapsible list under a sync or check summary; hidden when empty. */
export default function SummaryList({ title, items }) {
  if (!items.length) return null
  return (
    <details className="mb-sm">
      <summary>{title} ({items.length})</summary>
      <ul>{items.map((text, i) => <li key={i}>{text}</li>)}</ul>
    </details>
  )
}
