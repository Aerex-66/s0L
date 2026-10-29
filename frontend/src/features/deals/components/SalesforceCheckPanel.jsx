import { useMemo, useState } from 'react'
import ConfirmDialog from '../../../shared/ui/ConfirmDialog'
import { mondayService } from '../../../shared/services/mondayService'
import useDealStore from '../../../shared/dealStore'
import { describeDifference, groupDifferences } from '../salesforceDifferences'

const asOf = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Where the monday board and Salesforce disagree; TT Execs put Salesforce's value on the board from here. */
export default function SalesforceCheckPanel({ differences, onSelectDeal }) {
  const { rows, lastCheck, error, reload } = differences
  const deals = useDealStore((s) => s.deals)
  const me = useDealStore((s) => s.mondayMe)
  const patchDeal = useDealStore((s) => s.patchDeal)
  const canFix = Boolean(me?.is_exec)
  const groups = useMemo(() => groupDifferences(rows, deals, me?.name), [rows, deals, me?.name])
  const [pending, setPending] = useState(null)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState('')

  const ask = (row) => {
    setFailure('')
    setPending(row)
  }

  const confirm = async () => {
    if (saving) return
    setSaving(true)
    setFailure('')
    try {
      patchDeal(await mondayService.fix(pending.deal_id, pending.key))
      setPending(null)
      reload()
    } catch (err) {
      setFailure(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="exec-panel">
      <h3 className="exec-panel-title">
        Salesforce check
        <span className="exec-panel-note">
          {lastCheck ? `The board compared with Salesforce ${asOf(lastCheck)}` : 'Connect Salesforce (the icon at the top) to compare the board with it'}
        </span>
      </h3>
      {error && <p className="pm-assign-error" role="alert">{error}</p>}
      {lastCheck && rows.length === 0 && <p className="exec-empty">The board agrees with Salesforce.</p>}
      {groups.map((group) => (
        <div key={group.exec} className="sf-check-group">
          <h4 className="sf-check-exec">{group.exec}<span className="exec-row-count">{group.rows.length}</span></h4>
          <table className="pm-table exec-table">
            <thead>
              <tr><th>Deal</th><th>What differs</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <tr key={`${row.deal_id}-${row.kind}-${row.key}`}>
                  <td>
                    <button type="button" className="sf-check-deal" onClick={() => onSelectDeal?.(row.deal.id)}>
                      {[row.deal.client_name, row.deal.project_name].filter(Boolean).join(' · ') || `Deal ${row.deal.id}`}
                    </button>
                  </td>
                  <td>{describeDifference(row)}</td>
                  <td className="sf-check-actions">
                    {canFix && row.fixable && <button type="button" className="cmd-btn" onClick={() => ask(row)}>Update board</button>}
                    {row.record_url && (
                      <a className="cmd-btn" href={row.record_url} target="_blank" rel="noopener noreferrer">Open in Salesforce</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <ConfirmDialog
        isOpen={Boolean(pending)}
        title="Change the monday board?"
        message={pending && (
          <>
            {pending.label} on {pending.deal.client_name || 'this deal'}: {pending.board || 'empty'} → <strong>{pending.fix}</strong>,
            {' '}as Salesforce has it. Everyone sees the change on the board.
            {failure && <span className="pm-assign-error" role="alert">{failure}</span>}
          </>
        )}
        confirmLabel={saving ? 'Changing…' : 'Change on monday'}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </section>
  )
}
