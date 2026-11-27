import type { PlaybackRecovery } from './playbackRecovery'
import { audioLevel } from './playbackInfo'

export const playbackDiagnosis = (
  trackId: unknown,
  recovery: PlaybackRecovery,
  records: any[],
  online = true
) => {
  const latest = [...records]
    .reverse()
    .find((record) => record.kind === 'source' && String(record.trackId) === String(trackId))
  const failure = recovery.failure || latest?.failure
  const issue = !online
    ? 'offline'
    : recovery.phase === 'loading' || recovery.phase === 'retrying'
      ? recovery.phase
      : recovery.phase === 'failed'
        ? failure || 'unavailable'
        : latest?.phase === 'resolved'
          ? latest.source === 'netease'
            ? 'healthy'
            : 'alternative'
          : latest?.phase === 'unavailable'
            ? failure || 'unavailable'
            : 'unknown'
  return {
    issue,
    attempt: recovery.attempt,
    // Export only these diagnostic fields; response bodies, URLs and account credentials never enter the report.
    lastRequest: latest
      ? {
          at: latest.at,
          status: latest.status,
          upstreamCode: latest.upstreamCode,
          protocol: ['weapi', 'eapi'].includes(latest.protocol) ? latest.protocol : undefined,
          attempts: latest.apiAttempts,
          requested: audioLevel(latest.requestedLevel),
          actual: audioLevel(latest.actualLevel)
        }
      : null
  }
}
