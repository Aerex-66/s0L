export function calculatePhaseEndDate(startDate, duration, unit) {
  const start = new Date(startDate)
  if (isNaN(start.getTime())) return new Date(NaN)
  const end = new Date(start)
  if (unit === 'weeks') {
    end.setDate(end.getDate() + (duration * 7))
  } else {
    end.setMonth(end.getMonth() + duration)
  }
  return end
}

export function getUnifiedDateRange(timelines, phases) {
  let earliestStart = null
  let latestEnd = null

  timelines.forEach((timelineItem) => {
    if (!timelineItem.project_start_date) return
    const timeline = timelineItem.timeline || {}
    const start = new Date(timelineItem.project_start_date)

    if (!earliestStart || start < earliestStart) {
      earliestStart = start
    }

    let currentDate = new Date(start)
    phases.forEach((phase) => {
      const phaseData = timeline[phase] || { duration: 2, unit: 'months' }
      currentDate = calculatePhaseEndDate(currentDate, phaseData.duration, phaseData.unit)
    })

    if (!latestEnd || currentDate > latestEnd) {
      latestEnd = currentDate
    }
  })

  return { earliestStart, latestEnd }
}

/**
 * Distribute a total duration across SAP phases based on implementation type and methodology.
 * Returns a phases object: { [phaseName]: { duration, unit } }
 */
export function autoCalculateTimeline(totalDuration, durationUnit, implementationType, methodology, distributions) {
  const total = Number(totalDuration) || 12
  const totalWeeks = durationUnit === 'months' ? total * 4.33 : total
  const typeDist = distributions[implementationType] || distributions['Greenfield']
  const dist = typeDist[methodology] || typeDist['balanced']
  const phases = {}

  Object.entries(dist).forEach(([phase, percentage]) => {
    const weeks = Math.round(totalWeeks * percentage)
    if (durationUnit === 'months') {
      phases[phase] = { duration: Math.max(1, Math.round(weeks / 4.33)), unit: 'months' }
    } else {
      phases[phase] = { duration: Math.max(1, weeks), unit: 'weeks' }
    }
  })

  return phases
}
