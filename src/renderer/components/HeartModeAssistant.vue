<template>
  <div
    v-if="isHeartMode"
    :class="['heart-mode-assistant', { 'is-dark': isDarkMode, dragging: isDragging }]"
    :style="assistantStyle"
  >
    <button
      class="heart-mode-trigger"
      :title="texts.dragHint"
      @pointerdown="startDrag"
      @click="togglePanel"
    >
      ✨
    </button>

    <transition name="heart-mode-panel">
      <section
        v-if="panelOpen"
        :class="['heart-mode-panel', panelHorizontalClass, panelVerticalClass]"
        :style="panelStyle"
      >
        <header>
          <div>
            <strong>{{ texts.title }}</strong>
            <span>{{ texts.subtitle }}</span>
          </div>
          <button class="close" :title="texts.close" @click="panelOpen = false">×</button>
        </header>

        <div class="section">
          <div class="section-title">{{ texts.why }}</div>
          <div v-if="reason" class="reason-card">
            <div class="source">
              <span>{{ texts.from }}</span>
              <strong>{{ sourceSeedName }}</strong>
              <small>{{ texts.sourceHint }}</small>
            </div>
            <ul>
              <li v-for="item in explanationItems" :key="item">{{ item }}</li>
            </ul>
          </div>
          <div v-else class="muted">{{ texts.noSnapshot }}</div>
        </div>

        <div class="actions">
          <button @click="moreLikeThis">{{ texts.moreLikeThis }}</button>
          <button @click="goFurther">{{ texts.goFurther }}</button>
        </div>

        <div v-if="session" class="section session-section">
          <div class="section-title">{{ texts.session }}</div>
          <div class="section-hint">{{ texts.sessionHint }}</div>

          <div class="metrics">
            <div>
              <span>{{ texts.explore }}</span>
              <strong>{{ effectiveProfile?.novelty ?? session.profile.novelty }}%</strong>
            </div>
            <div>
              <span>{{ texts.diversity }}</span>
              <strong>{{ effectiveProfile?.diversity ?? session.profile.diversity }}%</strong>
            </div>
            <div>
              <span>{{ texts.familiarity }}</span>
              <strong>{{ effectiveProfile?.familiarity ?? session.profile.familiarity }}%</strong>
            </div>
          </div>

          <div class="queue-summary">
            {{ texts.played }} {{ session.playedTrackIDs.length }} · {{ texts.queued }}
            {{ session.enqueuedTrackIDs.length }} · {{ texts.pending }}
            {{ session.pendingTrackIDs.length }}
          </div>

          <div class="branch-section-title">{{ texts.branchTitle }}</div>
          <div class="branches">
            <div v-for="branch in branchRows" :key="branch.seedId" class="branch-row">
              <span class="branch-name">{{ branch.name }}</span>
              <span :class="['branch-state', branch.tone]">{{ branch.label }}</span>
            </div>
          </div>

          <div
            v-if="
              session.steering.noveltyOffset ||
              session.steering.diversityOffset ||
              session.steering.familiarityOffset
            "
            class="steering-note"
          >
            {{ texts.sessionAdjusted }}
          </div>
        </div>

        <details class="strategy-card">
          <summary>
            <span>{{ texts.strategyTitle }}</span>
            <small>{{ texts.strategySummary }}</small>
          </summary>
          <div class="strategy-content">
            <div v-for="item in strategyItems" :key="item.title" class="strategy-group">
              <strong>{{ item.title }}</strong>
              <ul>
                <li v-for="bullet in item.bullets" :key="bullet">{{ bullet }}</li>
              </ul>
            </div>
            <div class="strategy-note">{{ texts.strategyNote }}</div>
          </div>
        </details>

        <div class="reset-zone">
          <button class="reset-button" @click="resetLearning">{{ texts.reset }}</button>
          <span>{{ texts.resetHint }}</span>
        </div>
      </section>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../store/player'
import { useNormalStateStore } from '../store/state'
import { useSettingsStore } from '../store/settings'
import { getTrackDetail } from '../api/track'
import {
  HEART_MODE_SESSION_CHANGE_EVENT,
  boostHeartModeCurrentBranch,
  getCurrentHeartModeSession,
  getEffectiveHeartModeProfile,
  resetCurrentHeartModeLearning,
  steerHeartModeFurther
} from '../utils/heartModeSession'
import {
  removePlaybackFeedbackForHeartModeSession,
  resetActivePlaybackFeedbackWindow
} from '../utils/playbackFeedback'
import { resolveFeatureLanguage } from '../utils/v327FeatureShared'

