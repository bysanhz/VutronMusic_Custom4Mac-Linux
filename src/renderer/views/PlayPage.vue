<template>
  <div :data-theme="theme">
    <transition name="slide-up">
      <div
        v-if="showLyrics"
        class="player-container"
        @mouseenter="hover = true"
        @mouseleave="hover = false"
      >
        <BackgroundPage />
        <div
          class="buttons-icons"
          :class="{ opacity: activeTheme.theme.activeLayout === 'Creative', hover }"
        >
          <button-icon
            v-show="tabs[tabIdx] !== 'comment'"
            :title="$t('player.playerTheme')"
            class="player-button theme-button"
            @click="setThemeModal = !setThemeModal"
          >
            <SvgIcon icon-class="theme" />
          </button-icon>
          <button-icon
            :title="$t('player.collapsePlayer')"
            class="player-button close-button"
            @click="showLyrics = !showLyrics"
          >
            <SvgIcon icon-class="arrow-down" />
          </button-icon>
          <button-icon
            :title="$t('player.resetPlayerTheme')"
            class="player-button reset-button"
            @click="resetTheme"
          >
            <SvgIcon icon-class="reset-theme" />
          </button-icon>
          <button-icon
            :title="$t('player.switchScene')"
            class="player-button sense-button"
            @click="showSenseSelector = true"
          >
            <SvgIcon icon-class="sense" />
          </button-icon>
          <button-icon
            v-show="tabs.length > 1"
            class="player-button lyric-button-1"
            :title="nextTabTitle"
            @click="switchCurrentTab"
          >
            <SvgIcon :icon-class="getIcon()" />
          </button-icon>
        </div>
        <CommonPlayer v-if="activeTheme.theme.activeLayout === 'Classic'" :show="tabs[tabIdx]" />
        <CreativePlayer v-else :show="tabs[tabIdx]" :hover-parent="hover" />
      </div>
    </transition>
    <HeartModeAssistant />
  </div>
  <div>
    <ConvolverModal />
    <PitchModal />
    <PlaybackModal />
    <SleepTimerModal />
    <TrackLyricOffsetModal />
    <PlaybackHistoryModal />
    <PlayerFontModal />
    <PlayerThemeModal />
    <SaveThemeModal />
    <BackgroundModal />
    <SenseSwitch v-model="showSenseSelector" :type="activeTheme.theme.activeLayout" />
    <ContextMenu ref="playPageContextMenu">
      <div
        v-show="activeTheme.theme.activeLayout === 'Creative'"
        class="item"
        @click="addTrackToPlaylist"
        >{{ $t('player.addToPlaylist') }}</div
      >
      <div class="item" @click="setPlaybackRateModal = true">{{
        $t('contextMenu.playBackSpeed')
      }}</div>
      <div class="item" @click="setPitchModal = true">{{ $t('contextMenu.pitch') }}</div>
      <div class="item" @click="setConvolverModal = true">{{ $t('contextMenu.setConvolver') }}</div>
      <div class="item" @click="trackLyricOffsetModalVisible = true">
        {{ toolMenuText.trackLyricOffset }}
      </div>
      <div class="item" @click="playbackHistoryModalVisible = true">
        {{ toolMenuText.playbackHistory }}
      </div>
      <div class="item sleep-timer-menu-item" @click="sleepTimerModalVisible = true">
        <span>{{ sleepTimerMenuText.title }}</span>
        <span v-if="sleepTimerActive" class="sleep-timer-active-label">{{
          sleepTimerMenuStatus
        }}</span>
      </div>
      <hr />
      <div class="item" @click="backgroundModal.show = true">背景设置</div>
      <div class="item" @click="setFontModal = true">歌词设置</div>
      <div class="item" @click="setSaveThemeModal = true">保存播放器主题</div>
    </ContextMenu>
  </div>
</template>

