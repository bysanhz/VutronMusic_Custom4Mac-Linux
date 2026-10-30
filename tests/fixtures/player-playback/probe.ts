import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createI18n } from 'vue-i18n'
import { usePlayerStore } from 'player-under-test'
import { useSettingsStore } from 'settings-under-test'

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
const handlers: Record<string, (...args: any[]) => unknown> = {}
;(window as any).env = { isElectron: true, isLinux: true }
;(window as any).mainApi = {
  invoke: async (channel: string) => {
    if (channel === 'getLocalMusic') return { songs: [], playlists: [] }
    if (channel === 'get-lastfm-session') return { name: '' }
    if (channel === 'systemPing') return { navidrome: 'logout', emby: 'logout', jellyfin: 'logout' }
    return null
  },
  send: (channel: string, data: unknown) => sent.push({ channel, data }),
  on: (channel: string, handler: (...args: any[]) => unknown) => {
    handlers[channel] = handler
  },
  off: () => {},
  sendMessage: () => {},
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
      requests,
      sent,
      audioElements,
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
