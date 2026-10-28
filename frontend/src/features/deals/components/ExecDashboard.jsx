import { useEffect, useMemo, useState } from 'react'
import { isClosedDeal } from '../../../shared/constants'
import { formatCompactMillions, formatShortDateWithYear } from '../../../shared/utils/formatters'
import { ChevronLeftIcon, ChevronRightIcon } from '../../../shared/ui/Icons'
import { cx } from '../../../shared/utils/cx'
import useDealStore from '../../../shared/dealStore'
import useNoticeStore from '../../../shared/noticeStore'
import { groupDeals } from '../grouping'
import { PERIODS, currentPeriod, needsAssignment, trend, winRate } from '../execStats'
import { dealTcv } from '../tcv'
import { useArrangement } from '../useArrangement'
import ArrangeToolbar from './ArrangeToolbar'
import DealSearch from './DealSearch'
import PipelineMetrics from './PipelineMetrics'

const TREND_LENGTH = 6
const NOTICE_LENGTH = 500
const money = (value) => (value > 0 ? formatCompactMillions(value) : '—')
const percent = (rate) => (rate === null ? '—' : `${Math.round(rate * 100)}%`)
const asOf = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const PERIOD_KEY = 's0l-exec-period'

function savedPeriod() {
  try {
    const saved = localStorage.getItem(PERIOD_KEY)
    return PERIODS.some((period) => period.id === saved) ? saved : 'quarter'
  } catch {
    return 'quarter'
  }
}

