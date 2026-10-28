import { useCallback, useEffect, useState } from 'react'
import { mondayService } from '../../../shared/services/mondayService'
import useDealStore from '../../../shared/dealStore'

const when = (iso) => (iso ? new Date(iso).toLocaleString() : 'never')

function SummaryList({ title, items }) {
  if (!items.length) return null
  return (
    <details className="mb-sm">
      <summary>{title} ({items.length})</summary>
      <ul>{items.map((text, i) => <li key={i}>{text}</li>)}</ul>
    </details>
  )
}

function SyncSummary({ summary, deals }) {
  const dealName = (id) => {
    const deal = deals.find((d) => String(d.id) === String(id))
    return deal?.project_name || deal?.client_name || `Deal ${id}`
  }
  const counts = [
    [summary.created, 'new'],
    [summary.updated, 'updated'],
    [summary.linked, 'matched to existing deals'],
    [summary.gone, 'no longer on the board'],
  ].filter(([n]) => n > 0)

  return (
    <div>
      <p>{counts.length ? counts.map(([n, label]) => `${n} ${label}`).join(' · ') : 'Everything is up to date.'}</p>
      <SummaryList
        title="Values the board replaced"
        items={(summary.replaced || []).map((r) => `${dealName(r.deal_id)} · ${r.label}: “${r.old}”`)}
      />
      <SummaryList
        title="Opportunity IDs on more than one row"
        items={(summary.duplicates || []).map((d) => `${d.opportunity_number} · ${d.item_ids.length} rows`)}
      />
      <SummaryList
        title="Rows without a Salesforce opportunity ID"
        items={(summary.plain_text_names || []).map((r) => r.name || '(empty)')}
      />
      <SummaryList
        title="Board columns s0L doesn't read yet"
        items={(summary.unknown_columns || []).map((c) => `${c.title} (${c.type})`)}
      />
    </div>
  )
}

export default function MondayTab({ onConfirm }) {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const mondaySync = useDealStore((s) => s.mondaySync)
  const runMondaySync = useDealStore((s) => s.runMondaySync)
  const deals = useDealStore((s) => s.deals)

  const loadStatus = useCallback(async () => {
    try {
      const next = await mondayService.status()
      setStatus(next)
      return next
    } catch (err) {
      setError(err.message)
      return null
    }
  }, [])

  useEffect(() => {
    let alive = true
    mondayService.status()
      .then((next) => { if (alive) setStatus(next) })
      .catch((err) => { if (alive) setError(err.message) })
    return () => {
      alive = false
    }
  }, [])

  const syncNow = async () => {
    await runMondaySync()
    loadStatus()
  }

  const disconnect = () => onConfirm(
    'Disconnect monday',
    's0L stops syncing the deal board on this computer. Deals already in s0L stay as they are.',
    async () => {
      await mondayService.disconnect()
      loadStatus()
    },
  )

  if (!status) {
    return <div className="settings-section"><p className="text-muted">{error || 'Checking monday…'}</p></div>
  }

  return (
    <div className="settings-section">
      <h3>monday.com</h3>
      <p className="section-description">
        s0L reads deals from the{' '}
        <a href={status.board_url} target="_blank" rel="noopener noreferrer">Business Apps – Deal Pipeline</a>{' '}
        board when it starts and when you sync. It changes the board only when you pick a Lead SSC, TT Exec,
        SC 2 or SC 3 name in the deal list, after you confirm.
      </p>
      {error && <div className="text-danger mb-sm">{error}</div>}

      {!status.app_configured && (
        <p>monday isn't set up on this computer yet. Ask whoever manages s0L for the monday app file.</p>
      )}

      {status.app_configured && !status.connected && (
        <p>Not connected. Click the monday icon at the top of s0L to sign in.</p>
      )}

      {status.connected && (
        <>
          <p>Signed in as <b>{status.user?.name || 'you'}</b> · Last sync {when(status.last_sync)}</p>
          <p>
            <button className="btn btn-primary" onClick={syncNow} disabled={mondaySync.state === 'syncing'}>
              {mondaySync.state === 'syncing' ? 'Syncing…' : 'Sync now'}
            </button>{' '}
            <button className="btn btn-ghost" onClick={disconnect}>Disconnect</button>
          </p>
        </>
      )}

      {mondaySync.state === 'error' && <div className="text-danger mb-sm">{mondaySync.message}</div>}
      {mondaySync.summary && <SyncSummary summary={mondaySync.summary} deals={deals} />}
    </div>
  )
}
