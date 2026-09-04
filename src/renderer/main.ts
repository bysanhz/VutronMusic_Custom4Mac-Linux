import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
// import vuetify from './plugins/vuetify'
import i18n from './plugins/i18n'
import 'virtual:svg-icons-register'
import './assets/css/global.scss'
// ======== newADD start======
// 所有页面元素先由 Electron 使用同一 zoomFactor 整体缩放；fluid-window 负责通用
// 容器换行，settings-fluid-layout 直接适配 SystemSettings.vue 原生结构，
// resize-performance 在拖动期间暂停高成本视觉效果。
import './assets/css/fluid-window.scss'
import './assets/css/settings-fluid-layout.scss'
import './assets/css/resize-performance.scss'
// =========== newADD end ========
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import DOMPurify from 'dompurify'
import { dailyTask } from './utils'
import vue3lottie from 'vue3-lottie'
// ======== newADD start======
// 使用 Electron 页面级连续缩放代替多个 CSS 临界点切换。
// responsive-window.scss 与 responsive-window-fixes.scss 保留在仓库中用于历史对照，
// 但不再加载，避免 700/520/460/390px 等断点造成布局模型突然变化。
import { initializeSmoothWindowScale } from './utils/smoothWindowScale'
import { initializeOsdWindowScaleSettings } from './utils/osdWindowScaleSettings'
import { initializePlaybackStartPolicy } from './utils/playbackStartGuard'
import { initializeTrackLyricOffset } from './utils/trackLyricOffset'
import { initializePlaybackHistory, recentTracks } from './utils/playbackHistory'
import {
  initializePlaybackFeedback,
  markPlaybackEndReason,
  playbackFeedback
} from './utils/playbackFeedback'
import {
  heartModeProfile,
  initializeHeartModeProfile
} from './utils/heartModeProfile'
import {
  createHeartModeSession,
  getCurrentHeartModeSession,
  getHeartModeBranchScoreMap,
  recordHeartModeEnqueuedTracks,
  registerHeartModeCandidatePool
} from './utils/heartModeSession'
import {
  getHeartModeHistory,
  recordHeartModeTrackIDs,
  selectHeartModeSeedIDs
} from './utils/heartModeHistory'
import { rankHeartModeCandidatesByScore } from './utils/heartModeScorer'
import { interleaveHeartModeSeedCandidates } from './utils/heartModeSeedSelector'
import {
  rerankHeartModeCandidatesForDiversity,
  type HeartModeTrackMetadata
} from './utils/heartModeReranker'
import {
  HEART_MODE_INITIAL_QUEUE_SIZE,
  HEART_MODE_REFILL_COUNT,
  HEART_MODE_REFILL_THRESHOLD,
  getHeartModeSpacingContext,
  shouldReplenishHeartModeQueue
} from './utils/heartModeEngine'
import { initializeSleepTimerPlayerBridge } from './utils/sleepTimerPlayerBridge'
import { initializePlayerLyricWatchdog } from './utils/playerLyricWatchdog'
import { usePlayerStore } from './store/player'
import { useDataStore } from './store/data'
import { useNormalStateStore } from './store/state'
import { getPlaylistDetail, intelligencePlaylist } from './api/playlist'
import { getTrackDetail } from './api/track'
// =========== newADD end ========

// Add API key defined in contextBridge to window object type
declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    mainApi?: {
      send: (channel: string, ...data: any[]) => void
      on: (channel: string, func: (...data: any[]) => void) => void
      once: (channel: string, func: (...data: any[]) => void) => void
      off: (channel: string, func: (...data: any[]) => void) => void
      invoke: (channel: string, ...data: any[]) => Promise<any>
      sendMessage: (message: Record<string, any>) => void
      closeMessagePort: () => void
      // ======== newADD start======
      setZoomFactor: (factor: number) => void
      getZoomFactor: () => number
      // =========== newADD end ========
    }
    env?: {
      isElectron: boolean
      isEnableTitlebar: boolean
      isLinux: boolean
      isMac: boolean
      isWindows: boolean
      isDev: boolean
    }
    vutronmusic?: {
      progress: number
      playing: boolean
      volume: number
      currentTrack: Record<string, any>
      isLiked: boolean
      repeatMode: string
      lyric: { lrc: string; tlyric: string; romalrc: string }
    }
    LottieAnimation: (typeof import('vue3-lottie'))['Vue3Lottie']
  }
}

