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
        <header class="panel-header">
          <button
            v-if="panelPage !== 'main'"
            class="back-button"
            :title="texts.back"
            @click="panelPage = 'main'"
          >
            ←
          </button>
          <div class="panel-heading">
            <strong>{{ panelTitle }}</strong>
            <span>{{ panelSubtitle }}</span>
          </div>
          <button class="close" :title="texts.close" @click="panelOpen = false">×</button>
        </header>

        <template v-if="panelPage === 'main'">
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
            <div v-else class="muted">
              {{ customAlgorithmEnabled ? texts.noSnapshot : texts.basicModeReason }}
            </div>
          </div>

          <div class="actions">
            <button
              class="heart-action-button"
              :disabled="!customAlgorithmEnabled || !session"
              @click="moreLikeThis"
            >
              <span class="heart-action-icon" aria-hidden="true">＋</span>
              <span>{{ texts.moreLikeThis }}</span>
            </button>
            <button
              class="heart-action-button"
              :disabled="!customAlgorithmEnabled || !session"
              @click="goFurther"
            >
              <span class="heart-action-icon" aria-hidden="true">↗</span>
              <span>{{ texts.goFurther }}</span>
            </button>
          </div>

          <div v-if="customAlgorithmEnabled && session" class="section session-section">
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

          <div class="panel-navigation">
            <button class="nav-card" @click="panelPage = 'settings'">
              <span class="nav-card-icon" aria-hidden="true">⚙</span>
              <span>
                <strong>{{ texts.profileSettings }}</strong>
                <small>{{ texts.profileSettingsHint }}</small>
              </span>
              <b aria-hidden="true">›</b>
            </button>
            <button class="nav-card" @click="panelPage = 'guide'">
              <span class="nav-card-icon" aria-hidden="true">?</span>
              <span>
                <strong>{{ texts.guideTitle }}</strong>
                <small>{{ texts.guideHint }}</small>
              </span>
              <b aria-hidden="true">›</b>
            </button>
          </div>

          <div class="reset-zone">
            <button class="heart-action-button reset-button" @click="resetLearning">
              <span class="heart-action-icon" aria-hidden="true">↺</span>
              <span>{{ texts.reset }}</span>
            </button>
            <span>{{ texts.resetHint }}</span>
          </div>
        </template>

        <template v-else-if="panelPage === 'settings'">
          <div class="subpage-content">
            <div class="settings-card">
              <div class="algorithm-toggle-row">
                <div>
                  <strong>{{ texts.algorithmEnabled }}</strong>
                  <small>{{
                    customAlgorithmEnabled ? texts.algorithmOnHint : texts.algorithmOffHint
                  }}</small>
                </div>
                <label class="mini-toggle">
                  <input v-model="customAlgorithmEnabled" type="checkbox" />
                  <span></span>
                </label>
              </div>
            </div>

            <div class="settings-card">
              <label class="profile-field">
                <span>{{ texts.profileMode }}</span>
                <select v-model="selectedProfileMode">
                  <option
                    v-for="option in profileModeOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </label>

              <div class="profile-description">
                <strong>{{ currentProfileModeLabel }}</strong>
                <p>{{ currentProfileModeDescription }}</p>
                <div class="profile-summary">
                  <span>{{ texts.noveltyShort }} {{ heartModeProfile.novelty }}</span>
                  <span>{{ texts.diversityShort }} {{ heartModeProfile.diversity }}</span>
                  <span>{{ texts.familiarityShort }} {{ heartModeProfile.familiarity }}</span>
                  <span>{{ texts.seedShort }} {{ heartModeProfile.seedCount }}</span>
                </div>
              </div>

              <div v-if="!customAlgorithmEnabled" class="settings-disabled-note">
                {{ texts.profileDisabledHint }}
              </div>

              <div v-if="heartModeProfile.mode === 'custom'" class="profile-custom">
                <label
                  v-for="control in profileCoreControls"
                  :key="control.key"
                  class="profile-slider"
                >
                  <div>
                    <span>{{ control.label }}</span>
                    <strong>{{ control.value }}</strong>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    :value="control.value"
                    @input="updateProfileCore(control.key, $event)"
                  />
                </label>

                <details class="profile-advanced">
                  <summary>{{ texts.advanced }}</summary>
                  <div class="profile-advanced-grid">
                    <label>
                      <span>{{ texts.seedCount }}</span>
                      <input
                        type="number"
                        min="1"
                        max="8"
                        step="1"
                        :value="heartModeProfile.seedCount"
                        @change="updateProfileAdvanced('seedCount', $event)"
                      />
                    </label>
                    <label>
                      <span>{{ texts.shortCooldown }}</span>
                      <input
                        type="number"
                        min="1"
                        max="168"
                        step="1"
                        :value="heartModeProfile.shortCooldownHours"
                        @change="updateProfileAdvanced('shortCooldownHours', $event)"
                      />
                    </label>
                    <label>
                      <span>{{ texts.mediumCooldown }}</span>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        step="1"
                        :value="heartModeProfile.mediumCooldownDays"
                        @change="updateProfileAdvanced('mediumCooldownDays', $event)"
                      />
                    </label>
                    <label>
                      <span>{{ texts.longCooldown }}</span>
                      <input
                        type="number"
                        min="7"
                        max="365"
                        step="1"
                        :value="heartModeProfile.longCooldownDays"
                        @change="updateProfileAdvanced('longCooldownDays', $event)"
                      />
                    </label>
                    <label>
                      <span>{{ texts.sameArtistDistance }}</span>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="1"
                        :value="heartModeProfile.maxSameArtistDistance"
                        @change="updateProfileAdvanced('maxSameArtistDistance', $event)"
                      />
                    </label>
                    <label>
                      <span>{{ texts.sameSeedDistance }}</span>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="1"
                        :value="heartModeProfile.maxSameSeedDistance"
                        @change="updateProfileAdvanced('maxSameSeedDistance', $event)"
                      />
                    </label>
                  </div>
                </details>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="subpage-content guide-page">
            <div v-for="item in strategyItems" :key="item.title" class="guide-group">
              <strong>{{ item.title }}</strong>
              <ul>
                <li v-for="bullet in item.bullets" :key="bullet">{{ bullet }}</li>
              </ul>
            </div>
            <div class="strategy-note">{{ texts.strategyNote }}</div>
          </div>
        </template>
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
import {
  applyHeartModePreset,
  heartModeCustomAlgorithmEnabled,
  heartModeProfile,
  setHeartModeCustomAlgorithmEnabled,
  updateHeartModeProfile,
  type HeartModeMode
} from '../utils/heartModeProfile'

