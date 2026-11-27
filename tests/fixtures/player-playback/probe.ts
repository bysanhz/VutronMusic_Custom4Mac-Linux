import { createApp, h, defineAsyncComponent, KeepAlive } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createI18n } from 'vue-i18n'
import { usePlayerStore } from 'player-under-test'
import { useSettingsStore } from 'settings-under-test'
import { useOsdLyricStore } from '../../../src/renderer/store/osdLyric'
import PlaybackDetails from '../../../src/renderer/components/PlaybackDetails.vue'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import PlayerBar from '../../../src/renderer/components/PlayerBar.vue'
import NavBar from '../../../src/renderer/components/NavBar.vue'
import { useDataStore } from '../../../src/renderer/store/data'
import '../../../src/renderer/assets/css/global.scss'
import '../../../src/renderer/assets/css/fluid-window.scss'
import '../../../src/renderer/assets/css/settings-fluid-layout.scss'
import '../../../src/renderer/assets/css/interaction-theme.scss'
import '../../../src/renderer/assets/css/rainbow-theme.scss'
import '../../../src/renderer/assets/css/monochrome-theme.scss'
import '../../../src/renderer/assets/css/settings-theme.scss'
import 'virtual:svg-icons-register'
import en from '../../../src/renderer/locales/en.json'
import zh from '../../../src/renderer/locales/zh-hans.json'
import zht from '../../../src/renderer/locales/zh-hant.json'
import '../../../src/renderer/utils/settingsBackupSettings'
import '../../../src/renderer/utils/diagnosticsSnapshotSettings'
import * as heartSession from '../../../src/renderer/utils/heartModeSession'
import * as heartProfile from '../../../src/renderer/utils/heartModeProfile'

const requests: string[] = []
let outputDeviceEnumerations = 0
let outputDeviceEnumerationsCompleted = 0
const enumerateOutputDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices)
navigator.mediaDevices.enumerateDevices = async () => {
  outputDeviceEnumerations++
  try {
    return await enumerateOutputDevices()
  } finally {
    outputDeviceEnumerationsCompleted++
  }
}

const fullUI = new URLSearchParams(location.search).has('ui')
const SettingsPage = defineAsyncComponent(
  () => import('../../../src/renderer/views/SystemSettings.vue')
)
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
  constructor(options: ConstructorParameters<typeof NativeContext>[0]) {
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
      if (channel === 'getCacheTracksInfo') return { length: 0, size: 0 }
      if (channel === 'msgRequestGetVersion') return '4.0.0-test'
      if (channel === 'get-runtime-diagnostics')
        return {
          audioRequests: [
            {
              kind: 'source',
              trackId: String((window as any).vutronmusic?.currentTrack?.id),
              phase: 'resolved',
              source: 'netease',
              status: 200,
              protocol: 'weapi',
              apiAttempts: 1
            }
          ]
        }
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
      settings,
      data: useDataStore(),
      mountScaleSettings: async () => {
        const [{ initializeBaselineWindowScale }, { initializeWindowScaleCalibrationV2 }] =
          await Promise.all([
            import('../../../src/renderer/utils/baselineWindowScale'),
            import('../../../src/renderer/utils/windowScaleCalibrationV2')
          ])
        initializeBaselineWindowScale()
        initializeWindowScaleCalibrationV2(router)
      },
      outputDeviceEnumerations: () => outputDeviceEnumerations,
      outputDeviceEnumerationsCompleted: () => outputDeviceEnumerationsCompleted,
      navigate: (path: string) => router.push(path),
      heartSession,
      heartProfile,
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
    return () =>
      fullUI
        ? h(
            'div',
            {
              id: 'app',
              style: 'color:var(--color-text)'
            },
            [
              h(NavBar),
              h(
                'main',
                {
                  id: 'main',
                  style:
                    'padding:84px 30px 80px 130px;box-sizing:border-box;height:100vh;overflow:auto;--main-content-top:84px;--main-content-bottom:80px'
                },
                [
                  h(RouterView, null, {
                    default: ({ Component }: any) =>
                      h(KeepAlive, { include: ['HomePage'] }, Component ? [h(Component)] : [])
                  })
                ]
              ),
              h(PlayerBar)
            ]
          )
        : h('div', [
            h('p', 'player playback regression fixture'),
            h('div', { style: 'position:fixed;right:24px;bottom:24px' }, [h(PlaybackDetails)])
          ])
  }
})
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)
app.provide('updatePadding', () => {})
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { render: () => null } },
    { path: '/settings', component: SettingsPage },
    { path: '/home', component: () => import('../../../src/renderer/views/HomePage.vue') }
  ]
})
app.use(router)
app.use(
  createI18n({
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: { en, zh, zht }
  })
)
app.mount('#probe')
