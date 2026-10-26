/**
 * Resolve a seven-day listening chart's selected date.
 *
 * Hover and keyboard focus are transient previews. Clicking pins a date;
 * clicking it again unpins it. Missing/stale dates fall back to the last
 * date in the current rolling window (today).
 */
export const resolveTrendDisplayDate = (
  availableDates: readonly string[],
  hoveredDate: string | null,
  focusedDate: string | null,
  pinnedDate: string | null
): string | null => {
  const available = new Set(availableDates)
  return (
    [hoveredDate, focusedDate, pinnedDate].find(
      (date): date is string => date !== null && available.has(date)
    ) ??
    availableDates.at(-1) ??
    null
  )
}

export const toggleTrendPinnedDate = (
  pinnedDate: string | null,
  clickedDate: string
): string | null => (pinnedDate === clickedDate ? null : clickedDate)
