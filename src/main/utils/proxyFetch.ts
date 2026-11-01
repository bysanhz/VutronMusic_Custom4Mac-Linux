import { HttpsProxyAgent } from 'https-proxy-agent'
import store from '../store'
import { fetchValidatedStream } from './remoteStream'
import { resolveRuntimeProxyUrl } from '../../shared/proxySettings'

const getProxyAgent = () => {
  const proxyUrl = resolveRuntimeProxyUrl(
    store.get('settings.proxy'),
    process.env.NODE_ENV === 'development',
    process.env.HTTPS_PROXY || process.env.https_proxy
  )
  return proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined
}

/**
 * 通过用户代理配置请求公网资源，并在每次重定向前重新校验目标地址。
 */
export const proxyFetch = async (url: string, options: any = {}): Promise<Response> => {
  return fetchValidatedStream(url, { ...options, agent: getProxyAgent() })
}
