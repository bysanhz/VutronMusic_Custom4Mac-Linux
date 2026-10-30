import { HttpsProxyAgent } from 'https-proxy-agent'
import store from '../store'
import { fetchValidatedStream } from './remoteStream'
import { buildProxyUrl } from '../../shared/proxySettings'

const getProxyAgent = () => {
  const proxyUrl = buildProxyUrl(store.get('settings.proxy'))
  return proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined
}

/**
 * 通过用户代理配置请求公网资源，并在每次重定向前重新校验目标地址。
 */
export const proxyFetch = async (url: string, options: any = {}): Promise<Response> => {
  return fetchValidatedStream(url, { ...options, agent: getProxyAgent() })
}