const TEXTS = {
  zh: {
    title: '当前心动模式',
    subtitle: '推荐解释与本轮控制',
    close: '关闭',
    dragHint: '点击打开；拖动可移动位置',
    why: '为什么推荐这首？',
    from: '来自这个推荐方向',
    sourceHint: '当前歌曲由这个 Seed 分支扩展出来，不是歌曲的平台来源。',
    noSnapshot: '这首歌没有解释快照；下一次新生成或补充的歌曲会自动记录。',
    moreLikeThis: '多来点这种',
    goFurther: '跳远一点',
    session: '本轮推荐偏好',
    sessionHint: '只影响当前这轮心动模式；长期 Profile 不会被自动改写。',
    explore: '新歌倾向',
    diversity: '风格分散',
    familiarity: '熟歌倾向',
    branchTitle: '各推荐方向的实时反馈',
    played: '已听',
    queued: '已入队',
    pending: '待选',
    sessionAdjusted: '当前参数已按本轮显式操作临时调整，不会修改长期 Profile。',
    boosted: '已提高这个推荐分支在本轮后续补歌中的权重',
    further: '下一次补歌会更偏探索、更分散，并减少熟悉歌曲比例',
    seedFallback: '当前推荐分支',
    reasonBranch: '你在本轮对这一推荐分支的反馈较好',
    reasonNovel: '这首歌最近较少出现在你的播放记录中',
    reasonFamiliar: '这是一首你已经喜欢的歌曲',
    reasonBehavior: '你过去对这首歌的实际播放反馈较好',
    reasonArtistSpacing: '为了避免连续出现相同艺人，它被调整到这里',
    reasonSeedSpacing: '为了避免同一推荐分支过密出现，它被调整到这里',
    reasonFamiliarityCap: '为了控制熟悉歌曲比例，它在重排中获得了更合适的位置',
    reasonRank: '它在当前候选中的综合质量排序较高',
    strategyTitle: '完整策略说明',
    strategySummary: '评分逻辑，以及哪些操作会改变后续推荐',
    strategyScoreTitle: '推荐排序',
    strategyScoreBullets: [
      '多 Seed 并行取得网易云候选，并统一去重。',
      '综合原始排名、新鲜度、熟悉度、历史播放反馈、重复冷却和当前分支偏好进行评分。',
      '初始 12 首；剩余少于 5 首时按最新状态重排并补 8 首，同时继续限制同艺人/同 Seed 过密出现。'
    ],
    strategyFeedbackTitle: '播放行为如何改分',
    strategyFeedbackBullets: [
      '快速手动跳过：≤15 秒 -4；15–45 秒且完成率 <30% 为 -3；听到中段后切歌通常 -1。',
      '高完成度后切歌 +1；自然播完 +2；播放期间主动点赞额外 +5。',
      '听过但没点赞不算负反馈；Seek、播放错误、退出和队列替换也不扣分。'
    ],
    strategyControlTitle: '显式控制',
    strategyControlBullets: [
      '“多来点这种”：提高当前 Seed 分支分数，让同方向歌曲在后续补歌中更容易靠前。',
      '“跳远一点”：当前 Session 每次 novelty +10、diversity +10、familiarity -10，累计最多 ±30。',
      '“重置本轮学习”：清除本 Session 的播放反馈、分支分数和临时调整；喜欢歌曲、长期 Profile、推荐历史和当前队列保留。'
    ],
    strategyNote: '长期 Profile 管整体风格；播放行为和这些按钮只负责当前 Session 的短期纠偏。',
    reset: '重置本轮学习',
    resetHint: '清除本轮评分与调试误操作，不删除喜欢、长期 Profile、推荐历史或当前队列。',
    resetConfirm:
      '确认重置本轮心动学习？\n\n会清除本 Session 已记录的播放反馈、分支评分和临时控制；不会影响喜欢歌曲、长期 Profile、推荐历史和当前队列。',
    resetDone: '本轮学习已重置',
    removedFeedback: '已移除 {count} 条本轮播放反馈',
    strongDown: '明显减少',
    down: '减少',
    neutral: '正常',
    up: '多推荐',
    strongUp: '明显多推荐'
  },
  zht: {
    title: '目前心動模式',
    subtitle: '推薦解釋與本輪控制',
    close: '關閉',
    dragHint: '點擊開啟；拖動可移動位置',
    why: '為什麼推薦這首？',
    from: '來自這個推薦方向',
    sourceHint: '目前歌曲由這個 Seed 分支延伸而來，不是歌曲的平台來源。',
    noSnapshot: '這首歌沒有解釋快照；下一次新產生或補充的歌曲會自動記錄。',
    moreLikeThis: '多來點這種',
    goFurther: '跳遠一點',
    session: '本輪推薦偏好',
    sessionHint: '只影響目前這輪心動模式；長期 Profile 不會被自動改寫。',
    explore: '新歌傾向',
    diversity: '風格分散',
    familiarity: '熟歌傾向',
    branchTitle: '各推薦方向的即時回饋',
    played: '已聽',
    queued: '已入隊',
    pending: '待選',
    sessionAdjusted: '目前參數已按本輪操作暫時調整，不會修改長期 Profile。',
    boosted: '已提高這個推薦分支在本輪後續補歌中的權重',
    further: '下一次補歌會更偏探索、更分散，並降低熟悉歌曲比例',
    seedFallback: '目前推薦分支',
    reasonBranch: '你在本輪對這個推薦分支的回饋較好',
    reasonNovel: '這首歌最近較少出現在你的播放記錄中',
    reasonFamiliar: '這是一首你已經喜歡的歌曲',
    reasonBehavior: '你過去對這首歌的實際播放回饋較好',
    reasonArtistSpacing: '為了避免連續出現相同藝人，它被調整到這裡',
    reasonSeedSpacing: '為了避免同一推薦分支過密出現，它被調整到這裡',
    reasonFamiliarityCap: '為了控制熟悉歌曲比例，它在重排中取得更合適的位置',
    reasonRank: '它在目前候選中的綜合品質排序較高',
    strategyTitle: '完整策略說明',
    strategySummary: '評分邏輯，以及哪些操作會改變後續推薦',
    strategyScoreTitle: '推薦排序',
    strategyScoreBullets: [
      '多 Seed 平行取得網易雲候選，並統一去重。',
      '綜合原始排名、新鮮度、熟悉度、歷史播放回饋、重複冷卻和目前分支偏好進行評分。',
      '初始 12 首；剩餘少於 5 首時依最新狀態重排並補 8 首，同時繼續限制同藝人/同 Seed 過密出現。'
    ],
    strategyFeedbackTitle: '播放行為如何改分',
    strategyFeedbackBullets: [
      '快速手動跳過：≤15 秒 -4；15–45 秒且完成率 <30% 為 -3；聽到中段後切歌通常 -1。',
      '高完成度後切歌 +1；自然播完 +2；播放期間主動按喜歡額外 +5。',
      '聽過但沒按喜歡不算負回饋；Seek、播放錯誤、退出和佇列替換也不扣分。'
    ],
    strategyControlTitle: '顯式控制',
    strategyControlBullets: [
      '「多來點這種」：提高目前 Seed 分支分數，讓同方向歌曲在後續補歌中更容易靠前。',
      '「跳遠一點」：目前 Session 每次 novelty +10、diversity +10、familiarity -10，累計最多 ±30。',
      '「重置本輪學習」：清除本 Session 的播放回饋、分支分數和暫時調整；喜歡歌曲、長期 Profile、推薦歷史和目前佇列保留。'
    ],
    strategyNote: '長期 Profile 管整體風格；播放行為和這些按鈕只負責目前 Session 的短期修正。',
    reset: '重置本輪學習',
    resetHint: '清除本輪評分與測試誤操作，不刪除喜歡、長期 Profile、推薦歷史或目前佇列。',
    resetConfirm:
      '確認重置本輪心動學習？\n\n會清除本 Session 已記錄的播放回饋、分支評分和暫時控制；不會影響喜歡歌曲、長期 Profile、推薦歷史和目前佇列。',
    resetDone: '本輪學習已重置',
    removedFeedback: '已移除 {count} 條本輪播放回饋',
    strongDown: '明顯減少',
    down: '減少',
    neutral: '正常',
    up: '多推薦',
    strongUp: '明顯多推薦'
  },
  en: {
    title: 'Heart Mode',
    subtitle: 'Recommendation explanation and session controls',
    close: 'Close',
    dragHint: 'Click to open; drag to move',
    why: 'Why this track?',
    from: 'From this recommendation direction',
    sourceHint:
      'The current track was expanded from this seed branch; this is not the music platform source.',
    noSnapshot:
      'No explanation snapshot is available for this track yet. Newly generated or refilled tracks will record one automatically.',
    moreLikeThis: 'More like this',
    goFurther: 'Go further',
    session: 'Current recommendation preference',
    sessionHint:
      'These values only steer this Heart Mode session; your long-term Profile is not rewritten automatically.',
    explore: 'New-track tendency',
    diversity: 'Style spread',
    familiarity: 'Familiar-track tendency',
    branchTitle: 'Live feedback for each recommendation direction',
    played: 'Played',
    queued: 'Queued',
    pending: 'Pending',
    sessionAdjusted:
      'These changes apply only to this session and do not modify the long-term Profile.',
    boosted: 'This recommendation branch will have more weight in future refills',
    further: 'The next refill will explore further, diversify more, and use fewer familiar tracks',
    seedFallback: 'Current recommendation branch',
    reasonBranch: 'Your feedback for this recommendation branch has been positive in this session',
    reasonNovel: 'This track has appeared less often in your recent listening',
    reasonFamiliar: 'This is already one of your liked tracks',
    reasonBehavior: 'Your past playback behavior for this track has been positive',
    reasonArtistSpacing: 'It was repositioned to avoid repeating the same artist too closely',
    reasonSeedSpacing:
      'It was repositioned to avoid repeating the same recommendation branch too closely',
    reasonFamiliarityCap: 'It was repositioned to keep the familiar-track mix under control',
    reasonRank: 'It ranked highly among the current candidates',
    strategyTitle: 'Full strategy',
    strategySummary: 'How scoring works and which actions change future recommendations',
    strategyScoreTitle: 'Recommendation ranking',
    strategyScoreBullets: [
      'Fetch and deduplicate candidates from multiple NetEase seed branches.',
      'Score candidates using original rank, novelty, familiarity, playback feedback, repeat cooldown, and current branch preference.',
      'Start with 12 tracks; when fewer than 5 remain, rescore the latest state and append 8 while preserving artist/seed spacing.'
    ],
    strategyFeedbackTitle: 'Playback actions that change scores',
    strategyFeedbackBullets: [
      'Fast manual skips: ≤15 seconds -4; 15–45 seconds with <30% completion -3; switching around the middle is usually -1.',
      'High-completion manual switch +1; natural completion +2; an active like adds +5.',
      'Heard-but-not-liked is neutral; seeks, playback errors, app exit, and queue replacement do not lower preference.'
    ],
    strategyControlTitle: 'Explicit controls',
    strategyControlBullets: [
      '“More like this” raises the current seed branch score so that direction can rank higher in later refills.',
      '“Go further” applies session-only novelty +10, diversity +10, familiarity -10 per click, capped at ±30.',
      '“Reset session learning” clears this session’s playback feedback, branch scores, and temporary steering while preserving likes, long-term Profile, recommendation history, and current queue.'
    ],
    strategyNote:
      'The long-term Profile sets the overall style; playback behavior and these controls only steer the current session.',
    reset: 'Reset session learning',
    resetHint:
      'Clears session scores and accidental test feedback without changing likes, long-term Profile, recommendation history, or the current queue.',
    resetConfirm:
      'Reset learning for this Heart Mode session?\n\nThis removes recorded playback feedback, branch scores, and temporary steering for this session. Likes, long-term Profile, recommendation history, and the current queue remain unchanged.',
    resetDone: 'Session learning reset',
    removedFeedback: 'Removed {count} session feedback entries',
    strongDown: 'Much less',
    down: 'Less',
    neutral: 'Normal',
    up: 'More',
    strongUp: 'Much more'
  }
} as const

