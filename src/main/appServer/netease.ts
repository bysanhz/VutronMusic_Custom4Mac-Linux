import { pathCase } from 'change-case'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import cache from '../cache'
import { CacheAPIs } from '../utils/CacheApis'
import { handleNeteaseResult } from '../utils'
import log from '../log'
import { normalizeNeteaseAssetUrls } from '../../shared/neteaseAssetUrl'
import https from 'node:https'
import tls from 'node:tls'

const configureSystemTrustedCAs = () => {
  const getCACertificates = (tls as any).getCACertificates as
    | ((type?: 'default' | 'system' | 'bundled' | 'extra') => string[])
    | undefined
  if (!getCACertificates) return

  try {
    const defaultCAs = getCACertificates('default')
    const systemCAs = getCACertificates('system')
    if (!systemCAs.length) return

    https.globalAgent.options.ca = Array.from(new Set([...defaultCAs, ...systemCAs]))
    log.info(`[TLS] 已合并 ${systemCAs.length} 个系统受信任 CA，供网易云 Node 请求使用`)
  } catch (error) {
    log.warn('[TLS] 读取系统 CA 失败，将继续使用 Node 默认 CA', error)
  }
}

configureSystemTrustedCAs()

const getNeteaseErrorMessage = (error: any): string => {
  const message = error?.body?.msg
  if (typeof message === 'string' && message) return message
  if (message && typeof message === 'object') {
    if (typeof message.message === 'string' && message.message) return message.message
    if (typeof message.code === 'string' && message.code) return message.code
  }
  if (typeof error?.message === 'string' && error.message) return error.message
  return 'Netease API request failed'
}

const isRepeatedDailySignin = (name: string, error: any): boolean => {
  return (
    name === 'daily/signin' &&
    error?.status === 400 &&
    error?.body?.code === -2 &&
    error?.body?.msg === '重复签到'
  )
}

const isCloudRequestTimeout = (name: string, error: any): boolean => {
  return (
    name === 'user/cloud' &&
    error?.status === 400 &&
    error?.body?.code === -601 &&
    error?.body?.message === '请求超时！'
  )
}

async function netease(fastify: FastifyInstance) {
  const NeteaseCloudMusicApi = require('@neteasecloudmusicapienhanced/api')
  const getHandler = (name: string, neteaseApi: (params: any) => any) => {
    return async (
      req: FastifyRequest<{ Querystring: { [key: string]: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { ...params } = req.query
        if (!params.cookie) params.cookie = (req as any).cookies
        const result = await neteaseApi(params)
        result.body = normalizeNeteaseAssetUrls(
          await handleNeteaseResult(name as CacheAPIs, result?.body)
        )
        cache.set(name as CacheAPIs, result.body, req.query)
        return reply.send(result.body)
      } catch (error: any) {
        if (isRepeatedDailySignin(name, error)) {
          log.info('网易云今日已签到，跳过重复签到请求')
          return reply.status(200).send({
            code: 200,
            alreadySigned: true,
            msg: error.body.msg
          })
        }

        if (isCloudRequestTimeout(name, error)) {
          log.warn('网易云云盘请求超时，本次加载已跳过，可稍后刷新重试')
          return reply.status(504).send({
            code: -601,
            retryable: true,
            message: error.body.message
          })
        }

        log.error(`Netease API Error: ${name}`, error)
        if ([400, 301, 250].includes(error.status)) {
          return reply.status(error.status).send(error.body)
        }

        const upstreamStatus = Number(error?.status)
        if (upstreamStatus >= 500 && upstreamStatus <= 599) {
          return reply.status(upstreamStatus).send({
            code: upstreamStatus,
            retryable: true,
            message: getNeteaseErrorMessage(error)
          })
        }

        return reply.status(500).send({
          code: 500,
          retryable: true,
          message: getNeteaseErrorMessage(error)
        })
      }
    }
  }

  Object.entries(NeteaseCloudMusicApi).forEach(([nameInSnakeCase, neteaseApi]: [string, any]) => {
    if (['serveNcmApi', 'getModulesDefinitions'].includes(nameInSnakeCase)) return
    const name = pathCase(nameInSnakeCase)
    const handler = getHandler(name, neteaseApi)
    fastify.get(`/netease/${name}`, handler)
    fastify.post(`/netease/${name}`, handler)
  })

  /**
   * 稳定的应用自有 scrobble-v1 别名。
   *
   * renderer 之前调用 `/netease/scrobble/v1`，但用户实机日志证明该路径在部分
   * dev/build 组合下会 404。这里不再依赖 `pathCase()` 对第三方导出名的映射，也
   * 不再依赖 `Object.entries()` 是否枚举到该导出；优先直接加载包内模块，并暴露
   * 一个不会与动态路由冲突的 `/netease/scrobble-v1`。
   */
  let stableScrobbleV1Api: ((params: any) => any) | undefined
  try {
    stableScrobbleV1Api = require('@neteasecloudmusicapienhanced/api/module/scrobble_v1')
  } catch (error) {
    log.warn('[Netease] 直接加载 scrobble_v1 模块失败，将尝试包导出', error)
    stableScrobbleV1Api = NeteaseCloudMusicApi.scrobble_v1
  }

  if (typeof stableScrobbleV1Api === 'function') {
    const stableScrobbleV1Url = '/netease/scrobble-v1'
    const stableScrobbleV1Handler = getHandler('scrobble/v1', stableScrobbleV1Api)
    fastify.get(stableScrobbleV1Url, stableScrobbleV1Handler)
    fastify.post(stableScrobbleV1Url, stableScrobbleV1Handler)
    log.info(`[Netease] 已注册稳定听歌上报路由 ${stableScrobbleV1Url}`)
  } else {
    log.warn('[Netease] scrobble_v1 不可用，稳定听歌上报路由未注册')
  }

  fastify.get('/netease', () => 'NeteaseCloudMusicApi')
}

export default netease
