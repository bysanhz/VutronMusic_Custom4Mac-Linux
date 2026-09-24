<template>
  <div id="app" :class="{ 'user-select-none': userSelectNone }" :style="appFontStyle">
    <div v-if="networkIssue" class="network-status-banner" role="status" aria-live="polite">
      {{ networkStatusText }}
    </div>
    <ScrollBar v-show="!showLyrics" />
    <SideNav />
    <NavBar ref="navBarRef" />
    <div id="main" ref="mainRef" :style="mainStyle" @scroll="scrollEvent">
      <router-view v-slot="{ Component }">
        <keep-alive :include="['HomePage']">
          <component :is="Component"></component>
        </keep-alive>
      </router-view>
    </div>
    <PlayerBar v-if="enabled" v-show="showPlayerBar" />
    <HeartModeAssistant />
    <ShowToast />
    <AddTrackToPlaylistModal />
    <newPlaylistModal />
    <editPlaylist />
    <selectPathModal />
    <PlayPage v-if="enabled" />
  </div>
</template>

<script setup lang="tsx">
import { onMounted, ref, provide, toRefs, watch, computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import ScrollBar from './components/ScrollBar.vue'
import PlayerBar from './components/PlayerBar.vue'
import HeartModeAssistant from './components/HeartModeAssistant.vue'
import NavBar from './components/NavBar.vue'
import SideNav from './components/SideNav.vue'
import ShowToast from './components/ShowToast.vue'
import AddTrackToPlaylistModal from './components/ModalAddTrackToPlaylist.vue'
import newPlaylistModal from './components/ModalNewPlaylist.vue'
import editPlaylist from './components/ModalEditPlaylist.vue'
import selectPathModal from './components/ModalFilePaths.vue'
import PlayPage from './views/PlayPage.vue'
import { useDataStore } from './store/data'
import { useLocalMusicStore } from './store/localMusic'
import { useOsdLyricStore } from './store/osdLyric'
import { usePlayerStore } from './store/player'
import { useSettingsStore } from './store/settings'
import { useNormalStateStore } from './store/state'
import { storeToRefs } from 'pinia'
import Utils from './utils'
import { useRoute } from 'vue-router'
import { type ProgressInfo } from 'electron-updater'
import router from './router'
import eventBus from './utils/eventBus'
import {
  HEART_MODE_SESSION_CHANGE_EVENT,
  getCurrentHeartModeSession,
  resolveHeartModeSourceSeedId
} from './utils/heartModeSession'
import { Track } from '@/types/music'

const { t } = useI18n()

type NetworkIssue = 'offline' | 'netease-unavailable' | null
const networkIssue = ref<NetworkIssue>(navigator.onLine ? null : 'offline')
let neteaseRecoveryTimer: number | null = null
const networkStatusText = computed(() =>
  networkIssue.value === 'offline'
    ? t('toast.networkOffline')
    : t('toast.neteaseUnavailable')
)

const localMusicStore = useLocalMusicStore()
const { localTracks } = storeToRefs(localMusicStore)
const { deleteLocalTracks } = localMusicStore

const playerStore = usePlayerStore()
const { enabled, playlistSource, currentTrack } = storeToRefs(playerStore)

const osdLyricStore = useOsdLyricStore()
const { show, type, isLock } = storeToRefs(osdLyricStore)

const stateStore = useNormalStateStore()
const { extensionCheckResult, showLyrics, isDownloading } = storeToRefs(stateStore)
const { showToast, registerInstance, unregisterInstance, updateScroll, getFontList } = stateStore

const {
  fetchLikedPlaylist,
  fetchLikedSongs,
  fetchLikedSongsWithDetails,
  fetchLikedAlbums,
  fetchLikedArtists,
  fetchLikedMVs,
  fetchCloudDisk
} = useDataStore()

const fetchData = () => {
  fetchLikedSongs()
  fetchLikedSongsWithDetails()
  fetchLikedPlaylist()
  fetchLikedAlbums()
  fetchLikedArtists()
  fetchLikedMVs()
  fetchCloudDisk()
}

const setNetworkIssue = (issue: Exclude<NetworkIssue, null>): void => {
  if (neteaseRecoveryTimer !== null) {
    window.clearTimeout(neteaseRecoveryTimer)
    neteaseRecoveryTimer = null
  }
  if (networkIssue.value === issue) return
  networkIssue.value = issue
  showToast(
    issue === 'offline' ? t('toast.networkOffline') : t('toast.neteaseUnavailable')
  )
}

const handleOffline = (): void => setNetworkIssue('offline')

const handleOnline = (): void => {
  const recovered = networkIssue.value !== null
  networkIssue.value = null
  if (recovered) showToast(t('toast.networkRestored'))
  fetchData()
}

const handleNeteaseUnavailable = (): void => {
  if (!navigator.onLine) handleOffline()
  else setNetworkIssue('netease-unavailable')
}

const handleNeteaseAvailable = (): void => {
  if (networkIssue.value !== 'netease-unavailable') return
  if (neteaseRecoveryTimer !== null) window.clearTimeout(neteaseRecoveryTimer)
  neteaseRecoveryTimer = window.setTimeout(() => {
    neteaseRecoveryTimer = null
    if (networkIssue.value !== 'netease-unavailable') return
    networkIssue.value = null
    showToast(t('toast.networkRestored'))
  }, 1500)
}

let mainScrollFrame: number | null = null

const syncMainScrollState = () => {
  mainScrollFrame = null
  const element = mainRef.value as HTMLElement | undefined
  if (!element) return

  registerInstance(instanceId.value)
  updateScroll(instanceId.value, {
    scrollTop: element.scrollTop,
    containerHeight: element.clientHeight,
    listHeight: element.scrollHeight
  })
}

const scrollEvent = () => {
  if (mainScrollFrame !== null) return
  mainScrollFrame = window.requestAnimationFrame(syncMainScrollState)
}

const handleEventBus = () => {
  let updateScrollStart = 0

  eventBus.on('update-start', () => {
    updateScrollStart = mainRef.value.scrollTop
  })

  // @ts-ignore
  eventBus.on('update-scroll-bar', (data: { active: string; offset: number }) => {
    if (data.active !== instanceId.value) return
    if (updateScrollStart === 0) updateScrollStart = mainRef.value?.scrollTop
    const top = Math.min(mainRef.value?.scrollHeight, Math.max(updateScrollStart + data.offset, 0))
    mainRef.value.scrollTo({ top, behavior: 'instant' })
  })

  eventBus.on('update-done', () => {
    updateScrollStart = mainRef.value?.scrollTop || 0
  })
}

const padding = ref(120)
const userSelectNone = ref(false)
const settingsStore = useSettingsStore()
const { theme, localMusic, general } = storeToRefs(settingsStore)
const appearance = ref(theme.value.appearance)
const { scanning } = toRefs(localMusic.value)
Utils.changeAppearance(appearance.value)

// ======== newADD start======
// 主窗口全局字体大小设置。
// 说明：
// 1. 只作用于主窗口 renderer 的 #app 内部；
// 2. 不作用于桌面歌词 OSD，因为 OSD 是独立 BrowserWindow；
// 3. 不作用于 macOS 菜单栏歌词，因为菜单栏歌词由 tray 独立绘制/更新。
const APP_FONT_SIZE_KEY = 'appGlobalFontSize'

const readAppGlobalFontSize = () => {
  const saved = Number(localStorage.getItem(APP_FONT_SIZE_KEY))

  if (Number.isFinite(saved) && saved >= 8 && saved <= 32) {
    return saved
  }

  return 16
}

const appGlobalFontSize = ref(readAppGlobalFontSize())

const appFontStyle = computed(() => {
  return {
    // ======== newADD start======
    // 主界面基准字号，例如 16px、14px、10px。
    '--app-global-font-size': `${appGlobalFontSize.value}px`,

    // 主界面字号缩放比例。
    // 以 16px 为默认基准：10px => 0.625，20px => 1.25。
    '--app-global-font-scale': `${appGlobalFontSize.value / 16}`
    // =========== newADD end ========
  }
})

window.addEventListener('app-global-font-size-change', () => {
  appGlobalFontSize.value = readAppGlobalFontSize()
})
// =========== newADD end ========

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (appearance.value === 'auto') {
    Utils.changeAppearance(appearance.value)
  }
})