const TEXTS = {
  zh: {
    title: '当前心动模式',
    subtitle: '推荐解释与本轮控制',
    close: '关闭',
    dragHint: '点击打开；拖动可移动位置',
    profileSettings: '心动模式设置',
    profileSettingsHint: '算法开关、风格和自定义参数',
    guideTitle: '操作说明',
    guideHint: '评分、播放反馈和快捷操作规则',
    back: '返回',
    settingsPageSubtitle: '调整长期心动模式配置',
    guidePageSubtitle: '了解哪些行为会改变后续推荐',
    modeContinuousDesc: '更强调熟悉和连贯，分支少、重复容忍更高，适合长时间顺听。',
    modeBalancedDesc: '在熟悉歌曲与新发现之间保持中间状态，适合作为稳妥的日常模式。',
    modeDiverseDesc: '明显增加风格跨度并减少熟歌比例，适合想听到更多不同方向时使用。',
    modeExploreDesc: '最大化新鲜和跳脱，重复容忍最低，适合主动发现陌生歌曲和风格。',
    modeCustomDesc: '完全按下面的参数控制推荐倾向，适合你自己精细调节。',
    noveltyShort: '新鲜',
    diversityShort: '跳脱',
    familiarityShort: '熟悉',
    seedShort: '分支',
    profileDisabledHint:
      '自定义算法当前关闭：这些风格参数会保留，但下一次基础网易云心动模式不会使用它们。',
    algorithmEnabled: '使用自定义心动算法',
    algorithmOnHint: '已启用：多 Seed、个性化评分、反馈学习和滚动补歌。',
    algorithmOffHint: '已关闭：下次启动将使用网易云单 Seed 原始推荐顺序。',
    profileMode: '心动模式风格',
    modeContinuous: '连续',
    modeBalanced: '平衡',
    modeDiverse: '跳脱',
    modeExplore: '探索',
    modeCustom: '自定义',
    diversityLabel: '风格跳脱度',
    noveltyLabel: '新鲜度',
    familiarityLabel: '熟悉感',
    repeatToleranceLabel: '重复容忍度',
    advanced: '高级参数',
    seedCount: '兴趣分支数',
    shortCooldown: '短期强冷却（小时）',
    mediumCooldown: '中期冷却（天）',
    longCooldown: '长期衰减（天）',
    sameArtistDistance: '同艺人最小间隔',
    sameSeedDistance: '同分支最小间隔',
    basicModeReason: '当前使用基础网易云心动模式，不运行自定义评分，因此没有推荐解释快照。',
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
    strategySwitchTitle: '算法开关',
    strategySwitchBullets: [
      '开启：使用多 Seed、个性化评分、反馈学习、多样性重排和滚动补歌。',
      '关闭：下一次启动改用网易云单 Seed 原始推荐顺序；当前队列不会被强制替换。'
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
    profileSettings: '心動模式設定',
    profileSettingsHint: '演算法開關、風格和自訂參數',
    guideTitle: '操作說明',
    guideHint: '評分、播放回饋和快捷操作規則',
    back: '返回',
    settingsPageSubtitle: '調整長期心動模式設定',
    guidePageSubtitle: '了解哪些行為會改變後續推薦',
    modeContinuousDesc: '更強調熟悉和連貫，分支少、重複容忍較高，適合長時間順聽。',
    modeBalancedDesc: '在熟悉歌曲與新發現之間保持中間狀態，適合作為穩妥的日常模式。',
    modeDiverseDesc: '明顯增加風格跨度並降低熟歌比例，適合想聽到更多不同方向時使用。',
    modeExploreDesc: '最大化新鮮和跳脫，重複容忍最低，適合主動發現陌生歌曲和風格。',
    modeCustomDesc: '完全依下面的參數控制推薦傾向，適合自行精細調整。',
    noveltyShort: '新鮮',
    diversityShort: '跳脫',
    familiarityShort: '熟悉',
    seedShort: '分支',
    profileDisabledHint:
      '自訂演算法目前關閉：這些風格參數會保留，但下一次基礎網易雲心動模式不會使用它們。',
    algorithmEnabled: '使用自訂心動演算法',
    algorithmOnHint: '已啟用：多 Seed、個人化評分、回饋學習和滾動補歌。',
    algorithmOffHint: '已關閉：下次啟動將使用網易雲單 Seed 原始推薦順序。',
    profileMode: '心動模式風格',
    modeContinuous: '連續',
    modeBalanced: '平衡',
    modeDiverse: '跳脫',
    modeExplore: '探索',
    modeCustom: '自訂',
    diversityLabel: '風格跳脫度',
    noveltyLabel: '新鮮度',
    familiarityLabel: '熟悉感',
    repeatToleranceLabel: '重複容忍度',
    advanced: '進階參數',
    seedCount: '興趣分支數',
    shortCooldown: '短期強冷卻（小時）',
    mediumCooldown: '中期冷卻（天）',
    longCooldown: '長期衰減（天）',
    sameArtistDistance: '同藝人最小間隔',
    sameSeedDistance: '同分支最小間隔',
    basicModeReason: '目前使用基礎網易雲心動模式，不執行自訂評分，因此沒有推薦解釋快照。',
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
    strategySwitchTitle: '演算法開關',
    strategySwitchBullets: [
      '開啟：使用多 Seed、個人化評分、回饋學習、多樣性重排和滾動補歌。',
      '關閉：下一次啟動改用網易雲單 Seed 原始推薦順序；目前佇列不會被強制替換。'
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
    profileSettings: 'Heart Mode settings',
    profileSettingsHint: 'Algorithm switch, style, and custom parameters',
    guideTitle: 'How it works',
    guideHint: 'Scoring, playback feedback, and quick-control rules',
    back: 'Back',
    settingsPageSubtitle: 'Adjust long-term Heart Mode preferences',
    guidePageSubtitle: 'See which actions change future recommendations',
    modeContinuousDesc:
      'Prioritizes familiarity and continuity with fewer branches and higher repeat tolerance; good for long listening sessions.',
    modeBalancedDesc:
      'Keeps a middle ground between familiar tracks and discovery; a stable everyday default.',
    modeDiverseDesc:
      'Increases stylistic range and reduces familiar-track share; useful when you want more variety.',
    modeExploreDesc:
      'Maximizes novelty and stylistic distance with very low repeat tolerance; best for active discovery.',
    modeCustomDesc:
      'Uses the controls below directly, for precise manual tuning of recommendation behavior.',
    noveltyShort: 'Novel',
    diversityShort: 'Diverse',
    familiarityShort: 'Familiar',
    seedShort: 'Seeds',
    profileDisabledHint:
      'The custom algorithm is off. These style settings stay saved, but the next basic NetEase Heart Mode run will not use them.',
    algorithmEnabled: 'Use custom Heart Mode algorithm',
    algorithmOnHint: 'Enabled: multi-seed scoring, feedback learning, and rolling refills.',
    algorithmOffHint:
      'Disabled: the next start will keep NetEase single-seed recommendation order.',
    profileMode: 'Heart Mode style',
    modeContinuous: 'Continuous',
    modeBalanced: 'Balanced',
    modeDiverse: 'Diverse',
    modeExplore: 'Explore',
    modeCustom: 'Custom',
    diversityLabel: 'Style diversity',
    noveltyLabel: 'Novelty',
    familiarityLabel: 'Familiarity',
    repeatToleranceLabel: 'Repeat tolerance',
    advanced: 'Advanced parameters',
    seedCount: 'Interest branches',
    shortCooldown: 'Strong cooldown (hours)',
    mediumCooldown: 'Medium cooldown (days)',
    longCooldown: 'Long decay (days)',
    sameArtistDistance: 'Same-artist minimum spacing',
    sameSeedDistance: 'Same-branch minimum spacing',
    basicModeReason:
      'Basic NetEase Heart Mode is active. Custom scoring is disabled, so no recommendation explanation snapshot is generated.',
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
    strategySwitchTitle: 'Algorithm switch',
    strategySwitchBullets: [
      'On: use multi-seed personalized scoring, feedback learning, diversity reranking, and rolling refills.',
      'Off: the next start uses NetEase single-seed order; the current queue is not force-replaced.'
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

type HeartModeCoreField = 'diversity' | 'novelty' | 'familiarity' | 'repeatTolerance'
type HeartModeAdvancedField =
  | 'seedCount'
  | 'shortCooldownHours'
  | 'mediumCooldownDays'
  | 'longCooldownDays'
  | 'maxSameArtistDistance'
  | 'maxSameSeedDistance'

const customAlgorithmEnabled = computed({
  get: () => heartModeCustomAlgorithmEnabled.value,
  set: (value: boolean) => setHeartModeCustomAlgorithmEnabled(value)
})

const selectedProfileMode = computed<HeartModeMode>({
  get: () => heartModeProfile.value.mode,
  set: (value) => applyHeartModePreset(value)
})

const profileModeOptions = computed(() => [
  { value: 'continuous' as const, label: texts.value.modeContinuous },
  { value: 'balanced' as const, label: texts.value.modeBalanced },
  { value: 'diverse' as const, label: texts.value.modeDiverse },
  { value: 'explore' as const, label: texts.value.modeExplore },
  { value: 'custom' as const, label: texts.value.modeCustom }
])

const profileCoreControls = computed<
  Array<{ key: HeartModeCoreField; label: string; value: number }>
>(() => [
  {
    key: 'diversity',
    label: texts.value.diversityLabel,
    value: heartModeProfile.value.diversity
  },
  {
    key: 'novelty',
    label: texts.value.noveltyLabel,
    value: heartModeProfile.value.novelty
  },
  {
    key: 'familiarity',
    label: texts.value.familiarityLabel,
    value: heartModeProfile.value.familiarity
  },
  {
    key: 'repeatTolerance',
    label: texts.value.repeatToleranceLabel,
    value: heartModeProfile.value.repeatTolerance
  }
])

const updateProfileCore = (field: HeartModeCoreField, event: Event) => {
  const value = Number((event.target as HTMLInputElement).value)
  updateHeartModeProfile({ mode: 'custom', [field]: value })
}

const updateProfileAdvanced = (field: HeartModeAdvancedField, event: Event) => {
  const value = Number((event.target as HTMLInputElement).value)
  updateHeartModeProfile({ mode: 'custom', [field]: value })
}

type HeartModePanelPage = 'main' | 'settings' | 'guide'

const panelOpen = ref(false)
const panelPage = ref<HeartModePanelPage>('main')
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

const panelTitle = computed(() => {
  if (panelPage.value === 'settings') return texts.value.profileSettings
  if (panelPage.value === 'guide') return texts.value.guideTitle
  return texts.value.title
})

const panelSubtitle = computed(() => {
  if (panelPage.value === 'settings') return texts.value.settingsPageSubtitle
  if (panelPage.value === 'guide') return texts.value.guidePageSubtitle
  return texts.value.subtitle
})

const currentProfileModeLabel = computed(
  () =>
    profileModeOptions.value.find((option) => option.value === heartModeProfile.value.mode)
      ?.label ?? texts.value.modeCustom
)

const currentProfileModeDescription = computed(() => {
  switch (heartModeProfile.value.mode) {
    case 'continuous':
      return texts.value.modeContinuousDesc
    case 'balanced':
      return texts.value.modeBalancedDesc
    case 'diverse':
      return texts.value.modeDiverseDesc
    case 'explore':
      return texts.value.modeExploreDesc
    default:
      return texts.value.modeCustomDesc
  }
})

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
  { title: texts.value.strategySwitchTitle, bullets: texts.value.strategySwitchBullets },
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
  if (panelOpen.value) panelPage.value = 'main'
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
  if (!customAlgorithmEnabled.value) return
  const trackId = Number(currentTrack.value?.id)
  if (!Number.isFinite(trackId) || trackId <= 0) return
  const updated = boostHeartModeCurrentBranch(trackId)
  if (!updated) return
  stateStore.showToast(texts.value.boosted)
  refreshSession()
}

const goFurther = () => {
  if (!customAlgorithmEnabled.value) return
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
  width: min(380px, calc(100vw - 32px));
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

  .panel-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: flex-start;
    gap: 9px;
  }
}

.panel-heading {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;

  strong {
    font-size: 16px;
  }

  span {
    font-size: 12px;
    line-height: 1.4;
    opacity: 0.56;
  }
}

.back-button,
.close {
  min-width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid rgba(128, 128, 128, 0.18);
  border-radius: 8px;
  background: var(--color-secondary-bg-for-transparent);
  color: inherit;
  cursor: pointer;
  font: inherit;
  line-height: 1;
  transition:
    background 0.12s ease,
    border-color 0.12s ease;

  &:hover {
    border-color: rgba(128, 128, 128, 0.38);
    background: color-mix(
      in srgb,
      var(--color-primary) 8%,
      var(--color-secondary-bg-for-transparent)
    );
  }
}

.back-button {
  font-size: 17px;
}

.close {
  font-size: 20px;
  opacity: 0.72;
}

.profile-card {
  margin-top: 14px;
  border: 1px solid rgba(128, 128, 128, 0.24);
  border-radius: 11px;
  background: var(--color-secondary-bg-for-transparent);
  overflow: hidden;

  > summary {
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
      font-size: 13px;
      font-weight: 700;
    }

    small {
      font-size: 10.5px;
      opacity: 0.56;
    }
  }

  &[open] > summary {
    border-bottom: 1px solid rgba(128, 128, 128, 0.16);
  }
}

.profile-content {
  padding: 11px 12px 12px;
}

.algorithm-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 11px;

  > div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  strong {
    font-size: 12px;
  }

  small {
    font-size: 10px;
    line-height: 1.4;
    opacity: 0.56;
  }
}

.mini-toggle {
  position: relative;
  flex: 0 0 42px;
  width: 42px;
  height: 24px;
  cursor: pointer;

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  span {
    position: absolute;
    inset: 0;
    border: 1px solid rgba(128, 128, 128, 0.28);
    border-radius: 999px;
    background: rgba(128, 128, 128, 0.22);
    transition: 0.16s ease;

    &::after {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
      content: '';
      transition: transform 0.16s ease;
    }
  }

  input:checked + span {
    border-color: var(--color-primary);
    background: var(--color-primary);

    &::after {
      transform: translateX(18px);
    }
  }

  input:focus-visible + span {
    outline: 2px solid color-mix(in srgb, var(--color-primary) 55%, transparent);
    outline-offset: 2px;
  }
}

.profile-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  > span {
    font-size: 11.5px;
    font-weight: 650;
  }

  select {
    min-width: 120px;
    min-height: 34px;
    padding: 0 30px 0 10px;
    border: 1px solid rgba(128, 128, 128, 0.28);
    border-radius: 8px;
    color: var(--color-text);
    background: var(--color-body-bg);
    font: inherit;
    cursor: pointer;
  }
}

