import dns from 'dns/promises'
import { isPrivateIpAddress, isUnsafeHostname, parseSafeExternalUrl } from './validation'

const MAX_REMOTE_URL_LENGTH = 8192

/**
 * 验证由主进程访问的公网 HTTP(S) 地址。
 *
 * 除协议和主机名检查外，还验证当前全部 DNS 解析结果，避免直接访问回环、私网、
 * 链路本地和其他保留地址。调用方仍需在每次 HTTP 重定向后重新执行该检查。
 */
export const assertPublicRemoteUrl = async (value: string | URL): Promise<URL> => {
  const rawValue = value instanceof URL ? value.toString() : value
  if (!rawValue || rawValue.length > MAX_REMOTE_URL_LENGTH) {
    throw new Error('远程请求地址为空或过长')
  }

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

export const isRedirectStatus = (status: number): boolean => {
  return [301, 302, 303, 307, 308].includes(status)
}
