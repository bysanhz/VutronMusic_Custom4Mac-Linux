export type NeteaseFailureSummary = {
  status?: number
  code?: string
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

  return { ...(status ? { status } : {}), ...(code ? { code } : {}) }
}

export const isNeteaseTransportFailure = (summary: NeteaseFailureSummary): boolean =>
  (summary.status !== undefined && summary.status >= 500) ||
  ['ECONNABORTED', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'ETIMEDOUT'].includes(
    summary.code || ''
  )
