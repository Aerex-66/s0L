import { useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import { isClosedDeal, isWonDeal, dealStatusColor } from '../../../shared/constants'
import { isMondayLinked } from '../../../shared/constants/fieldIndex'
import { leadSolutioner, UNASSIGNED } from '../../../shared/utils/solutioners'
import { formatCompactMillions } from '../../../shared/utils/formatters'
import { LayersIcon, ChevronRightIcon } from '../../../shared/ui/Icons'
import { cx } from '../../../shared/utils/cx'
import ArrangeToolbar from './ArrangeToolbar'
import DealSearch from './DealSearch'
import PipelineMetrics from './PipelineMetrics'
import Pagination from './Pagination'
import DealGlyph from './DealGlyph'
import FitText from './FitText'
import { usePage } from '../pagination'
import { glyphDepth, tcvMeter } from '../glyph'
import { logoFor, practiceOf, vendorName, vendorOf } from '../practices'
import { descriptionParts } from '../tileText'
import { GROUPINGS } from '../grouping'
import { dueSoon } from '../dueSoon'
import { dealTcv } from '../tcv'
import { useArrangement } from '../useArrangement'
import useClientLogoStore, { clientKey, logoSrc } from '../clientLogoStore'
import useDealStore from '../../../shared/dealStore'

const TILE_PAGE_SIZE = 24

const monogram = (name) => (name === UNASSIGNED ? '–' : name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase())

const resolveTcv = dealTcv

export default function DealList({ deals, teamView, needsName, me = '', onPickName, viewMode, layoutMode, onSelectDeal, onArchiveDeal, onRestoreDeal, onCreateDeal }) {
  const mondayName = useDealStore((s) => s.mondayMe?.name || '')
  const openNamePicker = useDealStore((s) => s.openNamePicker)
  const listRef = useRef(null)
  const clientLogos = useClientLogoStore((s) => s.logos)
  const logosRunning = useClientLogoStore((s) => s.running)
  const resolveLogos = useClientLogoStore((s) => s.resolve)
  const loadLogos = useClientLogoStore((s) => s.load)

  useEffect(() => { resolveLogos() }, [resolveLogos])
  // While the backend is still looking logos up, pick new ones up as they land.
  useEffect(() => {
    if (!logosRunning) return undefined
    const timer = setInterval(loadLogos, 6000)
    return () => clearInterval(timer)
  }, [logosRunning, loadLogos])

  const activeDeals = useMemo(() => deals.filter(d => !isClosedDeal(d)), [deals])
  const closedDeals = useMemo(() => deals.filter(isClosedDeal), [deals])

  const viewDeals = viewMode === 'active' ? activeDeals : closedDeals
  const listView = layoutMode === 'metrics'
  // My deals are all the same solutioner's, so that grouping is only offered in the team view, which opens on it.
  const groupings = teamView ? GROUPINGS : GROUPINGS.filter((option) => option.id !== 'solutioner')
  const arrangement = useArrangement(viewDeals, {
    groupings, defaultGroup: teamView ? 'solutioner' : 'none', filtering: listView, rememberAs: 's0l-arrange-dashboard',
  })
  const { searchTerm, setSearchTerm, groupBy, shown, groups, openGroups, toggleGroup, rowsPerPage } = arrangement
  const topGroupTcv = groups ? Math.max(0, ...groups.map((group) => group.tcv)) : 0

  const resetKey = `${viewMode}|${teamView}|${arrangement.resetKey}`
  const { page, pageCount, setPage } = usePage(shown.length, TILE_PAGE_SIZE, resetKey)
  const pageDeals = shown.slice((page - 1) * TILE_PAGE_SIZE, page * TILE_PAGE_SIZE)
  const tcvLogs = shown.map((d) => Number(resolveTcv(d)) || 0).filter((v) => v > 0).map(Math.log10)
  const tcvRange = tcvLogs.length ? [Math.min(...tcvLogs), Math.max(...tcvLogs)] : null
  const goToPage = (next) => {
    setPage(next)
    listRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  // The band counts what's on screen: this view (active or archived), the search, the list's filters and the grouping.
  const shownTcv = shown.reduce((sum, d) => sum + (Number(resolveTcv(d)) || 0), 0)
  const shownWon = shown.filter(isWonDeal).length
  const dueThisWeek = dueSoon(shown).length
  const groupNoun = GROUPINGS.find((option) => option.id === groupBy)?.noun
  const namedGroups = groups ? groups.filter((group) => !group.missing).length : 0

  const renderTile = (deal) => {
    const practice = practiceOf(deal.monday_group)
    const PracticeIcon = practice.Icon
    const vendor = vendorOf(practice, `${deal.project_name || ''} ${deal.implementation_type || ''}`)
    const logo = logoFor(vendor)
    const tcv = Number(resolveTcv(deal)) || 0
    const lead = deal.lead_ssc ? leadSolutioner(deal) : ''
    const showLead = lead && lead.toLowerCase() !== me.trim().toLowerCase()
    const clientLogo = clientLogos[clientKey(deal.client_name)]
    const description = descriptionParts(deal.project_name, deal.client_name)

    return (
      <motion.div
        key={deal.id}
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2, layout: { type: 'spring', damping: 25, stiffness: 300 } }}
        className="deal-card deal-tile"
        onClick={() => onSelectDeal(deal.id)}
        style={{ '--card-accent': practice.color, '--practice-c': practice.color, '--meter': tcvMeter(tcv, tcvRange) }}
      >
        <div className="deal-card-accent" />
        <DealGlyph seed={deal.monday_item_id || deal.id} depth={glyphDepth(tcv)} />
        <div className="deal-tile-body">
          <div className="deal-tile-top">
            <span className="deal-tile-status" style={{ '--status-c': dealStatusColor(deal.status) }}>
              <i className="deal-status-dot" aria-hidden="true" />{deal.status || '—'}
              {deal.implementation_type && (
                <span className="deal-tile-type" title={`Implementation type: ${deal.implementation_type}`}>{deal.implementation_type}</span>
              )}
            </span>
            {clientLogo && (
              <img className="deal-tile-client-logo" src={logoSrc(clientLogo)} alt="" draggable="false" loading="lazy" />
            )}
          </div>
          <FitText as="h3" className="deal-tile-client" title={deal.client_name}>{deal.client_name || deal.project_name || 'Untitled deal'}</FitText>
          <div className="deal-tile-desc" title={deal.project_name}>
            {description.length ? description.map((part, index) => (
              <span key={index}>{index > 0 && <i className="deal-tile-desc-sep" aria-hidden="true">·</i>}{part}</span>
            )) : '\u00a0'}
          </div>

          <div className="deal-tile-foot">
            <span className="deal-tile-figures">
              {tcv > 0 ? (
                <span className="deal-tile-tcv">
                  <span className="deal-tile-tcv-value">{formatCompactMillions(tcv)}</span>
                  <span className="deal-tile-tcv-label">TCV</span>
                </span>
              ) : (
                <span className="deal-tile-tcv-empty">No TCV yet</span>
              )}
              {showLead && (
                <span className="deal-tile-lead" title={`Lead solutioner: ${lead}`}>
                  <i className="deal-card-monogram" aria-hidden="true">{monogram(lead)}</i>
                  <span className="deal-card-lead-name">{lead}</span>
                </span>
              )}
            </span>
            {deal.monday_group && (logo ? (
              <span className="deal-tile-logo" title={`${vendorName(vendor)} · ${practice.name}`}>
                <img src={logo} alt={vendorName(vendor)} draggable="false" />
              </span>
            ) : (
              <span className="deal-tile-practice" title={`Practice: ${practice.name}`}>
                <PracticeIcon aria-hidden="true" />
                <span className="deal-tile-practice-name">{vendor ? vendorName(vendor) : practice.short}</span>
              </span>
            ))}
            {viewMode === 'active' && !isMondayLinked(deal) && (
              <button className="deal-archive-link" onClick={(e) => { e.stopPropagation(); onArchiveDeal?.(deal.id) }}>Archive</button>
            )}
            {viewMode === 'archives' && !isMondayLinked(deal) && (
              <button className="deal-restore-link" onClick={(e) => { e.stopPropagation(); onRestoreDeal?.(deal.id) }}>Restore</button>
            )}
          </div>
        </div>
        <div className="deal-tile-meter" aria-hidden="true" />
      </motion.div>
    )
  }

  return (
    <div className="deal-list-container" ref={listRef}>
      {/* Pipeline command band — one quiet line of stats about the deals on screen; wins only matter in the Metrics view */}
      <div className="pipeline-band">
        <div className="pband-stats">
          {mondayName && (
            <>
              <span className="pband-welcome">
                Welcome, <b>{mondayName}</b>
                <button type="button" className="pband-not-you" onClick={openNamePicker}>Not you?</button>
              </span>
              <i className="pband-divider" aria-hidden="true" />
            </>
          )}
          <span className="pband-stat"><b>{shown.length}</b> {shown.length === 1 ? 'deal' : 'deals'}</span>
          <i className="pband-divider" aria-hidden="true" />
          <span className="pband-stat"><b>{shownTcv > 0 ? formatCompactMillions(shownTcv) : '—'}</b> {viewMode === 'active' ? 'pipeline' : 'TCV'}</span>
          {viewMode === 'active' && (
            <>
              <i className="pband-divider" aria-hidden="true" />
              <span className="pband-stat" title="Deals whose RFP submission date is in the next 7 days">
                <b className={cx(dueThisWeek > 0 && 'pband-due')}>{dueThisWeek}</b> due in 1 week
              </span>
            </>
          )}
          {groupNoun && (
            <>
              <i className="pband-divider" aria-hidden="true" />
              <span className="pband-stat"><b>{namedGroups}</b> {namedGroups === 1 ? groupNoun[0] : groupNoun[1]}</span>
            </>
          )}
          {layoutMode === 'metrics' && viewMode === 'archives' && (
            <>
              <i className="pband-divider" aria-hidden="true" />
              <span className="pband-stat"><b className={cx(shownWon > 0 && 'pband-won')}>{shownWon}</b> won</span>
            </>
          )}
        </div>

        <DealSearch value={searchTerm} onChange={setSearchTerm} />
      </div>

      {needsName && (
        <div className="toolbar-strip">
          <span className="toolbar-strip-hint">
            Showing everyone&apos;s deals.{' '}
            <button type="button" className="chip chip--interactive" onClick={onPickName}>Pick your name</button>{' '}
            to see only yours.
          </span>
        </div>
      )}

      <ArrangeToolbar arrangement={arrangement} rows={listView} />

      {layoutMode === 'metrics' ? (
        <PipelineMetrics
          deals={shown}
          groups={groups}
          openGroups={openGroups}
          onToggleGroup={toggleGroup}
          pageSize={rowsPerPage}
          resetKey={resetKey}
          onSelectDeal={onSelectDeal}
        />
      ) : groups ? (
        <div className="deal-groups">
          {groups.map((group) => {
            const open = openGroups.has(group.key)
            return (
              <section key={group.key} className={cx('deal-group', open && 'deal-group--open')}>
                <button type="button" className="deal-group-head" aria-expanded={open} onClick={() => toggleGroup(group.key)}>
                  <ChevronRightIcon className="deal-group-chevron" aria-hidden="true" />
                  <span className="deal-group-name">
                    {group.color && <i className="deal-status-dot" style={{ '--status-c': group.color }} aria-hidden="true" />}
                    {group.label}
                  </span>
                  <span className="deal-group-count">{group.count} {group.count === 1 ? 'deal' : 'deals'}</span>
                  <span className="deal-group-bar" aria-hidden="true">
                    <i style={{ width: `${topGroupTcv > 0 ? (group.tcv / topGroupTcv) * 100 : 0}%` }} />
                  </span>
                  <span className="deal-group-tcv">{group.tcv > 0 ? formatCompactMillions(group.tcv) : '—'}</span>
                </button>
                {open && <div className="deals-grid">{group.deals.map(renderTile)}</div>}
              </section>
            )
          })}
          {groups.length === 0 && <p className="deal-groups-empty">No deals to show.</p>}
        </div>
      ) : (
      <>
      <div className="deals-grid">
        <LayoutGroup>
        <AnimatePresence mode="popLayout">
        {pageDeals.length > 0 ? pageDeals.map(renderTile) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="no-deals glass-panel"
          >
            <div className="no-deals-icon">
              <LayersIcon size={24} strokeWidth={1.5} />
            </div>
            <p>No active deals yet</p>
            <span>{searchTerm ? 'Try a different filter term.' : 'Create a deal to start tracking timelines, approvals, GSSM staffing, and iSBD decks.'}</span>
            {!searchTerm && (
              <div className="no-deals-action">
                <button className="btn btn-primary" onClick={onCreateDeal}>+ New Deal</button>
              </div>
            )}
          </motion.div>
        )}
        </AnimatePresence>
        </LayoutGroup>
      </div>
      <Pagination page={page} pageCount={pageCount} total={shown.length} pageSize={TILE_PAGE_SIZE} onPage={goToPage} />
      </>
      )}
    </div>
  )
}
