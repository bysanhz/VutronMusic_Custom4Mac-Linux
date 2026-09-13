<template>
  <div class="daily-recommend-card" @click="goToDailyTracks">
    <img :src="coverUrl" :class="{ paused }" loading="lazy" alt="每日推荐封面" />
    <div class="container">
      <div class="title-box">
        <div class="title" aria-label="每日推荐">
          <span>每</span>
          <span>日</span>
          <span>推</span>
          <span>荐</span>
        </div>
      </div>
    </div>
    <button class="play-button" aria-label="播放每日推荐" @click.stop="playDailyTracks">
      <svg-icon icon-class="play" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onDeactivated, ref, watch } from 'vue'
import SvgIcon from './SvgIcon.vue'
import { useRouter } from 'vue-router'
import { useNormalStateStore } from '../store/state'
import { usePlayerStore } from '../store/player'
import { storeToRefs } from 'pinia'
import { isAccountLoggedIn } from '../utils/auth'
import { dailyRecommendTracks } from '../api/playlist'
import { useI18n } from 'vue-i18n'
import _ from 'lodash'

const defaultCovers = [
  'https://p2.music.126.net/0-Ybpa8FrDfRgKYCTJD8Xg==/109951164796696795.jpg',
  'https://p2.music.126.net/QxJA2mr4hhb9DZyucIOIQw==/109951165422200291.jpg',
  'https://p1.music.126.net/AhYP9TET8l-VSGOpWAKZXw==/109951165134386387.jpg'
]

const stateStore = useNormalStateStore()
const { dailyTracks, showLyrics } = storeToRefs(stateStore)
const { showToast } = stateStore
const { t } = useI18n()

const playerStore = usePlayerStore()
const { _shuffle } = storeToRefs(playerStore)
const { replacePlaylist } = playerStore
const paused = ref(document.visibilityState === 'hidden')

const coverUrl = computed(() => {
  return `${dailyTracks.value[0]?.al.picUrl || _.sample(defaultCovers)}?param=256y256`
})

const router = useRouter()
const goToDailyTracks = () => {
  router.push({ name: 'dailySongs' })
}

const playDailyTracks = () => {
  if (!isAccountLoggedIn()) {
    showToast(t('toast.needToLogin'))
    return
  }
  const trackIDs = dailyTracks.value.map((track) => track.id)
  if (!trackIDs.length) {
    showToast('每日推荐仍在加载，请稍后再试')
    return
  }
  const idx = _shuffle.value ? Math.floor(Math.random() * trackIDs.length) : 0
  replacePlaylist('url', '/daily/songs', trackIDs, idx)
}

const loadDailyTracks = () => {
  if (!isAccountLoggedIn()) return
  dailyRecommendTracks().then((result) => {
    dailyTracks.value = result?.data?.dailySongs ?? []
  })
}

watch(showLyrics, (value) => {
  paused.value = value
})

const handleVisibleChange = () => {
  paused.value = document.visibilityState === 'hidden'
}

document.addEventListener('visibilitychange', handleVisibleChange)

onActivated(() => {
  loadDailyTracks()
})

onDeactivated(() => {
  paused.value = true
})
</script>

<style scoped lang="scss">
.daily-recommend-card {
  border-radius: 1rem;
  height: 198px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  isolation: isolate;
  background: var(--color-secondary-bg);

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background: linear-gradient(
      90deg,
      rgba(8, 10, 16, 0.54) 0%,
      rgba(8, 10, 16, 0.24) 46%,
      rgba(8, 10, 16, 0.05) 72%,
      transparent 100%
    );
  }
}

img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  min-height: 100%;
  object-fit: cover;
  animation: move 38s infinite;
  animation-direction: alternate;
  animation-play-state: running;
  z-index: 0;

  &.paused {
    animation-play-state: paused;
  }
}

.container {
  position: relative;
  z-index: 2;
  height: 198px;
  width: 58%;
  display: flex;
  align-items: center;
  border-radius: 0.94rem;
}

.title-box {
  height: 122px;
  width: 122px;
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-left: 24px;
  padding: 10px;
  box-sizing: border-box;
  border-radius: 22px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(10, 12, 18, 0.36);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(10px) saturate(115%);
  user-select: none;

  .title {
    height: 100%;
    width: 100%;
    font-weight: 760;
    font-size: 38px;
    line-height: 1;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.72);
    display: grid;
    grid-template-columns: 1fr 1fr;
    justify-items: center;
    place-items: center;
  }
}

.play-button {
  position: absolute;
  z-index: 3;
  right: 1.45rem;
  bottom: 1.3rem;
  height: 48px;
  width: 48px;
  margin: 0;
  padding: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.38);
  color: white;
  background: rgba(8, 10, 16, 0.58);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(12px) saturate(120%);
  transition:
    transform 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
  cursor: pointer;

  .svg-icon {
    margin-left: 3px;
    height: 18px;
    width: 18px;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
  }

  &:hover {
    background: color-mix(in srgb, var(--color-primary) 78%, rgba(8, 10, 16, 0.58));
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.32);
    transform: scale(1.06);
  }

  &:active {
    transform: scale(0.94);
  }
}

@keyframes move {
  0% {
    transform: translateY(0);
  }
  100% {
    transform: translateY(-50%);
  }
}
</style>
