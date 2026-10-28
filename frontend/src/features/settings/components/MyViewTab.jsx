import { useMemo } from 'react'
import { FormField } from '../../../shared/ui/FormField'
import useStore from '../../../shared/useStore'
import useDealStore from '../../../shared/dealStore'
import { solutionerNames } from '../../../shared/utils/solutioners'

export default function MyViewTab() {
  const preferences = useStore((s) => s.preferences)
  const savePreferences = useStore((s) => s.savePreferences)
  const deals = useDealStore((s) => s.deals)
  const names = useMemo(() => solutionerNames(deals), [deals])
  const known = !preferences.solutioner || names.includes(preferences.solutioner)

  return (
    <div className="settings-section">
      <h3>My view</h3>
      <p className="section-description">
        Pick your name as it appears on the monday board (Lead SSC or SSC2–SSC4). The dashboard then opens on
        your deals. Choose everyone&apos;s deals for the team view, which shows each solutioner&apos;s pipeline.
      </p>

      <FormField label="I am">
        <select value={preferences.solutioner} onChange={(e) => savePreferences({ solutioner: e.target.value })}>
          <option value="">—</option>
          {!known && <option value={preferences.solutioner}>{preferences.solutioner}</option>}
          {names.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </FormField>

      <FormField label="Dashboard opens on">
        <select value={preferences.scope} onChange={(e) => savePreferences({ scope: e.target.value })}>
          <option value="mine">My deals</option>
          <option value="everyone">Everyone&apos;s deals (team view)</option>
        </select>
      </FormField>
    </div>
  )
}
