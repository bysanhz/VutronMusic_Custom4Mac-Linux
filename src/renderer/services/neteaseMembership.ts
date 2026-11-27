export type NeteaseMembership = {
  kind: 'vip' | 'svip' | 'music' | 'none' | 'unknown'
  level: number | null
  expiresAt: number | null
}

export const unknownMembership = (): NeteaseMembership => ({
  kind: 'unknown',
  level: null,
  expiresAt: null
})

/** VIP grade comes from the membership endpoint, not the unrelated user level. */
export const readNeteaseMembership = (response: unknown, now = Date.now()): NeteaseMembership => {
  const body = response as { code?: unknown; data?: Record<string, any> } | null
  const data = body?.data
  if (Number(body?.code) !== 200 || !data || typeof data !== 'object') return unknownMembership()
  const expiry = (value: any): number | null => {
    if (!value || value.expireTime === null || value.expireTime === undefined) return null
    const expiresAt = Number(value.expireTime)
    return Number.isFinite(expiresAt) && expiresAt >= 0 ? expiresAt : null
  }
  for (const [field, kind] of [
    ['redplus', 'svip'],
    ['associator', 'vip'],
    ['musicPackage', 'music']
  ] as const) {
    const expiresAt = expiry(data[field])
    if (expiresAt !== null && expiresAt > now) {
      const level = Number(data.redVipLevel)
      return {
        kind,
        expiresAt,
        level: kind !== 'music' && Number.isInteger(level) && level > 0 ? level : null
      }
    }
  }
  // A partial/failed response is not evidence that membership has expired.
  return expiry(data.associator) !== null && expiry(data.musicPackage) !== null
    ? { kind: 'none', level: null, expiresAt: null }
    : unknownMembership()
}
