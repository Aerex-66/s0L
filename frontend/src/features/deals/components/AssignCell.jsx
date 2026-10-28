import * as Select from '@radix-ui/react-select'
import { ChevronDownIcon } from '../../../shared/ui/Icons'
import { cx } from '../../../shared/utils/cx'

// Menu events bubble through React's tree to the row, whose click opens the deal.
const stop = (event) => event.stopPropagation()

/** A people cell in the list that changes the deal's monday row: pick one of the names the board column has. */
export default function AssignCell({ value, label, names, people, clip = false, onOpen, onPick }) {
  return (
    <span className="pm-assign" onClick={stop}>
      <Select.Root
        value={value}
        // Next task: a dialog opened mid-keystroke would catch the Enter that picked the name.
        onValueChange={(name) => setTimeout(() => onPick(name))}
        onOpenChange={(open) => { if (open) onOpen() }}
      >
        <Select.Trigger className={cx('pm-assign-trigger', clip && 'pm-assign-trigger--clip')} aria-label={`${label}: ${value || 'nobody'}. Change on monday`}>
          <span className="pm-assign-name" title={value}>{value}</span>
          <ChevronDownIcon className="pm-assign-chevron" aria-hidden="true" />
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="pm-assign-menu" position="popper" align="start" sideOffset={4}>
            <Select.Viewport>
              {people.status === 'loading' && <div className="pm-assign-note">Loading names from monday…</div>}
              {people.status === 'error' && <div className="pm-assign-note pm-assign-note--error" role="alert">{people.error}</div>}
              {people.status === 'ready' && names.length === 0 && <div className="pm-assign-note">No names in this board column.</div>}
              {names.map((name) => (
                <Select.Item key={name} value={name} className="pm-assign-item">
                  <Select.ItemText>{name}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </span>
  )
}
