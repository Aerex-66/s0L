/**
 * useHeaderMetrics — computes the GSSM topbar metrics (hours, man-days,
 * revenue, cost, blended rate) from the Staffing / PTI / Forex sheets,
 * with currency toggling.
 *
 * s0L-only shell hook — NOT part of the standalone sync boundary.
 */
import { useCallback, useMemo, useState } from 'react'
import { findStaffingLayout } from '../utils/cellUtils'

export function useHeaderMetrics({ workbookDataRef, metricsVersion }) {
  const [headerCurrencyMode, setHeaderCurrencyMode] = useState('USD')

  const headerMetrics = useMemo(() => {
    const staffing = workbookDataRef.current?.rowDataBySheet?.['Staffing']
    const pti = workbookDataRef.current?.rowDataBySheet?.['PTI_Estimator']
    const forex = workbookDataRef.current?.rowDataBySheet?.['Forex']
    if (!staffing) return null

    const { headerRow, dataStartRow } = findStaffingLayout(staffing)
    const hdrRow = staffing[headerRow] || {}
    let colHours = -1, colFees = -1, colLaborCost = -1
    for (let c = 0; c < 80; c++) {
      const v = String(hdrRow[`c${c}`] || '').trim()
      if (v === 'Hours' && colHours < 0) colHours = c
      else if (v === 'Fees') colFees = c
      else if (v === 'Labor Cost') colLaborCost = c
    }
    if (colFees < 0) colFees = 44
    if (colHours < 0) colHours = 43
    if (colLaborCost < 0) colLaborCost = 41

    let hours = 0, fees = 0, laborCost = 0
    for (let i = dataStartRow; i < staffing.length; i++) {
      const row = staffing[i]
      if (!row) continue
      hours += Number(row[`c${colHours}`]) || 0
      fees += Number(row[`c${colFees}`]) || 0
      laborCost += Number(row[`c${colLaborCost}`]) || 0
    }

    let revenue = fees
    const ptiVal = (row1) => Number(pti?.[row1 - 1]?.c1) || 0
    const ptiText = (row1) => pti?.[row1 - 1]?.c1 ? String(pti[row1 - 1].c1).trim() : ''

    const pmr = ptiVal(32)
    const workingCapital = ptiVal(33)
    let totalCost = laborCost + pmr + workingCapital
    if (laborCost === 0) {
      laborCost = ptiVal(31)
      totalCost = ptiVal(34)
    }

    const manDays = hours / 8
    let blended = hours > 0 ? fees / hours : 0

    const modelCurrency = (ptiText(25) || ptiText(26) || 'USD').toUpperCase()
    const displayCurrency = headerCurrencyMode.toUpperCase()

    const getRateFor = (isoCode) => {
      if (!isoCode || isoCode === 'USD') return 1
      if (forex) {
        for (let r = 2; r < forex.length; r++) {
          const row = forex[r]
          if (!row) continue
          const iso = String(row.c2 || '').trim().toUpperCase()
          if (iso === isoCode) return Number(row.c3) || 1
        }
      }
      return 1
    }

    const usdToBase = getRateFor(modelCurrency)
    const usdToTarget = getRateFor(displayCurrency)
    const multiplier = usdToBase ? (usdToTarget / usdToBase) : 1

    if (multiplier !== 1) {
      revenue *= multiplier
      laborCost *= multiplier
      totalCost *= multiplier
      blended *= multiplier
    }

    return { hours, fees, manDays, laborCost, totalCost, revenue, blended, displayCurrency }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricsVersion, headerCurrencyMode])

  const availableCurrencies = useMemo(() => {
    const list = ['USD']
    const forex = workbookDataRef.current?.rowDataBySheet?.['Forex']
    if (forex) {
      for (let r = 2; r < forex.length; r++) {
        const iso = String(forex[r]?.c2 || '').trim().toUpperCase()
        if (iso && !list.includes(iso)) list.push(iso)
      }
    }
    return list
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricsVersion])

  const toggleHeaderCurrency = useCallback(() => {
    setHeaderCurrencyMode((prev) => {
      const list = availableCurrencies
      const idx = list.indexOf(prev.toUpperCase())
      return list[(idx + 1) % list.length]
    })
  }, [availableCurrencies])

  return { headerMetrics, toggleHeaderCurrency }
}
