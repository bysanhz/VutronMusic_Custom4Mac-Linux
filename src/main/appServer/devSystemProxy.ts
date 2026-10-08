/** Align NetEase reads with the process proxy already used by scrobble uploads in yarn dev. */
export const getDevSystemProxy = (value: string | undefined): string => {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || !url.port) return ''
    return url.href
  } catch {
    return ''
  }
}

export const withDevSystemProxy = (
  params: Record<string, any>,
  devSystemProxy: string
): Record<string, any> =>
  devSystemProxy && !params.proxy ? { ...params, proxy: devSystemProxy } : params
