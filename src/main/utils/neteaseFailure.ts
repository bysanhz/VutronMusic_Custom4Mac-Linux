export type NeteaseFailureSummary = {
  status?: number
  code?: string
  upstreamCode?: number
  reason?: 'risk-control' | 'login-required' | 'rate-limited'
}

/** Only copy diagnostic fields from third-party errors: Axios configs contain MUSIC_U. */
export const summarizeNeteaseFailure = (error: any): NeteaseFailureSummary => {
  const rawStatus = Number(error?.response?.status ?? error?.status)
  const status =
    Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus <= 599 ? rawStatus : undefined
  const rawMessage = error?.body?.msg
  const rawCode =
    rawMessage?.code ??
    error?.code ??
    (typeof rawMessage === 'string' ? rawMessage.match(/\b(E[A-Z0-9_]{2,40})\b/)?.[1] : undefined)
  const code =
    typeof rawCode === 'string' && /^E[A-Z0-9_]{2,40}$/.test(rawCode) ? rawCode : undefined
  const body = error?.response?.data ?? error?.body
  const rawUpstreamCode = body?.code
  const upstreamCode =
    (typeof rawUpstreamCode === 'number' ||
      (typeof rawUpstreamCode === 'string' && /^-?\d+$/.test(rawUpstreamCode))) &&
    Number.isSafeInteger(Number(rawUpstreamCode))
      ? Number(rawUpstreamCode)
      : undefined
  const reason =
    upstreamCode === -460
      ? 'risk-control'
      : upstreamCode === 301
        ? 'login-required'
        : status === 429
          ? 'rate-limited'
          : undefined

  return {
    ...(status ? { status } : {}),
    ...(code ? { code } : {}),
    ...(upstreamCode !== undefined ? { upstreamCode } : {}),
    ...(reason ? { reason } : {})
  }
}

export const isNeteaseTransportFailure = (summary: NeteaseFailureSummary): boolean =>
  (summary.status !== undefined && summary.status >= 500) ||
  ['ECONNABORTED', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'ETIMEDOUT'].includes(
    summary.code || ''
  )

/** These failures apply to the request/account/IP, so lower quality cannot repair them. */
export const shouldStopNeteaseQualityFallback = (summary: NeteaseFailureSummary): boolean =>
  isNeteaseTransportFailure(summary) ||
  summary.reason !== undefined ||
  [401, 403, 429].includes(summary.status || 0)