// ======== newADD start======
// 在 Vue 挂载前设置首帧缩放，减少窗口打开或恢复尺寸时的视觉跳动。
initializeSmoothWindowScale()
// =========== newADD end ========

const app = createApp(App)

app.directive('focus', {
  mounted(el) {
    el.focus()
  }
})
app.directive('same-html', (el, binding) => {
  el.innerHTML = DOMPurify.sanitize(binding.value)
})

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app
  // .use(vuetify)
  .use(vue3lottie)
  .use(i18n)
  .use(router)
  .use(pinia)

app.mount('#app')

// ======== newADD start======
// 在桌面歌词设置面板中安装独立的最小/最大缩放参考字号控件。
initializeOsdWindowScaleSettings(router)

const HEART_MODE_CHANNEL = 'vutronmusic-heart-mode-control'
const HEART_MODE_TARGET_COUNT = 30
const playerStore = usePlayerStore(pinia)
initializePlaybackStartPolicy(playerStore)
initializeTrackLyricOffset(playerStore)
initializePlaybackHistory(playerStore)
initializePlaybackFeedback(playerStore)
initializeHeartModeProfile()
initializeSleepTimerPlayerBridge(playerStore)
initializePlayerLyricWatchdog(playerStore)
const dataStore = useDataStore(pinia)
const stateStore = useNormalStateStore(pinia)
let heartModeLoading = false
let heartModeRollingLoading = false
let heartModeLikedTrackIDsCache: number[] = []
const heartModeMetadataCache = new Map<number, HeartModeTrackMetadata>()
const heartModeChannel = new BroadcastChannel(HEART_MODE_CHANNEL)

/**
 * 获取“我喜欢的音乐”歌单 ID。
 *
 * Returns:
 * 已登录账号的喜欢歌单 ID；无法获取时返回 0。
 */
const resolveLikedPlaylistID = async () => {
  let playlistID = Number(dataStore.likedSongPlaylistID) || 0
  if (playlistID > 0) return playlistID

  await dataStore.fetchLikedPlaylist()
  playlistID = Number(dataStore.likedSongPlaylistID) || 0
  return playlistID
}

/**
 * 获取“我喜欢的音乐”中的完整歌曲 ID。
 *
 * Args:
 *   playlistID: 用户“我喜欢的音乐”歌单 ID。
 *
 * Returns:
 *   完整且去重后的喜欢歌曲 ID 列表。
 *
 * Raises:
 *   当歌单详情不可用或歌单为空时抛出错误。
 */
const loadHeartModeLikedTrackIDs = async (playlistID: number) => {
  const detail = await getPlaylistDetail(playlistID, true)
  const likedTrackIDs = Array.from(
    new Set<number>(
      (detail?.playlist?.trackIds || [])
        .map((item: any) => Number(item?.id ?? item))
        .filter((id: number) => Number.isFinite(id) && id > 0)
    )
  )

  if (!likedTrackIDs.length) {
    throw new Error('LIKED_PLAYLIST_EMPTY')
  }

  return likedTrackIDs
}

/**
 * 汇总本机最近播放与网易云一周播放记录。
 *
 * 本机 recentTracks 跨应用重启持久化；网易云 weekData 则补充其他设备或旧会话产生的
 * 最近播放。心动模式只把这些记录用于排序，不会修改用户的真实播放历史。
 */
const collectRecentPlayedTrackIDs = () => {
  const localTrackIDs = recentTracks.value.map((track) => Number(track.id))
  const cloudTrackIDs = dataStore.liked.playHistory.weekData.map((track: any) =>
    Number(track?.id ?? track?.song?.id)
  )

  return Array.from(
    new Set(
      [...localTrackIDs, ...cloudTrackIDs].filter(
        (id) => Number.isFinite(id) && Number(id) > 0
      ) as number[]
    )
  )
}

type HeartModeRecommendation = {
  id: number
  metadata?: HeartModeTrackMetadata
}

