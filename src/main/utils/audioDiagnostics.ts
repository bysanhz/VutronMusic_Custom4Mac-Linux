/** Bounded, local-only audio request journal. Never accept raw URLs or errors as fields. */
export type AudioRequestDiagnostic = {
  id: number
  at: string
  kind: 'source' | 'proxy'
  trackId: string
  revision?: number | null
  source?: string
  host?: string
  phase: string
  status?: number
  level?: string
  apiAttempts?: number
  available?: boolean
  restricted?: boolean
  urlChanged?: boolean
  contentType?: string
  contentLength?: string | null
  acceptRanges?: string | null
  contentRange?: string | null
  contentEncoding?: string
  decoded?: boolean
  redirects?: number
  elapsedMs?: number
  firstByteMs?: number
  signature?: string
  bytes?: number
  interrupted?: boolean
  error?: string
}

const records: AudioRequestDiagnostic[] = []
let sequence = 0

export const beginAudioDiagnostic = (
  fields: Omit<AudioRequestDiagnostic, 'id' | 'at'>
): AudioRequestDiagnostic => {
  const record = { id: ++sequence, at: new Date().toISOString(), ...fields }
  records.push(record)
  if (records.length > 40) records.shift()
  return record
}

export const getAudioRequestDiagnostics = () => records.map((record) => ({ ...record }))

export const audioFailureCode = (error: unknown): string => {
  const value = error as { name?: string; code?: string; cause?: { code?: string } }
  const candidate = value?.cause?.code || value?.code
  const code = String(typeof candidate === 'string' ? candidate : value?.name || 'request_failed')
  return /^[a-zA-Z0-9_]+$/.test(code) ? code.slice(0, 64) : 'request_failed'
}
