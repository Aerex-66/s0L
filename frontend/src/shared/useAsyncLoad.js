import { useState, useEffect, useCallback } from 'react'

/**
 * Custom hook to handle asynchronous data loading with loading and error states.
 * 
 * @param {Function} fetchFn - The async function to fetch data.
 * @param {Array} dependencies - Dependencies array for the useCallback hook.
 * @param {any} initialData - Initial state for the data.
 * @returns {Object} { data, loading, error, reload, setData }
 */
export function useAsyncLoad(fetchFn, dependencies = [], initialData = null) {
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchFn()
      setData(result)
    } catch (err) {
      console.error('Error loading data:', err)
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, dependencies)

  useEffect(() => {
    // Use setTimeout to push the fetch to the end of the event loop,
    // preventing UI blocking during initial render (matching previous behavior)
    const id = setTimeout(() => {
      loadData()
    }, 0)
    return () => clearTimeout(id)
  }, [loadData])

  return { data, loading, error, reload: loadData, setData }
}
