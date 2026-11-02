import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createI18n } from 'vue-i18n'
import { usePlayerStore } from 'player-under-test'
import { useSettingsStore } from 'settings-under-test'
import { useOsdLyricStore } from '../../../src/renderer/store/osdLyric'

const requests: string[] = []
const NativeAudio = window.Audio
const NativeContext = window.AudioContext
const audioElements: HTMLAudioElement[] = []
let contexts = 0
;(window as any).Audio = function (...args: any[]) {
  const audio = new NativeAudio(...args)
  audioElements.push(audio)
  return audio
}
;(window as any).AudioContext = class extends NativeContext {
  constructor(options: AudioContextOptions) {
    super(options)
    contexts++
  }
}
const sent: any[] = []
const osdMessages: any[] = []
const mediaActions = new Set<string>()
if ('mediaSession' in navigator) {
  const setActionHandler = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession)
  navigator.mediaSession.setActionHandler = (action, handler) => {
    setActionHandler(action, handler)
    if (handler) mediaActions.add(action)
    else mediaActions.delete(action)
  }
}
const handlers: Record<string, (...args: any[]) => unknown> = {}
const subscriptions = new Map<string, Set<(...args: any[]) => unknown>>()
;(window as any).env ||= { isElectron: true, isLinux: true }
if (!(window as any).mainApi)
  (window as any).mainApi = {
    invoke: async (channel: string) => {
      if (channel === 'get-listen-ledger-backup' && (window as any).startupGate)
        return await (window as any).startupGate
      if (channel === 'getLocalMusic') return { songs: [], playlists: [] }
      if (channel === 'get-lastfm-session') return { name: '' }
      if (channel === 'systemPing')
        return { navidrome: 'logout', emby: 'logout', jellyfin: 'logout' }
      return null
    },
    send: (channel: string, data: unknown) => sent.push({ channel, data }),
    on: (channel: string, handler: (...args: any[]) => unknown) => {
      let listeners = subscriptions.get(channel)
      if (!listeners) {
        listeners = new Set()
        subscriptions.set(channel, listeners)
      }
      listeners.add(handler)
      const current = listeners
      handlers[channel] = (...args) => {
        for (const listener of [...current]) listener(...args)
      }
    },
    off: (channel: string, handler: (...args: any[]) => unknown) => {
      const listeners = subscriptions.get(channel)
      listeners?.delete(handler)
      if (!listeners?.size) {
        subscriptions.delete(channel)
        delete handlers[channel]
      }
    },
    sendMessage: (message: any) => {
      osdMessages.push(message)
      if (osdMessages.length > 10) osdMessages.shift()
    },
    closeMessagePort: () => {}
  }
const nativeFetch = window.fetch.bind(window)
window.fetch = (input, init) => {
  if (String(input).startsWith('atom://local-asset')) requests.push(String(input))
  return nativeFetch(input, init)
}
const app = createApp({
  setup() {
    const player = usePlayerStore()
    const settings = useSettingsStore()
    settings.general.fadeDuration = 0
    settings.autoCacheTrack.enable = false
    ;(window as any).playbackProbe = {
      player,
      handlers,
      subscriptions,
      initialSubscriptions: new Map(
        [...subscriptions].map(([channel, listeners]) => [channel, listeners.size])
      ),
      requests,
      sent,
      audioElements,
      osdMessages,
      mediaActions,
      osd: useOsdLyricStore(),
      contextCount: () => contexts,
      unmount: () => app.unmount()
    }
    return () => h('div', 'player playback regression fixture')
  }
})
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)
app.use(
  createI18n({
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} }
  })
)
app.mount('#probe')
