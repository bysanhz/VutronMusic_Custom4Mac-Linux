import { app, session, type Session } from 'electron'

const INSTALL_KEY = '__vutronContentSecurityPolicyInstalled'
const APP_DOCUMENT_URLS = [
  'http://localhost:41830/*',
  'http://127.0.0.1:41830/*'
]

/*
 * vue-i18n 当前使用运行时消息编译器，会通过 Function 构造翻译表达式，因此在完成
 * 语言包预编译迁移前必须保留 'unsafe-eval'。其余能力仍按最小权限限制，并通过真正
 * 的 HTTP 响应头下发，使 frame-ancestors 等指令能够生效。
 *
 * 网易云历史接口和本地持久化数据中仍可能包含 http://p*.music.126.net 封面地址。
 * 这里只对该被动图片域名开放 HTTP，不扩大脚本、连接或媒体请求权限；新接口响应会
 * 同时被规范为 HTTPS。
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' atom: data: blob: https: http://*.music.126.net http://music.126.net http://127.0.0.1:* http://localhost:*",
  "media-src 'self' atom: blob: https: http://127.0.0.1:* http://localhost:*",
  "font-src 'self' data:",
  "connect-src 'self' atom: https: wss: ws: http://127.0.0.1:* http://localhost:*",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'"
].join('; ')

const configuredSessions = new WeakSet<Session>()

const installOnSession = (targetSession: Session): void => {
  if (configuredSessions.has(targetSession)) return
  configuredSessions.add(targetSession)

  targetSession.webRequest.onHeadersReceived(
    { urls: APP_DOCUMENT_URLS },
    (details, callback) => {
      const responseHeaders = { ...(details.responseHeaders || {}) }

      for (const key of Object.keys(responseHeaders)) {
        if (key.toLowerCase() === 'content-security-policy') delete responseHeaders[key]
      }

      responseHeaders['Content-Security-Policy'] = [CONTENT_SECURITY_POLICY]
      callback({ responseHeaders })
    }
  )
}

const installContentSecurityPolicy = (): void => {
  const runtime = globalThis as typeof globalThis & Record<string, unknown>
  if (runtime[INSTALL_KEY]) return
  runtime[INSTALL_KEY] = true

  app.on('session-created', installOnSession)
  void app.whenReady().then(() => installOnSession(session.defaultSession))
}

installContentSecurityPolicy()