const playerStore = usePlayerStore()
const stateStore = useNormalStateStore()
const settingsStore = useSettingsStore()
const { currentTrack, playlistSource } = storeToRefs(playerStore)

const panelOpen = ref(false)
const sessionVersion = ref(0)
const seedNames = ref<Record<string, string>>({})

const HEART_MODE_ASSISTANT_POSITION_KEY = 'vutronmusic-heart-mode-assistant-position-v1'
const ASSISTANT_SIZE = 42
const VIEWPORT_MARGIN = 10
const DRAG_THRESHOLD = 4

const systemDark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches)
const viewport = ref({ width: window.innerWidth, height: window.innerHeight })
const assistantPosition = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const suppressNextClick = ref(false)
let dragStart: {
  pointerId: number
  originX: number
  originY: number
  clientX: number
  clientY: number
} | null = null

const isDarkMode = computed(() => {
  const appearance = settingsStore.theme.appearance
  return appearance === 'dark' || (appearance === 'auto' && systemDark.value)
})

const clampAssistantPosition = (x: number, y: number) => ({
  x: Math.min(
    Math.max(VIEWPORT_MARGIN, x),
    Math.max(VIEWPORT_MARGIN, viewport.value.width - ASSISTANT_SIZE - VIEWPORT_MARGIN)
  ),
  y: Math.min(
    Math.max(VIEWPORT_MARGIN, y),
    Math.max(VIEWPORT_MARGIN, viewport.value.height - ASSISTANT_SIZE - VIEWPORT_MARGIN)
  )
})

