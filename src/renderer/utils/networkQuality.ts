export const NETEASE_REQUEST_METRIC_EVENT = 'vutronmusic-netease-request-metric'

export type NeteaseRequestMetric = { elapsedMs: number; ok: boolean }
export type NetworkQualitySample = NeteaseRequestMetric & { at: number }
export type NetworkQualityTier = 'unknown' | 'excellent' | 'good' | 'fair' | 'poor'

export type NeteaseFailureBurst = { startedAt: number; count: number }

/** Some API failures arrive with HTTP 200 and an error code in the response body. */
export const isNeteaseResponseHealthy = (status: number, data: unknown): boolean => {
  if (!Number.isFinite(status) || status < 200 || status >= 500) return false
  const responseCode = (data as { code?: unknown } | null)?.code
  if (responseCode === undefined || responseCode === null) return true
  const code = Number(responseCode)
  return Number.isFinite(code) && code < 500
}

/** Escalate only repeated failures within one short window, not a single failed endpoint. */
export const recordNeteaseFailure = (
  burst: NeteaseFailureBurst,
  now: number
): NeteaseFailureBurst =>
  burst.count > 0 && now >= burst.startedAt && now - burst.startedAt <= 30_000
    ? { startedAt: burst.startedAt, count: burst.count + 1 }
    : { startedAt: now, count: 1 }

export const summarizeNetworkQuality = (samples: NetworkQualitySample[], now: number) => {
  const recent = samples
    .filter(
      (sample) =>
        sample.at <= now &&
        now - sample.at <= 120_000 &&
        Number.isFinite(sample.elapsedMs) &&
        sample.elapsedMs >= 0
    )
    .slice(-12)
  const failedCount = recent.filter((sample) => !sample.ok).length
  const latencies = recent
    .filter((sample) => sample.ok)
    .map((sample) => sample.elapsedMs)
    .sort((a, b) => a - b)
  const middle = Math.floor(latencies.length / 2)
  const medianMs = latencies.length
    ? Math.round(
        latencies.length % 2 ? latencies[middle] : (latencies[middle - 1] + latencies[middle]) / 2
      )
    : null

  let tier: NetworkQualityTier = 'unknown'
  if (recent.length) {
    if (
      (failedCount >= 2 && failedCount / recent.length >= 0.3) ||
      (medianMs !== null && medianMs > 1_500)
    )
      tier = 'poor'
    else if (recent.length < 3) tier = 'unknown'
    else if (failedCount > 0 || medianMs === null || medianMs > 700) tier = 'fair'
    else if (medianMs > 250) tier = 'good'
    else tier = 'excellent'
  }

  return { tier, medianMs, failedCount, sampleCount: recent.length }
}