<script setup lang="ts">
import ContextMenu from '../components/ContextMenu.vue'
import ConvolverModal from '../components/ModalConvolver.vue'
import PlaybackModal from '../components/ModalPlayback.vue'
import PitchModal from '../components/ModalPitch.vue'
import SleepTimerModal from '../components/ModalSleepTimer.vue'
import TrackLyricOffsetModal from '../components/ModalTrackLyricOffset.vue'
import PlaybackHistoryModal from '../components/ModalPlaybackHistory.vue'
import PlayerThemeModal from '../components/ModalPlayerTheme.vue'
import PlayerFontModal from '../components/ModalPlayerFont.vue'
import SaveThemeModal from '../components/ModalSaveTheme.vue'
import SenseSwitch from '../components/SenseSwitch.vue'
import BackgroundModal from '../components/ModalBackground.vue'
import CommonPlayer from '../components/CommonPlayer.vue'
import CreativePlayer from '../components/CreativePlayer.vue'
import BackgroundPage from '../components/BackgroundPage.vue'
import HeartModeAssistant from '../components/HeartModeAssistant.vue'
import ButtonIcon from '../components/ButtonIcon.vue'
import SvgIcon from '../components/SvgIcon.vue'
import { useNormalStateStore } from '../store/state'
import { usePlayerStore } from '../store/player'
import { usePlayerThemeStore } from '../store/playerTheme'
import {
  sleepTimerActive,
  sleepTimerModalVisible,
  sleepTimerMode,
  sleepTimerRemainingSeconds
} from '../utils/sleepTimerSettings'
import { trackLyricOffsetModalVisible } from '../utils/trackLyricOffset'
import { playbackHistoryModalVisible } from '../utils/playbackHistory'
import { resolveFeatureLanguage } from '../utils/v327FeatureShared'
import { storeToRefs } from 'pinia'
import { ref, provide, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { TrackSourceType } from '@/types/music.d'

const playPageContextMenu = ref<InstanceType<typeof ContextMenu>>()
const { t } = useI18n()

const stateStore = useNormalStateStore()
const {
  showLyrics,
  setThemeModal,
  setConvolverModal,
  setPitchModal,
  setFontModal,
  setPlaybackRateModal,
  backgroundModal,
  setSaveThemeModal,
  addTrackToPlaylistModal
} = storeToRefs(stateStore)

const playerStore = usePlayerStore()
const { currentTrack } = storeToRefs(playerStore)

const playerThemeStore = usePlayerThemeStore()
const { activeTheme, activeBG } = storeToRefs(playerThemeStore)
const { resetTheme } = playerThemeStore

const SLEEP_TIMER_MENU_TEXTS = {
  zh: { title: '睡眠定时器', active: '已启用', remaining: '剩余 {time}' },
  zht: { title: '睡眠定時器', active: '已啟用', remaining: '剩餘 {time}' },
  en: { title: 'Sleep Timer', active: 'Active', remaining: '{time} left' }
} as const

const TOOL_MENU_TEXTS = {
  zh: { trackLyricOffset: '本曲歌词时间校正', playbackHistory: '播放历史与队列' },
  zht: { trackLyricOffset: '本曲歌詞時間校正', playbackHistory: '播放歷史與佇列' },
  en: { trackLyricOffset: 'Track lyric timing', playbackHistory: 'Playback history & queues' }
} as const

const formatSleepTimerDuration = (seconds: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(seconds))
  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
}

const sleepTimerMenuText = computed(() => SLEEP_TIMER_MENU_TEXTS[resolveFeatureLanguage()])
const toolMenuText = computed(() => TOOL_MENU_TEXTS[resolveFeatureLanguage()])
const sleepTimerMenuStatus = computed(() => {
  if (sleepTimerMode.value === 'minutes') {
    return sleepTimerMenuText.value.remaining.replace(
      '{time}',
      formatSleepTimerDuration(sleepTimerRemainingSeconds.value)
    )
  }
  return sleepTimerMenuText.value.active
})

const showSenseSelector = ref(false)
const tabIdx = ref(0)
const titleIdx = ref(0)
const hover = ref(false)