const route = useRoute()

const scrollBarRef = ref()
const instanceId = ref('appInstance')
const hasCustomTitleBar = ref(false)

const showPlayerBar = computed(() => {
  return ['mv', 'loginAccount'].includes(route.name as string) === false
})

const PLAYER_BAR_HEIGHT = 64
const PLAYER_SAFE_BOTTOM = 120
const playerBarInset = computed(() =>
  enabled.value && showPlayerBar.value ? PLAYER_BAR_HEIGHT : 0
)
const mainStyle = computed(() => {
  const safeBottom = playerBarInset.value ? PLAYER_SAFE_BOTTOM : 0
  return {
    paddingTop: (hasCustomTitleBar.value ? 84 : 64) + 'px',
    paddingBottom: Math.max(padding.value, safeBottom) + 'px'
  }
})

const isMac = computed(() => window.env?.isMac)
const isLinux = computed(() => window.env?.isLinux)

/**
 * 窗口恢复或播放器状态迁移时可能丢失 playlistSource.type，但 Heart Mode session 仍然有效。
 * 只在当前歌曲能明确映射回现存 Heart Mode session 时修复 source 元数据，避免把普通
 * 播放列表误识别为心动模式。此问题并非 Linux 独有，macOS 恢复持久化状态时也会出现。
 */
