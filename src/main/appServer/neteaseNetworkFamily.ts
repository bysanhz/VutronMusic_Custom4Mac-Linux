import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os'
import { Agent as HttpsAgent } from 'node:https'
import type { AxiosInstance, AxiosRequestConfig } from 'axios'
import { lookup } from 'node:dns'

// NetEase's IPv6 path can accept TCP/TLS and reset the HTTP exchange. Prefer
// IPv4 on dual-stack networks, retaining AAAA candidates for Node's fallback.
const lookupIpv4First: NonNullable<AxiosRequestConfig['lookup']> = (
  hostname,
  options,
  callback
) => {
  lookup(hostname, { ...options, all: true, order: 'ipv4first' }, (error, addresses) => {
    // Axios normalizes this list for Node's all/single-address lookup contracts.
    callback(
      error,
      (addresses || []).map(({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }))
    )
  })
}

/** Link-local IPv6 does not provide a route to NetEase's public AAAA addresses. */
export const getNeteaseDirectFamily = (
  interfaces: Record<string, NetworkInterfaceInfo[] | undefined> = networkInterfaces()
): 4 | 6 | undefined => {
  let ipv4 = false
  let ipv6 = false
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.internal) continue
      if (address.family === 'IPv4' && !address.address.startsWith('169.254.')) ipv4 = true
      if (address.family === 'IPv6' && !/^fe[89ab]/i.test(address.address)) ipv6 = true
    }
  }
  // Preserve Node's normal selection on dual-stack or unknown networks.
  return ipv4 === ipv6 ? undefined : ipv4 ? 4 : 6
}

const apiHosts = new Set([
  'music.163.com',
  'interface.music.163.com',
  'interfacepc.music.163.com',
  'interface3.music.163.com'
])

/** Scope address-family selection to the embedded API's direct HTTPS requests. */
export const installNeteaseNetworkFamily = (client: AxiosInstance): (() => void) => {
  const interceptor = client.interceptors.request.use((config) => {
    if (
      config.proxy !== false ||
      config.family !== undefined ||
      config.lookup ||
      config.httpsAgent?.constructor !== HttpsAgent
    ) {
      return config
    }
    let url: URL
    try {
      url = new URL(config.url || '')
    } catch {
      return config
    }
    if (url.protocol !== 'https:' || !apiHosts.has(url.hostname)) return config

    // Re-evaluate on every request, so enabling IPv6/VPN does not require restart.
    // On IPv4-only networks, Node's 250ms family fallback can abort the only
    // usable address before a delayed TCP handshake/retransmission completes.
    const family = getNeteaseDirectFamily()
    if (family !== undefined) config.family = family
    else config.lookup = lookupIpv4First
    // The renderer gives up after 15s; keep the upstream request bounded too
    // instead of leaving an OS TCP connect alive after its caller has timed out.
    if (!config.timeout) config.timeout = 15_000
    return config
  })
  return () => client.interceptors.request.eject(interceptor)
}
