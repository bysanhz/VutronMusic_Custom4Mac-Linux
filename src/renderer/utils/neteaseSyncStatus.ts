type LedgerTotals = { pending: number; accepted: number; provisional: number }

/**
 * Pending is durable and upload-eligible; provisional is in-memory playback
 * that has not qualified for the session's minimum listening threshold.
 * Keep them separate to avoid falsely promising that 10s is ready to send.
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