const syncHeartModePlaylistSource = () => {
  if (playlistSource.value?.type === 'intelligence') return

  const activeSession = getCurrentHeartModeSession()
  const trackId = Number(currentTrack.value?.id)
  if (!activeSession || !Number.isFinite(trackId) || trackId <= 0) return
  if (resolveHeartModeSourceSeedId(activeSession, trackId) === null) return

  playlistSource.value = {
    type: 'intelligence',
    id: activeSession.playlistId || playlistSource.value?.id || 0
  }
}

const handleHeartModeSessionChange = () => syncHeartModePlaylistSource()

watch(
  () => [currentTrack.value?.id, playlistSource.value?.type] as const,
  () => syncHeartModePlaylistSource(),
  { immediate: true }
)

const restorePosition = () => {
  scrollBarRef.value.restorePosition()
}

const watchOsdEvent = () => {
  watch(
    show,
    (value) => {
      window.mainApi?.send('updateOsdState', { show: value })
    },
    { immediate: true }
  )
  watch(type, (value) => {
    window.mainApi?.send('updateOsdState', { type: value })
  })
  watch(isLock, (value) => {
    window.mainApi?.send('updateOsdState', { isLock: value })
  })
}

const mainRef = ref()
const navBarRef = ref()

provide('restorePosition', restorePosition)
provide('updateUserSelect', userSelectNone)
provide('mainRef', mainRef)
provide('navBarRef', navBarRef)
provide('playerBarInset', playerBarInset)

provide('appearance', appearance)
provide('hasCustomTitleBar', hasCustomTitleBar)

provide('updatePadding', (value: number) => {
  padding.value = value
})

provide('scrollMainTo', (top: number, behavior = 'smooth') => {
  mainRef.value.scrollTo({ top, behavior })
})