const extractHeartModeTrackMetadata = (track: any): HeartModeTrackMetadata | undefined => {
  if (!track) return undefined

  const artists = Array.isArray(track?.ar)
    ? track.ar
    : Array.isArray(track?.artists)
      ? track.artists
      : []

  const artistIds = Array.from(
    new Set(
      artists
        .map((artist: any) => Number(artist?.id))
        .filter((id: number) => Number.isFinite(id) && id > 0)
    )
  )

  const albumId = Number(track?.al?.id ?? track?.album?.id)
  if (!artistIds.length && !(Number.isFinite(albumId) && albumId > 0)) {
    return undefined
  }

  return {
    artistIds,
    albumId: Number.isFinite(albumId) && albumId > 0 ? albumId : undefined
  }
}

/**
 * 请求一次网易云心动模式推荐；优先使用 sid，空结果或失败时退回兼容参数。
 *
 * 同时尽可能从 intelligence/list 自带的 songInfo 提取艺人/专辑元数据，
 * 供 Phase 4 diversity reranker 使用。
 */
const fetchHeartModeRecommendations = async (
  seedTrackID: number,
  playlistID: number
): Promise<HeartModeRecommendation[]> => {
  let result: any = null

  try {
    result = await intelligencePlaylist({
      id: seedTrackID,
      pid: playlistID,
      sid: seedTrackID,
      count: HEART_MODE_TARGET_COUNT
    })
  } catch (error) {
    console.warn('[HeartMode] 带 sid 的请求失败，准备使用兼容参数重试：', error)
  }

  let responseItems = Array.isArray(result?.data) ? result.data : []
  if (!responseItems.length) {
    console.warn('[HeartMode] 带 sid 的请求未返回歌曲，使用兼容参数重试：', {
      code: result?.code,
      message: result?.message
    })

    result = await intelligencePlaylist({
      id: seedTrackID,
      pid: playlistID,
      count: HEART_MODE_TARGET_COUNT
    })
    responseItems = Array.isArray(result?.data) ? result.data : []
  }

  return responseItems
    .map((item: any) => {
      const songInfo = item?.songInfo ?? item
      const id = Number(item?.id ?? songInfo?.id)
      if (!Number.isFinite(id) || id <= 0) return null

      return {
        id,
        metadata: extractHeartModeTrackMetadata(songInfo)
      } satisfies HeartModeRecommendation
    })
    .filter((item: HeartModeRecommendation | null): item is HeartModeRecommendation => item !== null)
}

/**
 * 对 intelligence/list 中缺少 songInfo 的候选批量补齐艺人元数据。
 *
 * /song/detail 支持逗号分隔多个 id；这里每批最多 100 首，避免 URL 过长。
 */
const completeHeartModeTrackMetadata = async (
  trackIDs: Iterable<number>,
  metadataByTrackID: Map<number, HeartModeTrackMetadata>
): Promise<void> => {
  const missing = Array.from(
    new Set(
      Array.from(trackIDs)
        .map((id) => Number(id))
        .filter(
          (id) =>
            Number.isFinite(id) &&
            id > 0 &&
            !(metadataByTrackID.get(id)?.artistIds?.length)
        )
    )
  )

  const batchSize = 100
  for (let start = 0; start < missing.length; start += batchSize) {
    const batch = missing.slice(start, start + batchSize)
    try {
      const detail = await getTrackDetail(batch.join(','))
      const songs = Array.isArray(detail?.songs) ? detail.songs : []
      for (const song of songs) {
        const id = Number(song?.id)
        if (!Number.isFinite(id) || id <= 0) continue
        const metadata = extractHeartModeTrackMetadata(song)
        if (metadata) metadataByTrackID.set(id, metadata)
      }
    } catch (error) {
      console.warn('[HeartMode] 批量补齐候选艺人信息失败，继续使用可用元数据：', error)
    }
  }
}

type HeartModeCandidatePool = {
  candidateTrackIDs: number[]
  candidateSeedByTrackID: Map<number, number>
  metadataByTrackID: Map<number, HeartModeTrackMetadata>
}

