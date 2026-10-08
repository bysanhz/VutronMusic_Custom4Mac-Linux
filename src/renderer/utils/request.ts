import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { doLogout } from './auth'
import { buildProxyUrl } from '../../shared/proxySettings'
import { isNeteaseResponseHealthy, NETEASE_REQUEST_METRIC_EVENT } from './networkQuality'

const baseUrl = '/netease'
const requestStartedAt = new WeakMap<object, number>()

const reportRequestMetric = (config: AxiosRequestConfig | undefined, ok: boolean): void => {
  if (!config) return
  const startedAt = requestStartedAt.get(config)
  if (startedAt === undefined) return
  requestStartedAt.delete(config)
  window.dispatchEvent(
    new CustomEvent(NETEASE_REQUEST_METRIC_EVENT, {
      detail: { elapsedMs: Math.round(performance.now() - startedAt), ok }
    })
  )
}

const service: AxiosInstance = axios.create({
  baseURL: baseUrl,
  withCredentials: true,
  timeout: 15000
})

service.interceptors.request.use((config: any) => {
  requestStartedAt.set(config, performance.now())
  if (!config.params) config.params = {}
  let misc: Record<string, any> = {}
  try {
    misc = JSON.parse(localStorage.getItem('settings') || '{}')?.misc || {}
  } catch {
    misc = {}
  }

  const proxyUrl = buildProxyUrl(misc.proxy)
  if (proxyUrl) config.params.proxy = proxyUrl

  const realIp = misc.realIp as { enable: boolean; ip: string } | undefined
  if (realIp && realIp.enable && realIp.ip) {
    config.params.realIP = realIp.ip
  }
  return config
})

service.interceptors.response.use(
  (response: AxiosResponse) => {
    const healthy = isNeteaseResponseHealthy(response.status, response.data)
    reportRequestMetric(response.config, healthy)
    if (healthy) window.dispatchEvent(new CustomEvent('vutronmusic-netease-available'))
    else {
      window.dispatchEvent(new CustomEvent('vutronmusic-netease-unavailable'))
    }
    const res = response
    return res
  },
  (error: AxiosError) => {
    if (error.code !== 'ERR_CANCELED') {
      const status = Number(error.response?.status)
      reportRequestMetric(error.config, isNeteaseResponseHealthy(status, error.response?.data))
    }
    const { response } = error
    const data = response?.data as any
    if (data?.code === 301 && data?.message === '未登录') {
      console.log('未登录')
      doLogout()
    }
    const status = Number(response?.status)
    if (
      !navigator.onLine ||
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNABORTED' ||
      error.code === 'ETIMEDOUT' ||
      status >= 500
    ) {
      window.dispatchEvent(
        new CustomEvent('vutronmusic-netease-unavailable', {
          detail: {
            status: Number.isFinite(status) ? status : undefined,
            message: data?.message || data?.msg || error.message
          }
        })
      )
    }
    return Promise.reject(error)
  }
)

const request = async (config: AxiosRequestConfig) => {
  const { data } = await service.request(config).catch(() => ({ data: null }))
  return data as any
}

/** Probe a public read-only NetEase endpoint through the same proxy path as regular requests. */
export const probeNeteaseNetwork = async (): Promise<{ ok: boolean; elapsedMs: number }> => {
  const startedAt = performance.now()
  try {
    const response = await service.get('/search/hot/detail', {
      timeout: 8_000,
      params: { timestamp: Date.now() },
      headers: { 'Cache-Control': 'no-cache' }
    })
    return {
      ok: response.status === 200 && Number(response.data?.code) === 200,
      elapsedMs: Math.round(performance.now() - startedAt)
    }
  } catch {
    return { ok: false, elapsedMs: Math.round(performance.now() - startedAt) }
  }
}

export default request