const defaultAssistantPosition = () =>
  clampAssistantPosition(viewport.value.width - ASSISTANT_SIZE - 24, viewport.value.height - 128)

const assistantStyle = computed(() => ({
  left: `${assistantPosition.value.x}px`,
  top: `${assistantPosition.value.y}px`
}))

const panelHorizontalClass = computed(() =>
  assistantPosition.value.x > viewport.value.width / 2 ? 'open-left' : 'open-right'
)
const panelVerticalClass = computed(() =>
  assistantPosition.value.y > viewport.value.height / 2 ? 'open-up' : 'open-down'
)
const panelStyle = computed(() => {
  const availableHeight =
    panelVerticalClass.value === 'open-up'
      ? assistantPosition.value.y - 20
      : viewport.value.height - assistantPosition.value.y - ASSISTANT_SIZE - 20
  return {
    maxHeight: `${Math.max(180, Math.min(620, availableHeight))}px`
  }
})

const texts = computed(() => TEXTS[resolveFeatureLanguage()])
const isHeartMode = computed(() => playlistSource.value?.type === 'intelligence')
const sessionSnapshot = computed(() => ({
  version: sessionVersion.value,
  value: getCurrentHeartModeSession()
}))
const session = computed(() => sessionSnapshot.value.value)
const effectiveProfile = computed(() => getEffectiveHeartModeProfile(session.value))
const reason = computed(() => {
  const activeSession = sessionSnapshot.value.value
  const trackId = Number(currentTrack.value?.id)
  if (!activeSession || !Number.isFinite(trackId) || trackId <= 0) return null
  return activeSession.recommendationReasons[String(trackId)] ?? null
})