/**
 * 并发请求所有 seed 分支并构建 round-robin 候选池。
 *
 * 该 helper 同时服务首次启动和 Phase 5 rolling refill，保证两条路径使用同一套
 * 多 seed 候选来源与归因规则。
 */
const fetchHeartModeCandidatePool = async (
  seedTrackIDs: number[],
  playlistID: number
): Promise<HeartModeCandidatePool> => {
  const recommendationsBySeed = new Map<number, number[]>()
  const metadataByTrackID = new Map<number, HeartModeTrackMetadata>()

  const branchResults = await Promise.all(
    seedTrackIDs.map(async (candidateSeedTrackID) => {
      try {
        return {
          seedTrackID: candidateSeedTrackID,
          recommendations: await fetchHeartModeRecommendations(
            candidateSeedTrackID,
            playlistID
          )
        }
      } catch (error) {
        console.warn('[HeartMode] 当前 seed 推荐请求失败，保留其他可用分支：', {
          seedTrackID: candidateSeedTrackID,
          error
        })
        return {
          seedTrackID: candidateSeedTrackID,
          recommendations: [] as HeartModeRecommendation[]
        }
      }
    })
  )

  for (const { seedTrackID: candidateSeedTrackID, recommendations } of branchResults) {
    recommendationsBySeed.set(
      candidateSeedTrackID,
      recommendations.map((item) => item.id)
    )

    for (const recommendation of recommendations) {
      if (recommendation.metadata && !metadataByTrackID.has(recommendation.id)) {
        metadataByTrackID.set(recommendation.id, recommendation.metadata)
      }
    }
  }

  const {
    candidateTrackIDs,
    candidateSeedByTrackID
  } = interleaveHeartModeSeedCandidates(seedTrackIDs, recommendationsBySeed)

  return {
    candidateTrackIDs,
    candidateSeedByTrackID,
    metadataByTrackID
  }
}

/**
 * 根据“我喜欢的音乐”开始一次新的网易云心动模式播放。
 *
 * 详细说明：
 * 1. 不依赖当前正在播放的歌曲；
 * 2. 从喜欢歌单中随机选择一首歌曲作为 seed song；
 * 3. 调用 `/playmode/intelligence/list`，不调用私人 FM 或每日推荐；
 * 4. 以种子歌曲为第一首，立即替换当前播放队列并开始播放；
 * 5. 所有成功 seed 分支都参与候选池，并按分支内 NetEase 排名 round-robin 交织；
 * 6. Phase 3 Scorer 完成全局质量排序后，再用 Phase 4 diversity reranker
 *    执行同艺人/同 seed 的局部间隔约束；
 * 7. Phase 5 首次只入队 12 首，剩余候选进入 session.pendingTrackIDs，
 *    后续根据实时 branchScore 滚动补队列。
 */
const publishHeartModeResult = (
  requestId: string,
  status: 'loading' | 'success' | 'error',
  message: string
) => {
  heartModeChannel.postMessage({
    type: 'heart-mode-result',
    requestId,
    status,
    message,
    timestamp: Date.now()
  })
}

