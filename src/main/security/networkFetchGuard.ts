import { net } from 'electron'
import { assertPublicRemoteUrl, isRedirectStatus } from './remoteUrl'

const INSTALL_KEY = '__vutronNetworkFetchGuardInstalled'
const MAX_REDIRECTS = 5
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024

type GuardedNet = typeof net & Record<string, any>

const enforceResponseSizeLimit = async (response: Response): Promise<Response> => {
  const declaredLength = Number(response.headers.get('content-length') || 0)
  if (declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error('远程响应超过允许大小')
  }
  if (!response.body) return response

  let receivedBytes = 0
  const limitedBody = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        receivedBytes += chunk.byteLength
        if (receivedBytes > MAX_RESPONSE_BYTES) {
          controller.error(new Error('远程响应超过允许大小'))
          return
        }
        controller.enqueue(chunk)
      }
    })
  )

  return new Response(limitedBody, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  })
}

const installNetworkFetchGuard = (): void => {
  const guardedNet = net as GuardedNet
  if (guardedNet[INSTALL_KEY]) return
  guardedNet[INSTALL_KEY] = true

  const originalFetch = net.fetch.bind(net)

  guardedNet.fetch = async (
    input: string | URL | Request,
    init: RequestInit = {}
  ): Promise<Response> => {
    const initialUrl =
      input instanceof Request ? input.url : input instanceof URL ? input.toString() : input
    let currentUrl = await assertPublicRemoteUrl(initialUrl)
    let requestInit: RequestInit = {
      ...init,
      method: init.method || (input instanceof Request ? input.method : undefined),
      headers: init.headers || (input instanceof Request ? input.headers : undefined),
      redirect: 'manual'
    }

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const response = await originalFetch(currentUrl.toString(), requestInit)
      if (!isRedirectStatus(response.status)) return await enforceResponseSizeLimit(response)

      if (redirectCount === MAX_REDIRECTS) {
        await response.body?.cancel().catch(() => undefined)
        throw new Error('远程请求重定向次数过多')
      }

      const location = response.headers.get('location')
      if (!location) return await enforceResponseSizeLimit(response)

      const nextUrl = await assertPublicRemoteUrl(new URL(location, currentUrl))
      const method = String(requestInit.method || 'GET').toUpperCase()
      if (!['GET', 'HEAD'].includes(method)) {
        await response.body?.cancel().catch(() => undefined)
        throw new Error('拒绝自动重定向非只读远程请求')
      }

      const headers = new Headers(requestInit.headers)
      if (nextUrl.origin !== currentUrl.origin) {
        headers.delete('authorization')
        headers.delete('cookie')
        headers.delete('proxy-authorization')
      }

      await response.body?.cancel().catch(() => undefined)
      currentUrl = nextUrl
      requestInit = { ...requestInit, headers, redirect: 'manual' }
    }

    throw new Error('远程请求重定向处理失败')
  }
}

installNetworkFetchGuard()
