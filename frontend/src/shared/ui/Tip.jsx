import * as Tooltip from '@radix-ui/react-tooltip'

/**
 * Styled tooltip — drop-in replacement for title="" attributes.
 * Usage: <Tip content="Search (⌘K)"><button>...</button></Tip>
 */
export default function Tip({ content, side = 'bottom', children, delayDuration = 300 }) {
  if (!content) return children
  return (
    <Tooltip.Provider delayDuration={delayDuration}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="radix-tooltip" side={side} sideOffset={6}>
            {content}
            <Tooltip.Arrow className="radix-tooltip-arrow" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
