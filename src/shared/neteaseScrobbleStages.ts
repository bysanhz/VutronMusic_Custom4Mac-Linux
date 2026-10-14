/**
 * @fileoverview Testable two-stage NetEase PLV/PLD transport.
 *
 * A PLV upload that received a file acknowledgement is journaled before PLD.
 * If PLD fails, the same stable segment ID retries ONLY PLD. Completion
 * receipts and actual NetEase listening statistics remain separate concerns.
 */

export type ScrobbleStageAck = { success: boolean }

export type ScrobbleStageResult<T extends ScrobbleStageAck> = {
  plv: T | null
  pld: T | null
  plvPreviouslyAcknowledged: boolean
  failedStage?: 'plv' | 'pld'
}

export const uploadScrobbleStages = async <T extends ScrobbleStageAck>(options: {
  segmentId: string
  hasPlvReceipt: () => boolean
  recordPlvReceipt: () => void
  uploadPlv: () => Promise<T>
  uploadPld: () => Promise<T>
}): Promise<ScrobbleStageResult<T>> => {
  const plvPreviouslyAcknowledged = Boolean(options.segmentId && options.hasPlvReceipt())
  let plv: T | null = null
  if (!plvPreviouslyAcknowledged) {
    plv = await options.uploadPlv()
    if (!plv.success) {
      return { plv, pld: null, plvPreviouslyAcknowledged, failedStage: 'plv' }
    }
    // Persist BEFORE the next network request, not at the end of both stages.
    if (options.segmentId) options.recordPlvReceipt()
  }

  const pld = await options.uploadPld()
  if (!pld.success) {
    return { plv, pld, plvPreviouslyAcknowledged, failedStage: 'pld' }
  }
  return { plv, pld, plvPreviouslyAcknowledged }
}