.profile-custom {
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px solid rgba(128, 128, 128, 0.14);
}

.profile-slider {
  display: block;
  margin-bottom: 9px;

  > div {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
    font-size: 10.5px;
  }

  input[type='range'] {
    width: 100%;
    accent-color: var(--color-primary);
    cursor: pointer;
  }
}

.profile-advanced {
  margin-top: 10px;

  > summary {
    cursor: pointer;
    font-size: 11px;
    font-weight: 650;
    opacity: 0.74;
  }
}

.profile-advanced-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 9px;

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;

    span {
      font-size: 9.5px;
      line-height: 1.3;
      opacity: 0.62;
    }

    input {
      min-width: 0;
      height: 30px;
      box-sizing: border-box;
      padding: 0 7px;
      border: 1px solid rgba(128, 128, 128, 0.26);
      border-radius: 7px;
      color: var(--color-text);
      background: var(--color-body-bg);
      font: inherit;
    }
  }
}

.subpage-content {
  margin-top: 14px;
}

.settings-card {
  padding: 12px;
  border: 1px solid rgba(128, 128, 128, 0.22);
  border-radius: 11px;
  background: var(--color-secondary-bg-for-transparent);

  & + & {
    margin-top: 10px;
  }
}

.profile-description {
  margin-top: 11px;
  padding: 10px;
  border-radius: 9px;
  background: color-mix(
    in srgb,
    var(--color-primary) 7%,
    var(--color-secondary-bg-for-transparent)
  );

  > strong {
    display: block;
    margin-bottom: 4px;
    font-size: 12.5px;
  }

  p {
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    opacity: 0.68;
  }
}