const sourceSeedName = computed(() => {
  const seedId = reason.value?.sourceSeedId
  if (!seedId) return texts.value.seedFallback
  return seedNames.value[String(seedId)] || `${texts.value.seedFallback} #${seedId}`
})

const branchLabel = (score: number) => {
  if (score <= -0.6) return { label: texts.value.strongDown, tone: 'strong-down' }
  if (score <= -0.2) return { label: texts.value.down, tone: 'down' }
  if (score < 0.2) return { label: texts.value.neutral, tone: 'neutral' }
  if (score < 0.6) return { label: texts.value.up, tone: 'up' }
  return { label: texts.value.strongUp, tone: 'strong-up' }
}

const branchRows = computed(() => {
  const active = session.value
  if (!active) return []
  return active.seedIds.map((seedId) => {
    const state = active.branchStates[String(seedId)]
    const score = Number(state?.branchScore) || 0
    return {
      seedId,
      name: seedNames.value[String(seedId)] || `Seed #${seedId}`,
      score,
      ...branchLabel(score)
    }
  })
})

const explanationItems = computed(() => {
  const current = reason.value
  if (!current) return []

  const result: string[] = []
  if (current.score.branchPreference >= 0.2) result.push(texts.value.reasonBranch)
  if (current.score.behavior >= 0.2) result.push(texts.value.reasonBehavior)
  if (current.rerank.movedForArtistSpacing) result.push(texts.value.reasonArtistSpacing)
  if (current.rerank.movedForSeedSpacing) result.push(texts.value.reasonSeedSpacing)
  if (current.rerank.familiarityDeferred) result.push(texts.value.reasonFamiliarityCap)
  if (current.likedAtRecommendation) result.push(texts.value.reasonFamiliar)
  if (current.score.novelty >= 0.9 && !current.likedAtRecommendation) {
    result.push(texts.value.reasonNovel)
  }
  if (current.score.rankQuality >= 0.65) result.push(texts.value.reasonRank)

  return Array.from(new Set(result)).slice(0, 4)
})

