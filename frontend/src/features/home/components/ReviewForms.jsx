import useOutlookStore from '../../../shared/outlookStore'
import { useAsyncLoad } from '../../../shared/useAsyncLoad'
import { directoryService } from '../../../shared/services/directoryService'
import { dealSectors, formFor, howLabel, peopleWith, sameText } from '../../../shared/utils/directory'
import { webLink } from '../../../shared/utils/webLink'
import { ExternalLinkIcon } from '../../../shared/ui/Icons'

const KINDS = [['srr', 'SRR'], ['prr', 'PRR']]
const NEEDS_LINK = new Set(['form', 'word'])

function standing(form, link) {
  if (link) return form.how ? howLabel(form.how) : 'Form'
  if (NEEDS_LINK.has(form.how)) return `${howLabel(form.how)} · no link yet`
  return howLabel(form.how)
}

/** The SRR and PRR forms for this deal's sector(s), as recorded in Outlook → Quick contacts. */
export default function ReviewForms({ deal }) {
  const panelOpen = useOutlookStore((s) => s.panelOpen)
  const openPanel = useOutlookStore((s) => s.openPanel)
  // Reads again when the panel closes, so a link just added shows here.
  const { data, error } = useAsyncLoad(() => directoryService.quickContacts(), [panelOpen], null)
  const sectors = dealSectors(deal)

  return (
    <section className="ws-panel" aria-labelledby="ov-forms">
      <div className="ws-panel-head">
        <h3 className="ws-panel-title" id="ov-forms">Review forms</h3>
        {sectors.length > 0 && <span className="ws-panel-note">{sectors.join(' · ')}</span>}
        <button type="button" className="cmd-btn ws-panel-action" onClick={() => openPanel('srr')}>Set up</button>
      </div>
      {!sectors.length && (
        <p className="ws-empty-text">This deal has no sector on the monday board yet, so s0L can&apos;t tell which SRR and PRR forms apply.</p>
      )}
      {sectors.length > 0 && error && <p className="ws-empty-text">The review forms didn&apos;t load: {error}</p>}
      {sectors.length > 0 && data && (
        <ul className="ws-rows">
          {sectors.flatMap((sector) => KINDS.map(([kind, label]) => {
            const form = formFor(data.review_forms, kind, sector) || {}
            const link = webLink(form.url)
            const reviewers = peopleWith(data.people, kind, (role) => sameText(role.sector, sector)).map((person) => person.name)
            const sub = [reviewers.length ? `Reviewers: ${reviewers.join(', ')}` : '', form.note].filter(Boolean).join(' · ')
            return (
              <li key={`${sector}-${kind}`} className="ws-row">
                <span className="ws-row-label">{sectors.length > 1 ? `${sector} ${label}` : label}</span>
                <span className={`ws-row-value${form.how || link ? '' : ' is-empty'}`}>
                  {standing(form, link)}
                  {link && (
                    <a className="ws-link ov-form-open" href={link} target="_blank" rel="noopener noreferrer">
                      <ExternalLinkIcon size={12} /> Open
                    </a>
                  )}
                  {sub && <span className="ws-row-sub">{sub}</span>}
                </span>
              </li>
            )
          }))}
        </ul>
      )}
    </section>
  )
}