/** Notices for the team: TT Execs send and remove them here; the dashboards show them in the header banner. */
function Notices({ canPost }) {
  const notices = useNoticeStore((s) => s.notices)
  const load = useNoticeStore((s) => s.load)
  const post = useNoticeStore((s) => s.post)
  const remove = useNoticeStore((s) => s.remove)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [load])

  const run = async (work) => {
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  const submit = (event) => {
    event.preventDefault()
    if (text.trim()) run(async () => { await post(text.trim()); setText('') })
  }

  return (
    <section className="exec-panel exec-notices">
      <h3 className="exec-panel-title">
        Notices
        <span className="exec-panel-note">Shown at the top of the dashboard, newest first · on this computer only until notices go through monday</span>
      </h3>
      <form className="exec-notice-form" onSubmit={submit}>
        <textarea
          value={text}
          maxLength={NOTICE_LENGTH}
          rows={2}
          disabled={!canPost}
          placeholder={canPost ? 'A reminder for the team…' : 'Only TT Execs send notices'}
          aria-label="Notice to send"
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="cmd-btn cmd-btn--primary" disabled={!canPost || busy || !text.trim()}>Send notice</button>
      </form>
      {error && <p className="pm-assign-error" role="alert">{error}</p>}
      {notices.length > 0 && (
        <ul className="exec-notice-list">
          {notices.map((notice) => (
            <li key={notice.id} className="exec-notice">
              <time className="exec-notice-date" dateTime={notice.created_at}>{formatShortDateWithYear(notice.created_at)}</time>
              <span className="exec-notice-text">{notice.text}</span>
              {canPost && (
                <button type="button" className="btn btn-ghost btn-xs" disabled={busy} onClick={() => run(() => remove(notice.id))}>Remove</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** One breakdown of the open deals: a row per group with its count, a TCV bar and the TCV. */
function Breakdown({ title, groups }) {
  const top = Math.max(0, ...groups.map((group) => group.tcv))
  return (
    <section className="exec-panel">
      <h3 className="exec-panel-title">{title}</h3>
      {groups.length === 0 && <p className="exec-empty">No open deals.</p>}
      <ul className="exec-rows">
        {groups.map((group) => (
          <li key={group.key} className="exec-row">
            <span className="exec-row-name" title={group.label}>
              {group.color && <i className="deal-status-dot" style={{ '--status-c': group.color }} aria-hidden="true" />}
              {group.label}
            </span>
            <span className="exec-row-count">{group.count}</span>
            <span className="exec-bar" style={group.color ? { '--bar-c': group.color } : undefined} aria-hidden="true">
              <i style={{ width: `${top > 0 ? (group.tcv / top) * 100 : 0}%` }} />
            </span>
            <span className="exec-row-tcv">{money(group.tcv)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The TT Exec view: the whole team's deals per month, quarter, half or year, the open pipeline,
 * each lead solutioner's load, and the deals waiting for someone (TT Execs assign them here).
 */
export default function ExecDashboard({ deals, onSelectDeal }) {
  const [size, setSizeState] = useState(savedPeriod)
  const setSize = (next) => {
    setSizeState(next)
    try { localStorage.setItem(PERIOD_KEY, next) } catch { /* private mode: just don't remember */ }
  }
  const [back, setBack] = useState(0)
  const canAssign = useDealStore((s) => Boolean(s.mondayMe?.is_exec))

  const index = currentPeriod(size) - back
  const periods = useMemo(() => trend(deals, size, index, TREND_LENGTH), [deals, size, index])
  const open = useMemo(() => deals.filter((deal) => !isClosedDeal(deal)), [deals])
  const waiting = useMemo(() => needsAssignment(deals), [deals])
  const arrangement = useArrangement(waiting, { rememberAs: 's0l-arrange-exec-waiting' })
  const selected = periods[periods.length - 1]
  const previous = periods[periods.length - 2]
  const period = PERIODS.find((option) => option.id === size)
  const openTcv = open.reduce((sum, deal) => sum + dealTcv(deal), 0)
  const topAdded = Math.max(1, ...periods.map((p) => p.added))
  const allTime = useMemo(() => winRate(deals), [deals])
  const lastRead = deals.reduce((latest, deal) => (deal.monday_synced_at > latest ? deal.monday_synced_at : latest), '')

  const kpis = [
    { label: 'Deals added', value: selected.added, sub: money(selected.addedTcv), was: previous.added },
    { label: 'Submitted', value: selected.submitted, was: previous.submitted },
    { label: 'Won', value: selected.won, sub: money(selected.wonTcv), was: previous.won, tone: 'won' },
    { label: 'Lost', value: selected.lost, was: previous.lost, tone: 'lost' },
    {
      label: 'Win rate',
      value: percent(selected.winRate),
      sub: `All deals ${percent(allTime.rate)} · ${allTime.won} won · ${allTime.lost} lost`,
      was: percent(previous.winRate),
    },
  ]

  return (
    <div className="exec-dashboard">
      <div className="pipeline-band">
        <div className="pband-stats">
          <span className="pband-stat"><b>TT Exec</b></span>
          <i className="pband-divider" aria-hidden="true" />
          <span className="pband-stat"><b>{open.length}</b> open {open.length === 1 ? 'deal' : 'deals'}</span>
          <i className="pband-divider" aria-hidden="true" />
          <span className="pband-stat"><b>{money(openTcv)}</b> pipeline</span>
          <i className="pband-divider" aria-hidden="true" />
          <span className="pband-stat"><b className={cx(waiting.length > 0 && 'pband-due')}>{waiting.length}</b> waiting for assignment</span>
          {lastRead && (
            <>
              <i className="pband-divider" aria-hidden="true" />
              <span className="pband-stat" title="When s0L last read the monday board">board read <b>{asOf(lastRead)}</b></span>
            </>
          )}
        </div>
      </div>

      <Notices canPost={canAssign} />

      <div className="toolbar-strip" role="toolbar" aria-label="Period">
        <div className="toolbar-strip-group">
          <span className="toolbar-strip-label">Period</span>
          {PERIODS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={cx('chip', 'chip--interactive', size === id && 'chip--active')}
              aria-pressed={size === id}
              onClick={() => { setSize(id); setBack(0) }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="toolbar-strip-group">
          <button type="button" className="chip chip--interactive" aria-label={`Previous ${period.label.toLowerCase()}`} onClick={() => setBack((b) => b + 1)}>
            <ChevronLeftIcon aria-hidden="true" />
          </button>
          <span className="exec-period">{selected.label}</span>
          <button type="button" className="chip chip--interactive" aria-label={`Next ${period.label.toLowerCase()}`} disabled={back === 0} onClick={() => setBack((b) => b - 1)}>
            <ChevronRightIcon aria-hidden="true" />
          </button>
        </div>
        <span className="toolbar-strip-hint">Counted by the day a deal was added to the board and the day its status last changed</span>
      </div>

      <div className="exec-kpis">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={cx('exec-kpi', kpi.tone && `exec-kpi--${kpi.tone}`)}>
            <span className="exec-kpi-label">{kpi.label}</span>
            <span className="exec-kpi-value">{kpi.value}</span>
            <span className="exec-kpi-sub">{kpi.sub || '\u00a0'}</span>
            <span className="exec-kpi-was">{previous.label}: {kpi.was}</span>
          </div>
        ))}
      </div>

      <section className="exec-panel">
        <h3 className="exec-panel-title">Last {TREND_LENGTH} {period.plural}</h3>
        <table className="pm-table exec-table">
          <thead>
            <tr>
              <th>{period.label}</th><th>Added</th><th className="exec-num">TCV added</th><th className="exec-num">Submitted</th>
              <th className="exec-num">Won</th><th className="exec-num">TCV won</th><th className="exec-num">Lost</th><th className="exec-num">Win rate</th>
            </tr>
          </thead>
          <tbody>
            {[...periods].reverse().map((p) => (
              <tr key={p.index} className={cx(p.index === selected.index && 'exec-table-current')}>
                <td>{p.label}</td>
                <td>
                  <span className="exec-added">
                    <span className="exec-added-count">{p.added}</span>
                    <span className="exec-bar" aria-hidden="true"><i style={{ width: `${(p.added / topAdded) * 100}%` }} /></span>
                  </span>
                </td>
                <td className="exec-num">{money(p.addedTcv)}</td>
                <td className="exec-num">{p.submitted}</td>
                <td className="exec-num">{p.won}</td>
                <td className="exec-num">{money(p.wonTcv)}</td>
                <td className="exec-num">{p.lost}</td>
                <td className="exec-num">{percent(p.winRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="exec-grid">
        <Breakdown title="Open deals by status" groups={groupDeals(open, 'status', dealTcv)} />
        <Breakdown title="Open deals by practice" groups={groupDeals(open, 'practice', dealTcv)} />
        <Breakdown title="Open deals per lead solutioner" groups={groupDeals(open, 'solutioner', dealTcv)} />
      </div>

      <section className="exec-panel">
        <h3 className="exec-panel-title">
          Waiting for assignment
          {!canAssign && waiting.length > 0 && <span className="exec-panel-note">TT Execs assign these from here</span>}
          <span className="exec-panel-search"><DealSearch value={arrangement.searchTerm} onChange={arrangement.setSearchTerm} /></span>
        </h3>
        {waiting.length === 0 ? <p className="exec-empty">Every open deal has a lead solutioner.</p> : (
          <>
            <ArrangeToolbar arrangement={arrangement} label="Arrange the deals waiting for assignment" />
            <PipelineMetrics
              deals={arrangement.shown}
              groups={arrangement.groups}
              openGroups={arrangement.openGroups}
              onToggleGroup={arrangement.toggleGroup}
              pageSize={arrangement.rowsPerPage}
              resetKey={arrangement.resetKey}
              onSelectDeal={onSelectDeal}
            />
          </>
        )}
      </section>
    </div>
  )
}