const strategyItems = computed(() => [
  { title: texts.value.strategyScoreTitle, bullets: texts.value.strategyScoreBullets },
  { title: texts.value.strategyFeedbackTitle, bullets: texts.value.strategyFeedbackBullets },
  { title: texts.value.strategyControlTitle, bullets: texts.value.strategyControlBullets }
])

const persistAssistantPosition = () => {
  try {
    localStorage.setItem(HEART_MODE_ASSISTANT_POSITION_KEY, JSON.stringify(assistantPosition.value))
  } catch (error) {
    console.warn('[HeartModeAssistant] 保存浮动按钮位置失败：', error)
  }
}

const restoreAssistantPosition = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(HEART_MODE_ASSISTANT_POSITION_KEY) || 'null')
    if (stored && Number.isFinite(Number(stored.x)) && Number.isFinite(Number(stored.y))) {
      assistantPosition.value = clampAssistantPosition(Number(stored.x), Number(stored.y))
      return
    }
  } catch {
    // 使用默认位置。
  }
  assistantPosition.value = defaultAssistantPosition()
}

const startDrag = (event: PointerEvent) => {
  if (event.button !== 0) return
  dragStart = {
    pointerId: event.pointerId,
    originX: assistantPosition.value.x,
    originY: assistantPosition.value.y,
    clientX: event.clientX,
    clientY: event.clientY
  }
  isDragging.value = false
  ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
}

const moveDrag = (event: PointerEvent) => {
  if (!dragStart || event.pointerId !== dragStart.pointerId) return
  const dx = event.clientX - dragStart.clientX
  const dy = event.clientY - dragStart.clientY
  if (!isDragging.value && Math.hypot(dx, dy) < DRAG_THRESHOLD) return

  isDragging.value = true
  panelOpen.value = false
  assistantPosition.value = clampAssistantPosition(dragStart.originX + dx, dragStart.originY + dy)
}

const endDrag = (event: PointerEvent) => {
  if (!dragStart || event.pointerId !== dragStart.pointerId) return
  if (isDragging.value) {
    persistAssistantPosition()
    suppressNextClick.value = true
  }
  dragStart = null
  isDragging.value = false
}

const togglePanel = () => {
  if (suppressNextClick.value) {
    suppressNextClick.value = false
    return
  }
  panelOpen.value = !panelOpen.value
}

const handleViewportResize = () => {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
  assistantPosition.value = clampAssistantPosition(
    assistantPosition.value.x,
    assistantPosition.value.y
  )
  persistAssistantPosition()
}

const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
const handleColorSchemeChange = (event: MediaQueryListEvent) => {
  systemDark.value = event.matches
}

const loadSeedNames = async () => {
  const ids = session.value?.seedIds ?? []
  const missing = ids.filter((id) => !seedNames.value[String(id)])
  if (!missing.length) return

  try {
    const detail = await getTrackDetail(missing.join(','))
    const songs = Array.isArray(detail?.songs) ? detail.songs : []
    const next = { ...seedNames.value }
    for (const song of songs) {
      const id = Number(song?.id)
      if (!Number.isFinite(id) || id <= 0) continue
      const artists = Array.isArray(song?.ar)
        ? song.ar
        : Array.isArray(song?.artists)
          ? song.artists
          : []
      const artistNames = artists
        .map((artist: any) => String(artist?.name || '').trim())
        .filter(Boolean)
      const name = String(song?.name || `#${id}`)
      next[String(id)] = artistNames.length ? `${name} — ${artistNames.join('/')}` : name
    }
    seedNames.value = next
  } catch (error) {
    console.warn('[HeartModeAssistant] seed metadata unavailable:', error)
  }
}

const refreshSession = () => {
  sessionVersion.value += 1
  void loadSeedNames()
}

const moreLikeThis = () => {
  const trackId = Number(currentTrack.value?.id)
  if (!Number.isFinite(trackId) || trackId <= 0) return
  const updated = boostHeartModeCurrentBranch(trackId)
  if (!updated) return
  stateStore.showToast(texts.value.boosted)
  refreshSession()
}

const goFurther = () => {
  const trackId = Number(currentTrack.value?.id)
  if (!Number.isFinite(trackId) || trackId <= 0) return
  const updated = steerHeartModeFurther(trackId)
  if (!updated) return
  stateStore.showToast(texts.value.further)
  refreshSession()
}

