import { useCallback, useEffect, useState } from 'react'
import { salesforceService } from '../../../shared/services/salesforceService'
import useDealStore from '../../../shared/dealStore'
import SummaryList from './SummaryList'

const when = (iso) => (iso ? new Date(iso).toLocaleString() : 'never')

function CheckSummary({ summary, deals }) {
  const dealName = (id) => {
    const deal = deals.find((d) => String(d.id) === String(id))
    return deal?.project_name || deal?.client_name || `Deal ${id}`
  }
  const counts = [
    [summary.found, 'found'],
    [summary.not_returned, "not returned (a wrong number, or you can't see it in Salesforce)"],
    [summary.not_an_id, 'without an opportunity ID'],
    [summary.two_ids, 'with two IDs'],
  ].filter(([n]) => n > 0)

  return (
    <div>
      <p>
        {`${summary.checked} board ${summary.checked === 1 ? 'deal' : 'deals'} checked`}
        {counts.length > 0 && ` · ${counts.map(([n, label]) => `${n} ${label}`).join(' · ')}`}
      </p>
      <SummaryList
        title="Typed values Salesforce replaced"
        items={(summary.replaced || []).map((r) => `${dealName(r.deal_id)} · ${r.label}: “${r.old}”`)}
      />
      <SummaryList title="Fields this Salesforce doesn't show, so s0L leaves them out" items={summary.skipped_fields || []} />
    </div>
  )
}

export default function SalesforceTab({ onConfirm }) {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const salesforceCheck = useDealStore((s) => s.salesforceCheck)
  const runSalesforceCheck = useDealStore((s) => s.runSalesforceCheck)
  const deals = useDealStore((s) => s.deals)

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await salesforceService.status())
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    let alive = true
    salesforceService.status()
      .then((next) => { if (alive) setStatus(next) })
      .catch((err) => { if (alive) setError(err.message) })
    return () => {
      alive = false
    }
  }, [])

  const checkNow = async () => {
    await runSalesforceCheck()
    loadStatus()
  }

  const disconnect = () => onConfirm(
    'Disconnect Salesforce',
    "s0L stops checking the board's deals against Salesforce on this computer. Values already in s0L stay as they are.",
    async () => {
      await salesforceService.disconnect()
      loadStatus()
    },
  )

  if (!status) {
    return <div className="settings-section"><p className="text-muted">{error || 'Checking Salesforce…'}</p></div>
  }

  return (
    <div className="settings-section">
      <h3>Salesforce</h3>
      <p className="section-description">
        s0L looks up every deal on the monday board in IBM Sales Cloud by its opportunity number, after each board
        sync and when you click the Salesforce icon. It only reads Salesforce. Where the board and Salesforce
        disagree, the TT Exec view lists it.
      </p>
      {error && <div className="text-danger mb-sm">{error}</div>}

      {!status.app_configured && (
        <p>Salesforce isn't set up on this computer yet. Ask whoever manages s0L.</p>
      )}

      {status.app_configured && !status.connected && (
        <p>Not connected. Click the Salesforce icon at the top of s0L to sign in.</p>
      )}

      {status.connected && (
        <>
          <p>Signed in to <b>{status.host}</b> as <b>{status.user?.name || 'you'}</b> · Last check {when(status.last_check)}</p>
          <p>
            <button className="btn btn-primary" onClick={checkNow} disabled={salesforceCheck.state === 'checking'}>
              {salesforceCheck.state === 'checking' ? 'Checking…' : 'Check now'}
            </button>{' '}
            <button className="btn btn-ghost" onClick={disconnect}>Disconnect</button>
          </p>
        </>
      )}

      {salesforceCheck.state === 'error' && <div className="text-danger mb-sm">{salesforceCheck.message}</div>}
      {salesforceCheck.summary && <CheckSummary summary={salesforceCheck.summary} deals={deals} />}
    </div>
  )
}