const startHeartModeFromLikes = async (requestId = '') => {
  if (heartModeLoading) {
    publishHeartModeResult(requestId, 'error', i18n.global.t('player.heartMode.loadingWait'))
    return
  }

  if (!dataStore.user?.userId) {
    const message = i18n.global.t('player.heartMode.loginRequired')
    stateStore.showToast(message)
    publishHeartModeResult(requestId, 'error', message)
    return
  }

  heartModeLoading = true
  stateStore.showToast(i18n.global.t('player.heartMode.generating'))
  publishHeartModeResult(requestId, 'loading', i18n.global.t('player.heartMode.loading'))

  try {
    const playlistID = await resolveLikedPlaylistID()
    if (!playlistID) {
      const message = i18n.global.t('player.heartMode.likedPlaylistMissing')
      stateStore.showToast(message)
      publishHeartModeResult(requestId, 'error', message)
      return
    }

    const likedTrackIDs = await loadHeartModeLikedTrackIDs(playlistID)

    try {
      await dataStore.fetchPlayHistory()
    } catch (error) {
      console.warn('[HeartMode] 网易云最近播放记录获取失败，仅使用本机历史：', error)
    }

    const recentPlayedTrackIDs = collectRecentPlayedTrackIDs()
    const heartModeHistory = getHeartModeHistory()
    const now = Date.now()
    const longCooldownMs =
      Math.max(1, heartModeProfile.value.longCooldownDays) * 24 * 60 * 60 * 1000
    const recentHeartModeTrackIDs = heartModeHistory
      .filter((entry) => now - entry.recommendedAt < longCooldownMs)
      .map((entry) => entry.id)
    const avoidedSeedTrackIDs = [...recentPlayedTrackIDs, ...recentHeartModeTrackIDs]
    const seedTrackIDs = selectHeartModeSeedIDs(
      likedTrackIDs,
      avoidedSeedTrackIDs,
      heartModeProfile.value.seedCount
    )
    const seedTrackID = seedTrackIDs[0]

    if (!seedTrackID) {
      throw new Error('LIKED_PLAYLIST_EMPTY')
    }

    const {
      candidateTrackIDs,
      candidateSeedByTrackID,
      metadataByTrackID
    } = await fetchHeartModeCandidatePool(seedTrackIDs, playlistID)

    // 主 seed 也要带分支归因，确保 reranker 能约束“seed 后立刻又来同一分支”。
    candidateSeedByTrackID.set(seedTrackID, seedTrackID)

    const scoredHeartModeTrackIDs = rankHeartModeCandidatesByScore({
      seedTrackID,
      candidateTrackIDs,
      likedTrackIDs,
      recentPlayedTrackIDs,
      historyEntries: heartModeHistory,
      feedbackEntries: playbackFeedback.value,
      profile: heartModeProfile.value,
      candidateSeedByTrackID,
      targetCount: candidateTrackIDs.length + 1,
      now
    })

    await completeHeartModeTrackMetadata(scoredHeartModeTrackIDs, metadataByTrackID)

    const initialHeartModeTrackIDs = rerankHeartModeCandidatesForDiversity({
      rankedTrackIDs: scoredHeartModeTrackIDs,
      metadataByTrackID,
      sourceSeedByTrackID: candidateSeedByTrackID,
      likedTrackIDs,
      profile: heartModeProfile.value,
      targetCount: HEART_MODE_INITIAL_QUEUE_SIZE
    })

    if (initialHeartModeTrackIDs.length <= 1) {
      const message = i18n.global.t('player.heartMode.recommendationMissing')
      stateStore.showToast(message)
      publishHeartModeResult(requestId, 'error', message)
      return
    }

    const initialTrackSet = new Set(initialHeartModeTrackIDs)
    const pendingTrackIDs = scoredHeartModeTrackIDs.filter(
      (trackID) => !initialTrackSet.has(trackID)
    )

    // Session 保存完整候选归因，而不是只保存当前 12 首。后续 rolling refill
    // 才能在不重新解释 sourceSeedId 的前提下持续学习同一批 seed 分支。
    const sourceSeedByTrackID = Object.fromEntries(
      scoredHeartModeTrackIDs.map((trackID) => [
        String(trackID),
        trackID === seedTrackID
          ? seedTrackID
          : candidateSeedByTrackID.get(trackID) ?? seedTrackID
      ])
    )

    heartModeLikedTrackIDsCache = [...likedTrackIDs]
    heartModeMetadataCache.clear()
    for (const [trackID, metadata] of metadataByTrackID) {
      heartModeMetadataCache.set(trackID, metadata)
    }

    createHeartModeSession({
      profile: heartModeProfile.value,
      seedIds: seedTrackIDs,
      playlistId: playlistID,
      sourceSeedByTrackID,
      enqueuedTrackIDs: initialHeartModeTrackIDs,
      pendingTrackIDs
    })

    markPlaybackEndReason('heart-mode-restart')
    playerStore.clearPlayNextList()
    playerStore.shuffle = false
    playerStore.repeatMode = 'off'

    recordHeartModeTrackIDs(initialHeartModeTrackIDs)
    await playerStore.replacePlaylist(
      'intelligence',
      playlistID,
      initialHeartModeTrackIDs,
      0
    )

    const message = i18n.global.t('player.heartMode.started', {
      count: initialHeartModeTrackIDs.length
    })
    stateStore.showToast(message)
    publishHeartModeResult(requestId, 'success', message)
  } catch (error: any) {
    console.error('[HeartMode] 根据喜欢歌单启动失败：', error)
    const message =
      error?.message === 'LIKED_PLAYLIST_EMPTY'
        ? i18n.global.t('player.heartMode.likedPlaylistEmpty')
        : i18n.global.t('player.heartMode.failed')
    stateStore.showToast(message)
    publishHeartModeResult(requestId, 'error', message)
  } finally {
    heartModeLoading = false
  }
}