.profile-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;

  span {
    padding: 3px 7px;
    border: 1px solid rgba(128, 128, 128, 0.18);
    border-radius: 999px;
    background: var(--color-body-bg);
    font-size: 9.5px;
    opacity: 0.72;
  }
}

.settings-disabled-note {
  margin-top: 9px;
  padding: 8px 9px;
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.1);
  font-size: 10.5px;
  line-height: 1.45;
  opacity: 0.68;
}

.panel-navigation {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.nav-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 50px;
  padding: 9px 11px;
  border: 1px solid rgba(128, 128, 128, 0.24);
  border-radius: 10px;
  color: var(--color-text);
  background: var(--color-secondary-bg-for-transparent);
  cursor: pointer;
  text-align: left;
  font: inherit;
  transition:
    transform 0.12s ease,
    border-color 0.12s ease,
    background 0.12s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--color-primary) 48%, transparent);
    background: color-mix(
      in srgb,
      var(--color-primary) 8%,
      var(--color-secondary-bg-for-transparent)
    );
  }

  > span:nth-child(2) {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;

    strong {
      font-size: 12px;
    }

    small {
      font-size: 10px;
      line-height: 1.35;
      opacity: 0.52;
    }
  }

  b {
    font-size: 20px;
    font-weight: 400;
    opacity: 0.42;
  }
}

