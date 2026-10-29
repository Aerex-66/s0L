import { useState } from 'react'
import { ExternalLinkIcon } from '../../shared/ui/Icons'
import { REVIEW_HOW, formFor, howLabel, peopleWith, sameText } from '../../shared/utils/directory'
import { webLink } from '../../shared/utils/webLink'
import AddPerson from './AddPerson'
import Chip from './Chip'

const NEEDS_LINK = new Set(['form', 'word'])

/** Where a sector's form stands, in plain words: a missing link is never an error. */
function standing(draft) {
  if (webLink(draft.url)) return null
  if (draft.url.trim()) return "That isn't a web address yet: it needs to start with https://"
  if (NEEDS_LINK.has(draft.how)) return 'No link yet'
  return howLabel(draft.how)
}

/** One sector: how its review works, the form's link, a note, and who reviews. Saved as each field is left. */
function ReviewSlot({ kind, sector, form, reviewers, onSaveForm, onRemoveRole }) {
  const stored = { how: form?.how || '', url: form?.url || '', note: form?.note || '' }
  const [draft, setDraft] = useState(stored)
  const link = webLink(draft.url)
  const note = standing(draft)
  const label = kind.toUpperCase()

  const save = (next = draft) => {
    if (next.url.trim() && !webLink(next.url)) return
    if (next.how === stored.how && next.url.trim() === stored.url && next.note.trim() === stored.note) return
    onSaveForm({ kind, sector, ...next })
  }

  return (
    <section className="qc-slot" aria-label={`${sector} ${label}`}>
      <div className="qc-slot-head">
        <h4 className="qc-slot-title">{sector}</h4>
        {link ? (
          <a className="ws-link" href={link} target="_blank" rel="noopener noreferrer">
            <ExternalLinkIcon size={12} /> Open the {label} form
          </a>
        ) : (
          <span className={draft.url.trim() ? 'qc-warning' : 'qc-none'}>{note}</span>
        )}
      </div>
      <div className="qc-slot-fields">
        <label className="qc-field">
          <span className="qc-field-label">How it works</span>
          <select
            value={draft.how}
            onChange={(event) => {
              const next = { ...draft, how: event.target.value }
              setDraft(next)
              save(next)
            }}
          >
            {REVIEW_HOW.map((how) => <option key={how.value} value={how.value}>{how.label}</option>)}
          </select>
        </label>
        <label className="qc-field">
          <span className="qc-field-label">Form link</span>
          <input
            type="url"
            value={draft.url}
            onChange={(event) => setDraft({ ...draft, url: event.target.value })}
            onBlur={() => save()}
            placeholder="https://… (add it when you have it)"
          />
        </label>
        <label className="qc-field">
          <span className="qc-field-label">Note</span>
          <input
            type="text"
            value={draft.note}
            onChange={(event) => setDraft({ ...draft, note: event.target.value })}
            onBlur={() => save()}
            placeholder="Where the Word document goes, who to invite…"
          />
        </label>
      </div>
      <div className="qc-slot-people">
        <span className="qc-field-label">Reviewers</span>
        <span className="qc-chips">
          {reviewers.length ? reviewers.map((person) => (
            <Chip
              key={person.id}
              label={person.name}
              sub={person.email}
              title={person.email || 'No email on file'}
              onRemove={() => onRemoveRole(person, (role) => role.kind === kind && sameText(role.sector, sector))}
              removeLabel={`Remove ${person.name} as a ${sector} ${label} reviewer`}
            />
          )) : <span className="qc-none">No reviewers yet</span>}
        </span>
      </div>
    </section>
  )
}

/** SRR or PRR: a slot per sector on the board, each with its form and its reviewers. */
export default function ReviewSlots({ kind, sectors, forms, people, onAdd, onRemoveRole, onSaveForm }) {
  const [sector, setSector] = useState('')
  const chosen = sector || sectors[0] || ''
  const label = kind.toUpperCase()

  return (
    <div className="qc-tab">
      <p className="qc-intro">
        Each sector on the monday board has its own {label} form, or none. Most are online forms on IBM&apos;s intranet;
        some want a Word document or a calendar invite. Add each link when you have it: your browser opens it, s0L never does.
      </p>
      {sectors.length > 0 && (
        <AddPerson
          label="Add reviewer"
          detail={(
            <select value={chosen} onChange={(event) => setSector(event.target.value)} aria-label="Sector">
              {sectors.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          )}
          onAdd={(person) => onAdd(person, { kind, sector: chosen })}
        />
      )}
      {sectors.length ? (
        <div className="qc-slots">
          {sectors.map((name) => (
            <ReviewSlot
              key={name}
              kind={kind}
              sector={name}
              form={formFor(forms, kind, name)}
              reviewers={peopleWith(people, kind, (role) => sameText(role.sector, name))}
              onSaveForm={onSaveForm}
              onRemoveRole={onRemoveRole}
            />
          ))}
        </div>
      ) : (
        <p className="qc-empty">No deal has a sector on the monday board yet, so there are no slots to fill.</p>
      )}
    </div>
  )
}
