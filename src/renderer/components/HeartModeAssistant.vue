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

        <details class="strategy-card">
          <summary>
            <span>{{ texts.strategyTitle }}</span>
            <small>{{ texts.strategySummary }}</small>
          </summary>
          <div class="strategy-content">
            <ol>
              <li v-for="item in strategyItems" :key="item.title">
                <strong>{{ item.title }}</strong>
                <span>{{ item.body }}</span>
              </li>
            </ol>
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
    strategyTitle: '完整策略说明',
    strategySummary: '评分逻辑，以及哪些操作会改变后续推荐',
    strategyScoreTitle: '推荐是怎么排出来的',
    strategyScoreBody:
      '系统会从多个 Seed 的网易云推荐结果中建立候选池，再综合原始推荐排名、新鲜度、熟悉度、历史播放反馈、近期重复情况和当前 Seed 分支偏好进行评分。评分后还会限制同艺人/同 Seed 过密出现。初始播放 12 首，剩余少于 5 首时会按最新状态重新评分并补 8 首。',
    strategyFeedbackTitle: '哪些播放行为会改变评分',
    strategyFeedbackBody:
      '很快手动跳过会明显降分：≤15 秒为 -4；15–45 秒且完成率低于 30% 为 -3；听到中段后再切歌通常为 -1。手动切歌但完成率 ≥80% 为 +1，自然播完为 +2，播放期间主动点赞额外 +5。单纯听过但没点赞不是负反馈；Seek、播放错误、退出和队列替换也不会被当成负偏好。',
    strategyControlTitle: '两个按钮会怎样改变推荐',
    strategyControlBody:
      '“多来点这种”会提高当前歌曲所属 Seed 的 branchScore，让这个方向在后续补歌时更容易排到前面，但仍受艺人/Seed 间隔约束。“跳远一点”只在当前 Session 临时把 novelty +10、diversity +10、familiarity -10，最多累计到 ±30，让下一轮补歌更探索、更分散。“重置本轮学习”会清掉本 Session 的播放反馈、分支分数和临时调整，但保留喜欢歌曲、长期 Profile、推荐历史和当前队列。',
    strategyNote:
      '长期 Profile 决定整体风格；当前 Session 的播放行为和两个按钮只负责短期纠偏。真正影响后续推荐的是评分变化和 Session 临时参数，不会自动修改你的长期 Profile。',
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
    strategyTitle: '完整策略說明',
    strategySummary: '評分邏輯，以及哪些操作會改變後續推薦',
    strategyScoreTitle: '推薦是怎麼排出來的',
    strategyScoreBody:
      '系統會從多個 Seed 的網易雲推薦結果建立候選池，再綜合原始推薦排名、新鮮度、熟悉度、歷史播放回饋、近期重複情況和目前 Seed 分支偏好進行評分。評分後還會限制同藝人/同 Seed 過密出現。初始播放 12 首，剩餘少於 5 首時會依最新狀態重新評分並補 8 首。',
    strategyFeedbackTitle: '哪些播放行為會改變評分',
    strategyFeedbackBody:
      '很快手動跳過會明顯降分：≤15 秒為 -4；15–45 秒且完成率低於 30% 為 -3；聽到中段後再切歌通常為 -1。手動切歌但完成率 ≥80% 為 +1，自然播完為 +2，播放期間主動按喜歡額外 +5。單純聽過但沒按喜歡不是負回饋；Seek、播放錯誤、退出和佇列替換也不會被視為負偏好。',
    strategyControlTitle: '兩個按鈕會怎樣改變推薦',
    strategyControlBody:
      '「多來點這種」會提高目前歌曲所屬 Seed 的 branchScore，讓這個方向在後續補歌時更容易排到前面，但仍受藝人/Seed 間隔限制。「跳遠一點」只在目前 Session 暫時把 novelty +10、diversity +10、familiarity -10，最多累計到 ±30，讓下一輪補歌更探索、更分散。「重置本輪學習」會清掉本 Session 的播放回饋、分支分數和暫時調整，但保留喜歡歌曲、長期 Profile、推薦歷史和目前佇列。',
    strategyNote:
      '長期 Profile 決定整體風格；目前 Session 的播放行為和兩個按鈕只負責短期修正。真正影響後續推薦的是評分變化和 Session 暫時參數，不會自動修改你的長期 Profile。',
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
    strategyTitle: 'Full strategy',
    strategySummary: 'How scoring works and which actions change future recommendations',
    strategyScoreTitle: 'How recommendations are ranked',
    strategyScoreBody:
      'Candidates are pooled from multiple NetEase seed branches, then scored using original recommendation rank, novelty, familiarity, historical playback feedback, recent repetition, and the current seed branch preference. Reranking also prevents the same artist or seed from appearing too densely. Heart Mode starts with 12 tracks and, when fewer than 5 remain, rescoring uses the latest state to append 8 more.',
    strategyFeedbackTitle: 'Playback actions that change scores',
    strategyFeedbackBody:
      'Very fast manual skips are strongly negative: ≤15 active seconds scores -4; 15–45 seconds with <30% completion scores -3; switching after reaching the middle is usually -1. A manual switch at ≥80% completion scores +1, natural completion scores +2, and an active like adds +5. Merely hearing a track without liking it is not negative; seeks, playback errors, app exit, and queue replacement are preference-neutral.',
    strategyControlTitle: 'How the two controls change recommendations',
    strategyControlBody:
      '“More like this” raises the current track’s seed branchScore so that direction can rank higher in later refills, while artist/seed spacing still applies. “Go further” changes only this session by applying novelty +10, diversity +10, familiarity -10 per click, capped at ±30, making the next refill more exploratory. Reset clears this session’s playback feedback, branch scores, and temporary steering while preserving likes, the long-term Profile, recommendation history, and current queue.',
    strategyNote:
      'The long-term Profile sets the overall style. Playback behavior and the two controls only steer the current session; they do not automatically rewrite your long-term Profile.',
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