.nav-card-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  font-size: 13px;
  font-weight: 800;
}

.guide-page {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.guide-group {
  padding: 11px 12px;
  border: 1px solid rgba(128, 128, 128, 0.18);
  border-radius: 10px;
  background: var(--color-secondary-bg-for-transparent);

  > strong {
    display: block;
    margin-bottom: 6px;
    font-size: 13px;
  }

  ul {
    margin: 0;
    padding-left: 18px;
  }

  li {
    margin: 4px 0;
    font-size: 11.5px;
    line-height: 1.48;
    opacity: 0.72;
  }
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
  gap: 10px;
  margin-top: 13px;
}

.heart-action-button {
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 78%, #ffffff 22%);
  border-radius: 10px;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  color: #fff;
  background: var(--color-primary);
  box-shadow:
    0 5px 14px color-mix(in srgb, var(--color-primary) 32%, transparent),
    0 1px 0 rgba(255, 255, 255, 0.2) inset,
    0 -1px 0 rgba(0, 0, 0, 0.1) inset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  user-select: none;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease,
    filter 0.12s ease,
    border-color 0.12s ease;

  &:hover {
    transform: translateY(-1px);
    filter: brightness(1.08);
    border-color: color-mix(in srgb, var(--color-primary) 58%, #ffffff 42%);
    box-shadow:
      0 7px 18px color-mix(in srgb, var(--color-primary) 38%, transparent),
      0 1px 0 rgba(255, 255, 255, 0.24) inset,
      0 -1px 0 rgba(0, 0, 0, 0.12) inset;
  }

  &:active {
    transform: translateY(1px) scale(0.985);
    filter: brightness(0.96);
    box-shadow:
      0 2px 7px color-mix(in srgb, var(--color-primary) 24%, transparent),
      0 1px 2px rgba(0, 0, 0, 0.14) inset;
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--color-primary) 65%, #ffffff 35%);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    filter: grayscale(0.35);
    opacity: 0.42;
    transform: none;
    box-shadow: none;
  }
}

.heart-action-icon {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 18px;
  background: rgba(255, 255, 255, 0.18);
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
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
  min-height: 36px;
  padding: 0 12px;
  border-color: rgba(128, 128, 128, 0.42);
  color: var(--color-text);
  background: var(--color-secondary-bg-for-transparent);
  box-shadow:
    0 3px 9px rgba(0, 0, 0, 0.12),
    0 1px 0 rgba(255, 255, 255, 0.08) inset;

  .heart-action-icon {
    background: rgba(128, 128, 128, 0.18);
  }

  &:hover {
    border-color: color-mix(in srgb, var(--color-primary) 62%, transparent);
    background: color-mix(
      in srgb,
      var(--color-primary) 12%,
      var(--color-secondary-bg-for-transparent)
    );
    box-shadow: 0 5px 12px rgba(0, 0, 0, 0.15);
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
    width: min(360px, calc(100vw - 28px));
    max-height: 64vh;
  }
}
</style>
