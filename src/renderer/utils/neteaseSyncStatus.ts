type LedgerTotals = { pending: number; accepted: number; provisional: number }

/** The two inputs are disjoint date ranges, not balances from different report periods. */
export const splitNeteaseSyncStatusByDay = (today: LedgerTotals, earlier: LedgerTotals) => {
  return {
    todayPending: today.pending + today.provisional,
    todayAccepted: today.accepted,
    earlierPending: earlier.pending + earlier.provisional,
    earlierAccepted: earlier.accepted
  }
}