const strategyItems = computed(() => [
  { title: texts.value.strategyScoreTitle, body: texts.value.strategyScoreBody },
  { title: texts.value.strategyFeedbackTitle, body: texts.value.strategyFeedbackBody },
  { title: texts.value.strategyControlTitle, body: texts.value.strategyControlBody }
])

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
  bottom: 86px;
  z-index: 520;
  color: var(--color-text);
  -webkit-app-region: no-drag;
}

.heart-mode-trigger {
  width: 42px;
  height: 42px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 50%;
  cursor: pointer;
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
  border: 1px solid rgba(128, 128, 128, 0.36);
  box-shadow:
    0 18px 48px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.035) inset;
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
    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 10px;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    color: var(--color-text);
    background: rgba(255, 255, 255, 0.1);
    box-shadow:
      0 3px 10px rgba(0, 0, 0, 0.12),
      0 1px 0 rgba(255, 255, 255, 0.06) inset;
    transition:
      transform 0.12s ease,
      border-color 0.12s ease,
      box-shadow 0.12s ease,
      filter 0.12s ease;

    &:hover {
      filter: brightness(1.1);
      border-color: rgba(128, 128, 128, 0.55);
      box-shadow:
        0 5px 14px rgba(0, 0, 0, 0.16),
        0 1px 0 rgba(255, 255, 255, 0.08) inset;
    }

    &:active {
      transform: translateY(1px) scale(0.99);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
    }
  }

  button:first-child {
    color: #fff;
    border-color: transparent;
    background: var(--color-primary, #3f6df6);
    box-shadow: 0 5px 16px rgba(63, 109, 246, 0.28);

    &:hover {
      border-color: transparent;
      box-shadow: 0 7px 18px rgba(63, 109, 246, 0.34);
    }
  }

  button:last-child {
    border-color: rgba(255, 255, 255, 0.34);
    background: rgba(255, 255, 255, 0.16);
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

  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 9px 0;
    border-bottom: 1px solid rgba(128, 128, 128, 0.12);

    &:last-child {
      border-bottom: 0;
    }

    strong {
      font-size: 13px;
      line-height: 1.4;
      font-weight: 700;
    }

    span {
      font-size: 11.5px;
      line-height: 1.55;
      opacity: 0.66;
    }
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
    bottom: 78px;
  }

  .heart-mode-panel {
    width: min(340px, calc(100vw - 28px));
    max-height: 64vh;
  }
}
</style>