const handleChanelEvent = () => {
  window.mainApi?.send('updateOsdState', { show: show.value })
  getFontList()
  window.mainApi?.on('msgHandleScanLocalMusic', (_: any, data: { track: any }) => {
    const index = localTracks.value.findIndex((track) => track.filePath === data.track.filePath)
    if (index !== -1) {
      localTracks.value.splice(index, 1, data.track)
    } else {
      localTracks.value.push(data.track)
    }
  })

  window.mainApi?.on('updateLocalMusic', (event, data: { tracks: Track[] }) => {
    showToast(t('toast.localMusicUpdated'))
    localTracks.value = data.tracks
  })

  window.mainApi?.on(
    'msgHandleScanLocalMusicError',
    (_: any, data: { err: any; filePath: string }) => {
      console.log(`扫描本地歌曲 ${data.filePath} 出错： ${data.err}`)
      showToast(t('toast.localMusicScanError'))
    }
  )
  window.mainApi?.on('scanLocalMusicDone', (_: any) => {
    scanning.value = false
  })
  window.mainApi?.on('msgDeletedTracks', (_: any, trackIDs: number[]) => {
    deleteLocalTracks(trackIDs)
  })
  window.mainApi?.on('rememberCloseAppOption', (_: any, result: string) => {
    general.value.closeAppOption = result
  })
  window.mainApi?.on('msgExtensionCheckResult', (_: any, result: boolean) => {
    extensionCheckResult.value = result
  })
  window.mainApi?.on('updateOSDSetting', (_: any, data: { [key: string]: any }) => {
    const [key, value] = Object.entries(data)[0] as [string, any]
    if (key === 'show') {
      show.value = value
    } else if (key === 'lock') {
      isLock.value = value
    }
  })

  window.mainApi?.on('download-progress', (_: any, data: ProgressInfo) => {
    if (!isDownloading.value) isDownloading.value = true
    showToast(
      t('toast.downloadProgress', { percent: parseFloat(data.percent.toFixed(2)) })
    )
    if (data.percent === 100) isDownloading.value = false
  })
  window.mainApi?.on('update-error', (_: any) => {
    isDownloading.value = false
    showToast(t('toast.downloadError'))
  })
  window.mainApi?.on('changeRouteTo', (_: any, route: string) => {
    showLyrics.value = false
    router.push(route)
  })
}

watchOsdEvent()

onMounted(async () => {
  registerInstance(instanceId.value)
  handleEventBus()
  handleChanelEvent()
  window.addEventListener(HEART_MODE_SESSION_CHANGE_EVENT, handleHeartModeSessionChange)
  window.addEventListener('offline', handleOffline)
  window.addEventListener('online', handleOnline)
  window.addEventListener('vutronmusic-netease-unavailable', handleNeteaseUnavailable)
  window.addEventListener('vutronmusic-netease-available', handleNeteaseAvailable)
  syncHeartModePlaylistSource()
  hasCustomTitleBar.value =
    (window.env?.isLinux && general.value.useCustomTitlebar) || window.env?.isWindows || false
  if (isMac.value) {
    import('./utils/trayLyrics').then((module) => {
      const buildTrays = module.buildTrays
      buildTrays()

      const buildTouchBars = module.buildTouchBars
      buildTouchBars()
    })
  }
  if (isLinux.value) {
    window.mainApi?.invoke('askExtensionStatus').then((result: boolean) => {
      extensionCheckResult.value = result
    })
  }
  document.documentElement.style.setProperty(
    '--color-primary',
    theme.value.colors.find((c) => c.selected)?.color || 'rgba(51, 94, 234, 1)'
  )
  if (navigator.onLine) fetchData()
  else setNetworkIssue('offline')
})

onBeforeUnmount(() => {
  if (neteaseRecoveryTimer !== null) window.clearTimeout(neteaseRecoveryTimer)
  if (mainScrollFrame !== null) {
    window.cancelAnimationFrame(mainScrollFrame)
    mainScrollFrame = null
  }
  window.removeEventListener(HEART_MODE_SESSION_CHANGE_EVENT, handleHeartModeSessionChange)
  window.removeEventListener('offline', handleOffline)
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('vutronmusic-netease-unavailable', handleNeteaseUnavailable)
  window.removeEventListener('vutronmusic-netease-available', handleNeteaseAvailable)
  unregisterInstance(instanceId.value)
})
</script>