const resetLearning = () => {
  const active = session.value
  if (!active) return
  if (!window.confirm(texts.value.resetConfirm)) return

  const removed = removePlaybackFeedbackForHeartModeSession(active.id)
  resetActivePlaybackFeedbackWindow()
  resetCurrentHeartModeLearning()
  stateStore.showToast(
    `${texts.value.resetDone} · ${texts.value.removedFeedback.replace('{count}', String(removed))}`
  )
  refreshSession()
}

watch(
  () => [session.value?.id, currentTrack.value?.id] as const,
  () => {
    void loadSeedNames()
  },
  { immediate: true }
)

const onSessionChange = () => refreshSession()

onMounted(() => {
  restoreAssistantPosition()
  window.addEventListener(HEART_MODE_SESSION_CHANGE_EVENT, onSessionChange)
  window.addEventListener('pointermove', moveDrag)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
  window.addEventListener('resize', handleViewportResize)
  colorSchemeQuery.addEventListener('change', handleColorSchemeChange)
  void loadSeedNames()
})

onBeforeUnmount(() => {
  window.removeEventListener(HEART_MODE_SESSION_CHANGE_EVENT, onSessionChange)
  window.removeEventListener('pointermove', moveDrag)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
  window.removeEventListener('resize', handleViewportResize)
  colorSchemeQuery.removeEventListener('change', handleColorSchemeChange)
})
</script>

<style scoped lang="scss">
.heart-mode-assistant {
  position: fixed;
  z-index: 520;
  color: var(--color-text);
  -webkit-app-region: no-drag;
}

.heart-mode-trigger {
  width: 42px;
  height: 42px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 50%;
  cursor: grab;
  touch-action: none;
  font: inherit;
  font-size: 18px;
  color: #202124;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(16px);
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.22),
    0 0 0 1px rgba(255, 255, 255, 0.04) inset;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(0, 0, 0, 0.22);
    box-shadow:
      0 12px 32px rgba(0, 0, 0, 0.26),
      0 0 0 1px rgba(255, 255, 255, 0.06) inset;
  }

  &:active {
    transform: translateY(0) scale(0.97);
  }
}

.heart-mode-assistant.dragging .heart-mode-trigger {
  cursor: grabbing;
  transform: scale(1.03);
}

.heart-mode-assistant.is-dark .heart-mode-trigger {
  color: #f5f6f7;
  background: rgba(34, 36, 40, 0.96);
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.42),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;

  &:hover {
    border-color: rgba(255, 255, 255, 0.3);
  }
}

.heart-mode-panel {
  position: absolute;
  width: min(360px, calc(100vw - 32px));
  overflow: auto;
  box-sizing: border-box;
  padding: 16px;
  border-radius: 14px;
  background: var(--color-body-bg);
  border: 1px solid rgba(128, 128, 128, 0.36);
  box-shadow:
    0 18px 48px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.035) inset;
  backdrop-filter: blur(22px);

  &.open-left {
    right: 0;
    left: auto;
  }

  &.open-right {
    left: 0;
    right: auto;
  }

  &.open-up {
    bottom: 52px;
    top: auto;
  }

  &.open-down {
    top: 52px;
    bottom: auto;
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;

    div {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    strong {
      font-size: 16px;
    }

    span {
      font-size: 12px;
      opacity: 0.56;
    }
  }
}

.close {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
  opacity: 0.6;
}

.section {
  margin-top: 16px;
}

.section-title {
  margin-bottom: 5px;
  font-size: 13px;
  font-weight: 650;
  opacity: 0.82;
}

.section-hint {
  margin-bottom: 9px;
  font-size: 10.5px;
  line-height: 1.45;
  opacity: 0.52;
}

.reason-card {
  padding: 11px 12px;
  border: 1px solid rgba(128, 128, 128, 0.18);
  border-radius: 10px;
  background: var(--color-secondary-bg-for-transparent);

  .source {
    display: flex;
    flex-direction: column;
    gap: 2px;

    span {
      font-size: 11px;
      opacity: 0.5;
    }

    strong {
      font-size: 13px;
      line-height: 1.35;
    }

    small {
      margin-top: 2px;
      font-size: 10.5px;
      line-height: 1.45;
      opacity: 0.52;
    }
  }

  ul {
    margin: 9px 0 0;
    padding-left: 18px;
    font-size: 12px;
    line-height: 1.55;
    opacity: 0.78;
  }
}

