type LedgerTotals = { pending: number; accepted: number; provisional: number }

/**
 * Pending is durable and upload-eligible; provisional is the in-memory
 * uncommitted remainder. Its eligibility is tracked separately: before the
 * effective-listening threshold it must not be presented as ready to send.
 * After qualification, the UI may display that remainder alongside pending
 * without changing the five-second persistence cadence.
 */
export const splitNeteaseSyncStatusByDay = (today: LedgerTotals, earlier: LedgerTotals) => {
  return {
    todayPending: today.pending,
    todayAccepted: today.accepted,
    todayProvisional: today.provisional,
    earlierPending: earlier.pending,
    earlierAccepted: earlier.accepted,
    earlierProvisional: earlier.provisional
  }
}
