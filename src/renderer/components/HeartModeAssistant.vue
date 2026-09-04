<template>
  <div v-if="isHeartMode" class="heart-mode-assistant">
    <button class="heart-mode-trigger" :title="texts.title" @click="panelOpen = !panelOpen">
      ✨
    </button>

    <transition name="heart-mode-panel">
      <section v-if="panelOpen" class="heart-mode-panel">
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
    why: '为什么推荐这首？',
    from: '推荐来源',
    noSnapshot: '这首歌没有解释快照；下一次新生成或补充的歌曲会自动记录。',
    moreLikeThis: '多来点这种',
    goFurther: '跳远一点',
    session: '本轮状态',
    explore: '探索',
    diversity: '跳脱',
    familiarity: '熟悉',
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
    reset: '重置本轮学习',
    resetHint: '清除本轮评分与调试误操作，不删除喜欢、长期 Profile、推荐历史或当前队列。',
    resetConfirm:
      '确认重置本轮心动学习？\n\n会清除本 Session 已记录的播放反馈、分支评分和临时控制；不会影响喜欢歌曲、长期 Profile、推荐历史和当前队列。',
    resetDone: '本轮学习已重置',
    removedFeedback: '已移除 {count} 条本轮播放反馈',
    strongDown: '强烈降低',
    down: '降低',
    neutral: '中性',
    up: '偏好',
    strongUp: '强偏好'
  },
  zht: {
    title: '目前心動模式',
    subtitle: '推薦解釋與本輪控制',
    close: '關閉',
    why: '為什麼推薦這首？',
    from: '推薦來源',
    noSnapshot: '這首歌沒有解釋快照；下一次新產生或補充的歌曲會自動記錄。',
    moreLikeThis: '多來點這種',
    goFurther: '跳遠一點',
    session: '本輪狀態',
    explore: '探索',
    diversity: '跳脫',
    familiarity: '熟悉',
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
    reset: '重置本輪學習',
    resetHint: '清除本輪評分與測試誤操作，不刪除喜歡、長期 Profile、推薦歷史或目前佇列。',
    resetConfirm:
      '確認重置本輪心動學習？\n\n會清除本 Session 已記錄的播放回饋、分支評分和暫時控制；不會影響喜歡歌曲、長期 Profile、推薦歷史和目前佇列。',
    resetDone: '本輪學習已重置',
    removedFeedback: '已移除 {count} 條本輪播放回饋',
    strongDown: '強烈降低',
    down: '降低',
    neutral: '中性',
    up: '偏好',
    strongUp: '強偏好'
  },
  en: {
    title: 'Heart Mode',
    subtitle: 'Recommendation explanation and session controls',
    close: 'Close',
    why: 'Why this track?',
    from: 'Recommendation source',
    noSnapshot:
      'No explanation snapshot is available for this track yet. Newly generated or refilled tracks will record one automatically.',
    moreLikeThis: 'More like this',
    goFurther: 'Go further',
    session: 'Session status',
    explore: 'Explore',
    diversity: 'Diversity',
    familiarity: 'Familiarity',
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
    reset: 'Reset session learning',
    resetHint:
      'Clears session scores and accidental test feedback without changing likes, long-term Profile, recommendation history, or the current queue.',
    resetConfirm:
      'Reset learning for this Heart Mode session?\n\nThis removes recorded playback feedback, branch scores, and temporary steering for this session. Likes, long-term Profile, recommendation history, and the current queue remain unchanged.',
    resetDone: 'Session learning reset',
    removedFeedback: 'Removed {count} session feedback entries',
    strongDown: 'Strongly down',
    down: 'Down',
    neutral: 'Neutral',
    up: 'Preferred',
    strongUp: 'Strongly preferred'
  }
} as const

const playerStore = usePlayerStore()
const stateStore = useNormalStateStore()
const { currentTrack, playlistSource } = storeToRefs(playerStore)

const panelOpen = ref(false)
const sessionVersion = ref(0)
const seedNames = ref<Record<string, string>>({})

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
  window.addEventListener(HEART_MODE_SESSION_CHANGE_EVENT, onSessionChange)
  void loadSeedNames()
})

onBeforeUnmount(() => {
  window.removeEventListener(HEART_MODE_SESSION_CHANGE_EVENT, onSessionChange)
})
</script>

<style scoped lang="scss">
.heart-mode-assistant {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 520;
  color: var(--color-text);
  -webkit-app-region: no-drag;
}

.heart-mode-trigger {
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  font: inherit;
  font-size: 18px;
  color: var(--color-text);
  background: var(--color-secondary-bg-for-transparent);
  backdrop-filter: blur(16px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
}

.heart-mode-panel {
  position: absolute;
  right: 0;
  bottom: 52px;
  width: min(360px, calc(100vw - 32px));
  max-height: min(70vh, 620px);
  overflow: auto;
  box-sizing: border-box;
  padding: 16px;
  border-radius: 14px;
  background: var(--color-body-bg);
  border: 1px solid rgba(128, 128, 128, 0.16);
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(22px);

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
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 650;
  opacity: 0.78;
}

.reason-card {
  padding: 11px 12px;
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
    min-height: 36px;
    border: 0;
    border-radius: 9px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    color: var(--color-text);
    background: var(--color-secondary-bg-for-transparent);

    &:hover {
      filter: brightness(1.08);
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

.branches {
  margin-top: 10px;
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
  border: 0;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  padding: 0;
  font: inherit;
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 3px;
  opacity: 0.62;

  &:hover {
    opacity: 0.95;
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
  .heart-mode-assistant {
    right: 14px;
    bottom: 14px;
  }

  .heart-mode-panel {
    width: min(340px, calc(100vw - 28px));
    max-height: 64vh;
  }
}
</style>
