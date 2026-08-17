import { pathCase } from 'change-case'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import cache from '../cache'
import { CacheAPIs } from '../utils/CacheApis'
import { handleNeteaseResult } from '../utils'
import log from '../log'
import { normalizeNeteaseAssetUrls } from '../../shared/neteaseAssetUrl'

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
        return reply.status(500).send({
          code: 500,
          message: 'Netease API request failed'
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
  fastify.get('/netease', () => 'NeteaseCloudMusicApi')
}

export default netease