.muted {
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.55;
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;

  button {
    min-height: 42px;
    padding: 0 14px;
    border: 1px solid color-mix(in srgb, var(--color-primary) 58%, transparent);
    border-radius: 10px;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    color: var(--color-text);
    background: color-mix(
      in srgb,
      var(--color-primary) 16%,
      var(--color-secondary-bg-for-transparent)
    );
    box-shadow:
      0 3px 10px rgba(0, 0, 0, 0.12),
      0 1px 0 color-mix(in srgb, var(--color-primary) 18%, transparent) inset;
    transition:
      transform 0.12s ease,
      border-color 0.12s ease,
      box-shadow 0.12s ease,
      filter 0.12s ease;

    &:hover {
      filter: brightness(1.1);
      border-color: color-mix(in srgb, var(--color-primary) 78%, transparent);
      box-shadow:
        0 5px 14px rgba(0, 0, 0, 0.16),
        0 1px 0 rgba(255, 255, 255, 0.08) inset;
    }

    &:active {
      transform: translateY(1px) scale(0.99);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
    }
  }
}

.metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;

  div {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px;
    border-radius: 9px;
    background: var(--color-secondary-bg-for-transparent);
  }

  span {
    font-size: 11px;
    opacity: 0.55;
  }

  strong {
    font-size: 14px;
  }
}

.queue-summary,
.steering-note {
  margin-top: 9px;
  font-size: 11px;
  line-height: 1.45;
  opacity: 0.62;
}

.branch-section-title {
  margin-top: 12px;
  margin-bottom: 6px;
  font-size: 11.5px;
  font-weight: 650;
  opacity: 0.68;
}

.branches {
  margin-top: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.branch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
}

.branch-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.branch-state {
  flex: 0 0 auto;
  font-size: 11px;
  opacity: 0.75;

  &.strong-down,
  &.down {
    opacity: 0.52;
  }

  &.up,
  &.strong-up {
    font-weight: 650;
    opacity: 0.9;
  }
}

.strategy-card {
  margin-top: 16px;
  border: 1px solid rgba(128, 128, 128, 0.24);
  border-radius: 10px;
  background: var(--color-secondary-bg-for-transparent);
  overflow: hidden;

  summary {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 11px 12px;
    cursor: pointer;
    user-select: none;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    span {
      font-size: 13.5px;
      font-weight: 700;
    }

    small {
      font-size: 11px;
      line-height: 1.4;
      opacity: 0.52;
    }
  }

  &[open] summary {
    border-bottom: 1px solid rgba(128, 128, 128, 0.18);
  }
}

.strategy-content {
  padding: 4px 12px 12px;
}

.strategy-group {
  padding: 9px 0;
  border-bottom: 1px solid rgba(128, 128, 128, 0.12);

  &:last-of-type {
    border-bottom: 0;
  }

  strong {
    display: block;
    margin-bottom: 5px;
    font-size: 13px;
    line-height: 1.4;
    font-weight: 700;
  }

  ul {
    margin: 0;
    padding-left: 17px;
  }

  li {
    margin: 3px 0;
    font-size: 11.5px;
    line-height: 1.48;
    opacity: 0.7;
  }
}

.strategy-note {
  margin-top: 6px;
  padding: 9px 10px;
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.1);
  font-size: 11.5px;
  line-height: 1.55;
  opacity: 0.72;
}

.reset-zone {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(128, 128, 128, 0.16);
  display: flex;
  flex-direction: column;
  gap: 6px;

  span {
    font-size: 10px;
    line-height: 1.45;
    opacity: 0.48;
  }
}

.reset-button {
  align-self: flex-start;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 44%, transparent);
  border-radius: 9px;
  background: color-mix(
    in srgb,
    var(--color-primary) 10%,
    var(--color-secondary-bg-for-transparent)
  );
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  transition:
    border-color 0.12s ease,
    background 0.12s ease,
    transform 0.12s ease;

  &:hover {
    border-color: color-mix(in srgb, var(--color-primary) 70%, transparent);
    background: color-mix(
      in srgb,
      var(--color-primary) 16%,
      var(--color-secondary-bg-for-transparent)
    );
  }

  &:active {
    transform: translateY(1px);
  }
}

.heart-mode-panel-enter-active,
.heart-mode-panel-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.heart-mode-panel-enter-from,
.heart-mode-panel-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}

@media (max-width: 680px) {
  .heart-mode-panel {
    width: min(340px, calc(100vw - 28px));
    max-height: 64vh;
  }
}
</style>