// ======== newADD start======
/**
 * 启动心动模式并兜底处理异步异常。
 *
 * Args:
 *   requestId: 桌面歌词请求标识；旧 MessagePort 调用可留空。
 */
const runHeartModeFromLikes = (requestId = '') => {
  startHeartModeFromLikes(requestId).catch((error) => {
    console.error('[HeartMode] 未处理的启动异常：', error)
  })
}
// =========== newADD end ========

const ensureHeartModeLikedTrackIDs = async (playlistID: number): Promise<number[]> => {
  if (heartModeLikedTrackIDsCache.length) return heartModeLikedTrackIDsCache
  heartModeLikedTrackIDsCache = await loadHeartModeLikedTrackIDs(playlistID)
  return heartModeLikedTrackIDsCache
}

/**
 * 当 pending 候选池不足时重新请求同一组 seed。
 *
 * 新结果只补充从未入队/播放过的歌曲；既有 sourceSeedId 不会被新请求覆盖。
 */
const refreshHeartModeRollingCandidates = async (): Promise<void> => {
  const session = getCurrentHeartModeSession()
  if (!session || session.playlistId <= 0 || !session.seedIds.length) return

  const {
    candidateTrackIDs,
    candidateSeedByTrackID,
    metadataByTrackID
  } = await fetchHeartModeCandidatePool(session.seedIds, session.playlistId)

  for (const [trackID, metadata] of metadataByTrackID) {
    if (!heartModeMetadataCache.has(trackID)) {
      heartModeMetadataCache.set(trackID, metadata)
    }
  }

  const sourceSeedByTrackID = Object.fromEntries(
    candidateTrackIDs
      .map((trackID) => {
        const seedID = candidateSeedByTrackID.get(trackID)
        return seedID ? [String(trackID), seedID] : null
      })
      .filter((entry): entry is [string, number] => entry !== null)
  )

  registerHeartModeCandidatePool({
    sourceSeedByTrackID,
    pendingTrackIDs: candidateTrackIDs
  })
}

/**
 * Phase 5 rolling queue：剩余歌曲少于阈值时，使用最新 branchScore 重新排序
 * pending 候选并追加固定数量歌曲。
 */
