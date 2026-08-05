import { HttpsProxyAgent } from 'https-proxy-agent'
import store from '../store'
import { assertPublicRemoteUrl, isRedirectStatus } from '../security/remoteUrl'

const MAX_REDIRECTS = 5

const getProxyAgent = () => {
  const proxy = store.get('settings.proxy') as { type: 0 | 1 | 2; address: string; port: string }

  if (proxy && proxy.type !== 0) {
    const map = { 1: 'http', 2: 'https' }
    const proxyUrl = `${map[proxy.type]}://${proxy.address}:${proxy.port}`
    return new HttpsProxyAgent(proxyUrl)
  }
  return undefined
}

/**
 * 通过用户代理配置请求公网资源，并在每次重定向前重新校验目标地址。
 */
export const proxyFetch = async (url: string, options: any = {}): Promise<Response> => {
  let currentUrl = await assertPublicRemoteUrl(url)
  let requestOptions = { ...options, redirect: 'manual' }
  const agent = getProxyAgent()
  if (agent) requestOptions.agent = agent

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl, requestOptions)
    if (!isRedirectStatus(response.status)) return response

    if (redirectCount === MAX_REDIRECTS) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error('代理请求重定向次数过多')
    }

    const location = response.headers.get('location')
    if (!location) return response

    const nextUrl = await assertPublicRemoteUrl(new URL(location, currentUrl))
    const method = String(requestOptions.method || 'GET').toUpperCase()
    if (!['GET', 'HEAD'].includes(method)) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error('拒绝自动重定向非只读代理请求')
    }

    const headers = new Headers(requestOptions.headers)
    if (nextUrl.origin !== currentUrl.origin) {
      headers.delete('authorization')
      headers.delete('cookie')
      headers.delete('proxy-authorization')
    }

    await response.body?.cancel().catch(() => undefined)
    currentUrl = nextUrl
    requestOptions = { ...requestOptions, headers, redirect: 'manual' }
  }

  throw new Error('代理请求重定向处理失败')
}
