import { useCallback, useRef, useState } from 'react'
import { mondayService } from '../../shared/services/mondayService'
import useDealStore from '../../shared/dealStore'

const NOT_LOADED = { status: 'idle', columns: {}, error: '' }

/**
 * Assigning people from the list: the names each board column offers (asked once, when a
 * picker first opens) and one confirmed change at a time, written to monday, then to the deal cache.
 */
export function useAssignPeople() {
  const [people, setPeople] = useState(NOT_LOADED)
  const [change, setChange] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(null)

  const loadPeople = useCallback(() => {
    if (request.current) return
    setPeople({ ...NOT_LOADED, status: 'loading' })
    request.current = mondayService.people()
      .then((body) => setPeople({ status: 'ready', columns: body.columns || {}, error: '' }))
      .catch((failure) => {
        request.current = null
        setPeople({ status: 'error', columns: {}, error: failure.message })
      })
  }, [])

  const ask = useCallback((next) => {
    setError('')
    setChange(next)
  }, [])

  const cancel = useCallback(() => setChange(null), [])

  const confirm = async () => {
    if (!change || saving) return
    setSaving(true)
    setError('')
    try {
      useDealStore.getState().patchDeal(await mondayService.assign(change.dealId, change.key, change.name))
      setChange(null)
    } catch (failure) {
      setError(failure.message)
      // The board's names may have changed since they were loaded; the next picker asks again.
      request.current = null
      setPeople(NOT_LOADED)
    } finally {
      setSaving(false)
    }
  }

  return { people, loadPeople, change, ask, cancel, confirm, saving, error }
}
