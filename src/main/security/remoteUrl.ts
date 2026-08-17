import dns from 'dns/promises'
import { isPrivateIpAddress, isUnsafeHostname, parseSafeExternalUrl } from './validation'

const MAX_REMOTE_URL_LENGTH = 8192
const STREAMING_PLATFORMS = ['navidrome', 'emby', 'jellyfin'] as const

const parseHttpUrl = (value: string | URL): URL => {
  const rawValue = value instanceof URL ? value.toString() : value
  if (!rawValue || rawValue.length > MAX_REMOTE_URL_LENGTH) {
    throw new Error('远程请求地址为空或过长')
  }

  const url = new URL(rawValue)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('远程请求地址不是受允许的 HTTP(S) 地址')
  }
  return url
}

const isPathUnderBase = (targetPath: string, basePath: string): boolean => {
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`
  return targetPath === basePath || targetPath.startsWith(normalizedBase)
}

const getConfiguredStreamingBaseUrls = async (): Promise<URL[]> => {
  try {
    const { default: store } = await import('../store')
    const urls: URL[] = []

    for (const platform of STREAMING_PLATFORMS) {
      const value = store.get(`accounts.${platform}.url`)
      if (typeof value !== 'string' || !value) continue
      try {
        urls.push(parseHttpUrl(value))
      } catch {
        // Invalid persisted endpoints are ignored and must be configured again by the user.
      }
    }
    return urls
  } catch {
    return []
  }
}

/**
 * 验证由主进程访问的公网 HTTP(S) 地址。
 *
 * 除协议和主机名检查外，还验证当前全部 DNS 解析结果，避免直接访问回环、私网、
 * 链路本地和其他保留地址。调用方仍需在每次 HTTP 重定向后重新执行该检查。
 */
export const assertPublicRemoteUrl = async (value: string | URL): Promise<URL> => {
  const rawValue = value instanceof URL ? value.toString() : value
  const url = parseSafeExternalUrl(rawValue)
  if (!url || isUnsafeHostname(url.hostname)) {
    throw new Error('远程请求地址不是受允许的公网 HTTP(S) 地址')
  }

  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some((entry) => isPrivateIpAddress(entry.address))) {
    throw new Error('远程请求地址解析到了私有或保留 IP')
  }

  return url
}

/**
 * 允许公网地址，或用户在流媒体设置中明确保存的服务地址。
 *
 * 局域网例外要求协议、主机、端口和基础路径同时匹配，不能借此访问同一主机上的
 * 其他服务或越过用户配置的反向代理路径。
 */
export const assertConfiguredOrPublicRemoteUrl = async (value: string | URL): Promise<URL> => {
  const target = parseHttpUrl(value)
  const configuredBaseUrls = await getConfiguredStreamingBaseUrls()

  const explicitlyConfigured = configuredBaseUrls.some(
    (base) => target.origin === base.origin && isPathUnderBase(target.pathname, base.pathname)
  )
  if (explicitlyConfigured) return target

  return await assertPublicRemoteUrl(target)
}

export const isRedirectStatus = (status: number): boolean => {
  return [301, 302, 303, 307, 308].includes(status)
}
