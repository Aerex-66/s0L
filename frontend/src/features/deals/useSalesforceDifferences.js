import { useCallback, useEffect, useRef, useState } from 'react'
import { salesforceService } from '../../shared/services/salesforceService'
import useDealStore from '../../shared/dealStore'

/** Where the board and Salesforce disagree, reloaded after every Salesforce check and whenever the deals change. */
export function useSalesforceDifferences() {
  const [state, setState] = useState({ rows: [], lastCheck: null, error: '' })
  const latest = useRef(0)
  const checkedAt = useDealStore((s) => s.salesforceCheck.at)
  const deals = useDealStore((s) => s.deals)

  const reload = useCallback(async () => {
    const ticket = ++latest.current
    try {
      const body = await salesforceService.differences()
      if (ticket === latest.current) setState({ rows: body.differences || [], lastCheck: body.last_check || null, error: '' })
    } catch (error) {
      if (ticket === latest.current) setState((current) => ({ ...current, error: error.message }))
    }
  }, [])

  useEffect(() => { reload() }, [reload, checkedAt, deals])

  return { ...state, reload }
}