const replenishHeartModeRollingQueue = async (): Promise<void> => {
  if (heartModeLoading || heartModeRollingLoading) return
  if (playerStore.playlistSource?.type !== 'intelligence') return

  const session = getCurrentHeartModeSession()
  if (!session || session.playlistId <= 0) return

  if (
    !shouldReplenishHeartModeQueue(
      playerStore.currentTrackIndex,
      playerStore.list.length,
      HEART_MODE_REFILL_THRESHOLD
    )
  ) {
    return
  }

  heartModeRollingLoading = true
  try {
    if (session.pendingTrackIDs.length < HEART_MODE_REFILL_COUNT) {
      await refreshHeartModeRollingCandidates()
    }

    const activeSession = getCurrentHeartModeSession()
    if (!activeSession?.pendingTrackIDs.length) return

    const likedTrackIDs = await ensureHeartModeLikedTrackIDs(activeSession.playlistId)
    const recentPlayedTrackIDs = collectRecentPlayedTrackIDs()
    const historyEntries = getHeartModeHistory()
    const now = Date.now()

    const candidateSeedByTrackID = new Map<number, number>(
      Object.entries(activeSession.sourceSeedByTrackID)
        .map(([trackID, seedID]) => [Number(trackID), Number(seedID)] as const)
        .filter(
          ([trackID, seedID]) =>
            Number.isFinite(trackID) &&
            trackID > 0 &&
            Number.isFinite(seedID) &&
            seedID > 0
        )
    )

    const rankedPendingTrackIDs = rankHeartModeCandidatesByScore({
      seedTrackID: activeSession.seedIds[0],
      candidateTrackIDs: activeSession.pendingTrackIDs,
      likedTrackIDs,
      recentPlayedTrackIDs,
      historyEntries,
      feedbackEntries: playbackFeedback.value,
      profile: activeSession.profile,
      candidateSeedByTrackID,
      branchScoreBySeedID: getHeartModeBranchScoreMap(),
      pinSeedFirst: false,
      targetCount: activeSession.pendingTrackIDs.length,
      now
    })

    await completeHeartModeTrackMetadata(
      rankedPendingTrackIDs,
      heartModeMetadataCache
    )

    const contextTrackIDs = getHeartModeSpacingContext(
      playerStore.list,
      activeSession.profile
    )
    const refillTrackIDs = rerankHeartModeCandidatesForDiversity({
      rankedTrackIDs: rankedPendingTrackIDs,
      metadataByTrackID: heartModeMetadataCache,
      sourceSeedByTrackID: candidateSeedByTrackID,
      likedTrackIDs,
      profile: activeSession.profile,
      targetCount: HEART_MODE_REFILL_COUNT,
      contextTrackIDs
    })

    const appendedTrackIDs = playerStore.appendTracksToPlaylist(refillTrackIDs)
    if (!appendedTrackIDs.length) return

    recordHeartModeEnqueuedTracks(appendedTrackIDs)
    recordHeartModeTrackIDs(appendedTrackIDs)
  } catch (error) {
    console.warn('[HeartMode] rolling queue 补充失败，保留当前剩余队列：', error)
  } finally {
    heartModeRollingLoading = false
  }
}

watch(
  () => [
    playerStore.playlistSource?.type,
    playerStore.currentTrack?.id,
    playerStore.list.length,
    playbackFeedback.value.length
  ],
  () => {
    // currentTrack 变化时，playbackFeedback 的 sync watcher 已经先完成上一首
    // finalize + branchState 更新，因此这里读取到的是最新自适应权重。
    void replenishHeartModeRollingQueue()
  },
  { flush: 'post' }
)

/**
 * 使用 BroadcastChannel 接收桌面歌词窗口的心动模式请求。
 *
 * 该通道不依赖桌面歌词 MessagePort 的初始化时序，因此窗口重建、热更新或主窗口
 * 隐藏时仍能稳定触发。
 */
const publishPlayerSnapshot = () => {
  heartModeChannel.postMessage({
    type: 'player-snapshot',
    data: {
      trackID: playerStore.currentTrack?.id ?? 0,
      trackName: playerStore.currentTrack?.name ?? '',
      playing: playerStore.playing,
      isLiked: playerStore.isLiked,
      pic: playerStore.pic,
      repeatMode: playerStore.repeatMode,
      shuffle: playerStore.shuffle,
      lyricOffset: playerStore.lyricOffset
    },
    timestamp: Date.now()
  })
}

heartModeChannel.onmessage = (event: MessageEvent) => {
  if (event.data?.type === 'start-heart-mode-from-likes') {
    runHeartModeFromLikes(String(event.data?.requestId ?? ''))
    return
  }

  if (event.data?.type === 'request-player-snapshot') {
    publishPlayerSnapshot()
  }
}

watch(
  () => [
    playerStore.currentTrack?.id,
    playerStore.playing,
    playerStore.isLiked,
    playerStore.pic,
    playerStore.repeatMode,
    playerStore.shuffle,
    playerStore.lyricOffset
  ],
  publishPlayerSnapshot,
  { immediate: true }
)

// 保留旧 MessagePort 消息兼容，避免旧桌面歌词窗口尚未重建时完全失效。
window.addEventListener('message', (event: MessageEvent) => {
  if (event.data?.type !== 'osd-heart-mode') return
  runHeartModeFromLikes()
})

window.addEventListener('beforeunload', () => {
  heartModeChannel.close()
})
// =========== newADD end ========

dailyTask()
