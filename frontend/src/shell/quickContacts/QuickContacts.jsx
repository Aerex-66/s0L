import { useCallback, useEffect, useState } from 'react'
import WorkspaceTabs from '../../shared/ui/WorkspaceTabs'
import { directoryService } from '../../shared/services/directoryService'
import { peopleWith } from '../../shared/utils/directory'
import PeopleList from './PeopleList'
import ReviewSlots from './ReviewSlots'
import SalAreas from './SalAreas'

const TAB_IDS = ['deal_team', 'sal', 'sldl', 'srr', 'prr']
const LABELS = { deal_team: 'Deal Team', sal: 'SAL', sldl: 'SLDL', srr: 'SRR', prr: 'PRR' }
const NOTHING = { people: [], sal_areas: [], sectors: [], review_forms: { srr: {}, prr: {} } }

/** The people the solutioner works with, by role, and each sector's SRR and PRR review forms. */
export default function QuickContacts({ initialTab }) {
  const [tab, setTab] = useState(TAB_IDS.includes(initialTab) ? initialTab : 'deal_team')
  const [data, setData] = useState(NOTHING)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(() => directoryService.quickContacts()
    .then((next) => setData({ ...NOTHING, ...next }))
    .catch((failure) => setError(`Quick contacts didn't load: ${failure.message}`))
    .finally(() => setLoaded(true)), [])

  useEffect(() => { reload() }, [reload])

  /** Runs one change, then reloads; resolves to whether it worked. */
  const run = async (work) => {
    setError('')
    try {
      await work()
      await reload()
      return true
    } catch (failure) {
      setError(failure.message)
      return false
    }
  }

  const add = (person, role) => run(() => directoryService.addPerson({ ...person, roles: [role] }))
  const removeRole = (person, isGone) => run(() => {
    const roles = (person.roles || []).filter((role) => !isGone(role))
    return roles.length ? directoryService.updatePerson(person.id, { roles }) : directoryService.removePerson(person.id)
  })
  const saveForm = (form) => run(() => directoryService.saveReviewForm(form))

  const counts = {
    deal_team: peopleWith(data.people, 'deal_team').length,
    sal: peopleWith(data.people, 'sal').length,
    sldl: peopleWith(data.people, 'sldl').length,
  }
  const tabs = TAB_IDS.map((id) => ({ id, label: LABELS[id], badge: () => counts[id] || null }))
  const shared = { people: data.people, onAdd: add, onRemoveRole: removeRole }

  return (
    <section className="quick-contacts" aria-labelledby="quick-contacts-title">
      <h3 className="outlook-panel-heading" id="quick-contacts-title">Quick contacts</h3>
      <WorkspaceTabs tabs={tabs} activeTab={tab} onSelect={setTab} />
      {error && <p className="pm-assign-error" role="alert">{error}</p>}
      <div className="qc-body" role="tabpanel" aria-label={LABELS[tab]}>
        {!loaded && <p className="qc-none">Loading…</p>}
        {loaded && (tab === 'deal_team' || tab === 'sldl') && <PeopleList key={tab} kind={tab} {...shared} />}
        {loaded && tab === 'sal' && <SalAreas areas={data.sal_areas} {...shared} />}
        {loaded && (tab === 'srr' || tab === 'prr') && (
          <ReviewSlots key={tab} kind={tab} sectors={data.sectors} forms={data.review_forms} onSaveForm={saveForm} {...shared} />
        )}
      </div>
    </section>
  )
}