<style lang="scss">
#app {
  width: 100%;
  color: var(--color-text);
  transition: all 0.4s;
  // ======== newADD start======
  // 主窗口全局字号入口。
  // 默认 font-size 会被大量子元素继承；
  // 对于写死字号的组件，下面再用 :deep() 做温和覆盖。
  font-size: var(--app-global-font-size);
  // =========== newADD end ========
}

.network-status-banner {
  position: fixed;
  z-index: 10000;
  top: 12px;
  left: 50%;
  max-width: min(620px, calc(100vw - 48px));
  padding: 10px 18px;
  border: 1px solid color-mix(in srgb, #f59e0b 48%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, #7c2d12 92%, var(--color-body-bg));
  box-shadow: 0 8px 28px rgb(0 0 0 / 24%);
  color: #fff;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
  transform: translateX(-50%);
}

.user-select-none {
  user-select: none;
}

#main {
  padding: 0px 30px 0px 130px;
  box-sizing: border-box;
  scrollbar-width: none;
  color: var(--color-text);
  height: 100vh;
}

#main::-webkit-scrollbar {
  width: 0px;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.4s;
}
.slide-up-enter,
.slide-up-leave-to {
  transform: translateY(100%);
}
.contextMenu {
  width: 0;
}

/* ======== newADD start====== */
/* 主窗口全局字体大小强制覆盖版。
 * 目标：
 * 1. 覆盖主窗口中大量写死 px 的 font-size；
 * 2. 保留基本层级：普通文本、标题、小字分别按比例缩放；
 * 3. 不影响桌面歌词 OSD 和 macOS 菜单栏歌词，因为它们不在 #app 这棵 DOM 树里。
 */

/* 默认文本：设置页正文、按钮、列表文字、评论正文等 */
#app
  :where(div, span, label, p, a, button, input, select, textarea, li, td, th):not(.svg-icon):not(
    .iconfont
  ) {
  font-size: var(--app-global-font-size) !important;
}

/* 常见标题：用户名、歌曲名、设置项标题、评论标题等 */
#app
  :where(
    .title,
    .nickname,
    .name,
    .track-name,
    .song-name,
    .playlist-name,
    .album-name,
    .artist-name
  ):not(.svg-icon):not(.iconfont) {
  font-size: calc(1.25 * var(--app-global-font-size)) !important;
}

/* 辅助说明文字：描述、副标题、歌手名、时间、额外信息等 */
#app
  :where(
    .description,
    .extra-info,
    .artist,
    .artists,
    .sub-title,
    .subtext,
    .time,
    .date,
    .text
  ):not(.svg-icon):not(.iconfont) {
  font-size: calc(0.875 * var(--app-global-font-size)) !important;
}

/* 顶部/侧边栏 tab、设置页 tab */
#app :where(.tab, .item, .left, .right):not(.svg-icon):not(.iconfont) {
  font-size: var(--app-global-font-size) !important;
}

/* 表单控件强制继承 */
#app button,
#app input,
#app select,
#app textarea {
  font-size: var(--app-global-font-size) !important;
}

/* 不要把 SVG 图标、图标字体、图片当成文字缩放 */
#app svg,
#app svg *,
#app img,
#app .svg-icon,
#app .iconfont {
  font-size: unset;
}
/* =========== newADD end ======== */
/* ======== newADD start====== */
/* 主窗口图标随“主界面字体大小”一起缩放。
 * 说明：
 * 1. 使用 --app-global-font-scale，与主界面字号共用同一个比例；
 * 2. 只作用于 #app 内部，所以不影响桌面歌词 OSD 和 macOS 菜单栏歌词；
 * 3. 只缩放图标本体，不直接改变按钮容器大小，避免布局突然塌陷。
 */
#app .svg-icon,
#app .iconfont {
  transform: scale(calc(0.7 + 0.25 * var(--app-global-font-scale)));
  transform-origin: center;
}
/* =========== newADD end ======== */
</style>