const theme = computed(() => {
  let appearance = activeBG.value.color
  if (appearance === 'auto' || appearance === undefined) {
    appearance = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return appearance
})

const tabs = computed(() => {
  let result: ('fullLyric' | 'pickLyric' | 'comment')[] = []
  if (activeTheme.value.theme.activeLayout === 'Classic') {
    result = ['fullLyric']
  } else {
    result = ['pickLyric', 'fullLyric']
  }
  if (currentTrack.value?.matched) {
    result.push('comment')
  }

  return result
})

const addTrackToPlaylist = () => {
  if (!currentTrack.value) return
  addTrackToPlaylistModal.value = {
    show: true,
    selectedTrackID: [currentTrack.value.id],
    type:
      currentTrack.value.type === 'stream'
        ? (currentTrack.value.source as TrackSourceType)
        : (currentTrack.value.type as TrackSourceType)
  }
}

provide('playPageContextMenu', playPageContextMenu)

const nextTab = computed(() => {
  if (!tabs.value.length) return 'fullLyric'
  return tabs.value[(tabIdx.value + 1) % tabs.value.length]
})

const nextTabTitle = computed(() => {
  if (nextTab.value === 'comment') return t('player.showComments')
  if (tabs.value[tabIdx.value] === 'comment') return t('player.backToLyrics')
  return nextTab.value === 'pickLyric' ? t('player.showFeaturedLyrics') : t('player.showFullLyrics')
})

const switchCurrentTab = () => {
  if (tabs.value.length <= 1) return
  tabIdx.value = (tabIdx.value + 1) % tabs.value.length
}

const getIcon = () => {
  if (nextTab.value === 'comment') return 'comment'
  return nextTab.value === 'pickLyric' ? 'lyric-half' : 'lyric'
}

watch(tabs, (value) => {
  if (!value.length || tabIdx.value >= value.length) tabIdx.value = 0
})

watch(showSenseSelector, () => {
  titleIdx.value = 0
})

watch(
  () => activeTheme.value.theme.activeLayout,
  () => {
    tabIdx.value = 0
    titleIdx.value = 0
  }
)
</script>
<style scoped lang="scss">
.player-container {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 20;
  overflow: hidden;
  color: var(--color-text);
  background-color: var(--bg-color);
}

.buttons-icons {
  width: 100%;
  height: 100%;
  color: var(--color-text);
  opacity: 0;
  transition: opacity 0.3s;

  .theme-button {
    position: fixed;
    top: 24px;
    right: 74px;
  }

  .close-button {
    position: fixed;
    top: 24px;
    right: 24px;
  }

  .sense-button {
    position: fixed;
    bottom: 124px;
    right: 24px;
  }

  .reset-button {
    position: fixed;
    bottom: 190px;
    right: 24px;
  }

  .lyric-button-1 {
    position: fixed;
    bottom: 60px;
    right: 24px;
  }

  .player-button {
    z-index: 300;
    border-radius: 0.75rem;
    height: 44px;
    width: 44px;
    display: flex;
    justify-content: center;
    align-items: center;
    opacity: 0.48;
    transition: 0.2s;
    -webkit-app-region: no-drag;

    .svg-icon {
      color: var(--color-text);
      height: 22px;
      width: 22px;
    }

    &:hover {
      background: var(--color-secondary-bg-for-transparent);
      opacity: 0.88;
    }
  }
}

.buttons-icons.hover {
  opacity: 1;
}

.buttons-icons.opacity {
  .player-button {
    opacity: 0.88;
  }
}

.sleep-timer-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.sleep-timer-active-label {
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 500;
}

.sense-modal {
  position: fixed;
  transition: opacity 0.3s ease-in-out;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1000;
}

.sense-content {
  position: fixed;
  bottom: 0;
  left: 0;
  padding-bottom: 10px;
  width: 100%;
  border-radius: 12px 12px 0 0;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(12px) opacity(1);
  color: var(--color-text);
}

[data-theme='dark'] .sense-content {
  background: rgba(36, 36, 36, 0.88);
}

.sense-title {
  text-align: center;
  font-size: 20px;
  font-weight: 600;
  padding: 20px 0;
  color: color-mix(in srgb, var(--color-text), transparent 40%);

  .active {
    color: var(--color-text);
  }

  &.multi span {
    cursor: pointer;

    &:first-child {
      margin-right: 20px;
      padding-right: 20px;
      border-right: 2px solid color-mix(in srgb, var(--color-text), transparent 40%);
    }
  }
}

.sense-list {
  display: flex;
  justify-content: center;
  height: 200px;
  padding: 0 10px;
  overflow: auto hidden;
  scrollbar-width: none;
}

.sense-item {
  height: 100%;
  margin: 0 10px;
  border-radius: 8px;
  text-align: center;
  position: relative;

  img {
    height: 80%;
    border-radius: 8px;
    padding: 4px;
  }

  .sense-active {
    display: none;
    position: absolute;
    top: 0;
    left: 0;
    font-size: 16px;
    border-radius: 8px 0;
    padding: 4px 10px;
  }

  .ani {
    display: flex;
    height: 100%;
    width: 150px;
    box-sizing: border-box;
    justify-content: center;
    align-items: center;
    border: 2px solid var(--color-primary);
    border-radius: 8px;
    user-select: none;
    cursor: pointer;
  }
}

.sense-item.active {
  .sense-active {
    display: block;
    background-color: var(--color-primary);
    color: white;
  }
  img {
    background-color: var(--color-primary);
  }
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.4s ease-out;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>
