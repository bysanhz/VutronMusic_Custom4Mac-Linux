import { usePlayerStore } from '../store/player'
import {
  createV327SettingsItem,
  observeV327SettingsControl,
  resolveFeatureLanguage,
  type JsonRecord
} from './v327FeatureShared'

type SleepTimerMode = 'off' | 'minutes' | 'trackEnd'

type SleepTimerState = {
  mode: SleepTimerMode
  endAt: number
  trackId: number | string | null
  completed: boolean
}

const CONTROL_ID = 'vutronmusic-sleep-timer-setting'
const state: SleepTimerState = {
  mode: 'off',
  endAt: 0,
  trackId: null,
  completed: false
}

let timer: number | null = null

const TEXTS = {
  zh: {
    title: '睡眠定时器',
    description: '到时平滑暂停播放；关闭应用后不会继续计时',
    off: '关闭',
    after15: '15 分钟后',
    after30: '30 分钟后',
    after60: '60 分钟后',
    after90: '90 分钟后',
    trackEnd: '当前歌曲结束后',
    start: '启用',
    cancel: '取消',
    inactive: '未启用',
    countdown: '剩余 {time}',
    waitingTrack: '将在当前歌曲结束后暂停',
    completed: '已按计划暂停播放',
    canceledByTrackChange: '歌曲已切换，本曲结束定时已取消',
    noTrack: '当前没有可播放的歌曲'
  },
  zht: {
    title: '睡眠定時器',
    description: '到時平滑暫停播放；關閉應用程式後不會繼續計時',
    off: '關閉',
    after15: '15 分鐘後',
    after30: '30 分鐘後',
    after60: '60 分鐘後',
    after90: '90 分鐘後',
    trackEnd: '目前歌曲結束後',
    start: '啟用',
    cancel: '取消',
    inactive: '未啟用',
    countdown: '剩餘 {time}',
    waitingTrack: '將在目前歌曲結束後暫停',
    completed: '已依計畫暫停播放',
    canceledByTrackChange: '歌曲已切換，本曲結束定時已取消',
    noTrack: '目前沒有可播放的歌曲'
  },
  en: {
    title: 'Sleep Timer',
    description: 'Pauses playback smoothly when due. Timers do not survive app exit.',
    off: 'Off',
    after15: 'After 15 minutes',
    after30: 'After 30 minutes',
    after60: 'After 60 minutes',
    after90: 'After 90 minutes',
    trackEnd: 'After current track',
    start: 'Start',
    cancel: 'Cancel',
    inactive: 'Inactive',
    countdown: '{time} remaining',
    waitingTrack: 'Playback will pause after the current track',
    completed: 'Playback paused by sleep timer',
    canceledByTrackChange: 'Track changed. End-of-track timer canceled.',
    noTrack: 'No track is currently available.'
  }
} as const

const formatDuration = (seconds: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60
  const minuteText = minutes.toString().padStart(2, '0')
  const secondText = remainingSeconds.toString().padStart(2, '0')

  return hours > 0
    ? `${hours.toString().padStart(2, '0')}:${minuteText}:${secondText}`
    : `${minuteText}:${secondText}`
}

const resolveTrackDuration = (track: JsonRecord): number => {
  const rawDuration = Number(track?.dt ?? track?.duration ?? 0)
  if (!Number.isFinite(rawDuration) || rawDuration <= 0) return 0
  return rawDuration > 10000 ? rawDuration / 1000 : rawDuration
}

const updateStatus = (message?: string): void => {
  const text = TEXTS[resolveFeatureLanguage()]
  let value = message || text.inactive

  if (!message && state.mode === 'minutes') {
    const remaining = Math.max(0, (state.endAt - Date.now()) / 1000)
    value = text.countdown.replace('{time}', formatDuration(remaining))
  } else if (!message && state.mode === 'trackEnd') {
    value = text.waitingTrack
  } else if (!message && state.completed) {
    value = text.completed
  }

  document.querySelectorAll<HTMLElement>('[data-sleep-timer-status]').forEach((element) => {
    element.textContent = value
  })
}

const cancelTimer = (message?: string): void => {
  state.mode = 'off'
  state.endAt = 0
  state.trackId = null
  if (timer !== null) {
    window.clearInterval(timer)
    timer = null
  }
  updateStatus(message)
}

const pausePlayback = async (): Promise<void> => {
  state.completed = true
  const playerStore = usePlayerStore()
  if (playerStore.playing) {
    await playerStore.playOrPause()
  }
  cancelTimer(TEXTS[resolveFeatureLanguage()].completed)
}

const tick = (): void => {
  if (state.mode === 'off') return

  if (state.mode === 'minutes') {
    if (Date.now() >= state.endAt) {
      void pausePlayback()
      return
    }
    updateStatus()
    return
  }

  const track = (window.vutronmusic?.currentTrack || {}) as JsonRecord
  if (track.id !== state.trackId) {
    cancelTimer(TEXTS[resolveFeatureLanguage()].canceledByTrackChange)
    return
  }

  const progress = Number(window.vutronmusic?.progress || 0)
  const duration = resolveTrackDuration(track)
  if (duration > 0 && duration - progress <= 0.8) {
    void pausePlayback()
    return
  }

  updateStatus()
}

const startTimer = (value: string): void => {
  const text = TEXTS[resolveFeatureLanguage()]
  state.completed = false

  if (value === 'trackEnd') {
    const track = (window.vutronmusic?.currentTrack || {}) as JsonRecord
    if (!track.id) {
      updateStatus(text.noTrack)
      return
    }
    state.mode = 'trackEnd'
    state.trackId = track.id
    state.endAt = 0
  } else {
    const minutes = Number(value)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      cancelTimer()
      return
    }
    state.mode = 'minutes'
    state.endAt = Date.now() + minutes * 60 * 1000
    state.trackId = null
  }

  if (timer !== null) window.clearInterval(timer)
  timer = window.setInterval(tick, 250)
  tick()
}

const ensureControl = (): boolean => {
  const anchorItem = (
    document.getElementById('show-song-chorus') ||
    document.getElementById('jump-to-lyric-begin')
  )?.closest<HTMLElement>('.item')
  if (!anchorItem?.parentElement) return false
  if (document.getElementById(CONTROL_ID)) {
    updateStatus()
    return true
  }

  const text = TEXTS[resolveFeatureLanguage()]
  const item = createV327SettingsItem(CONTROL_ID, text.title, text.description)
  const controls = item.querySelector<HTMLElement>('.vutronmusic-v327-controls')!
  const select = document.createElement('select')
  const startButton = document.createElement('button')
  const cancelButton = document.createElement('button')
  const status = document.createElement('div')

  const options = [
    ['off', text.off],
    ['15', text.after15],
    ['30', text.after30],
    ['60', text.after60],
    ['90', text.after90],
    ['trackEnd', text.trackEnd]
  ]
  options.forEach(([value, label]) => {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    select.appendChild(option)
  })

  startButton.textContent = text.start
  cancelButton.textContent = text.cancel
  status.className = 'vutronmusic-v327-status'
  status.dataset.sleepTimerStatus = 'true'

  startButton.addEventListener('click', () => startTimer(select.value))
  cancelButton.addEventListener('click', () => {
    select.value = 'off'
    state.completed = false
    cancelTimer()
  })

  controls.append(select, startButton, cancelButton, status)
  anchorItem.insertAdjacentElement('afterend', item)
  updateStatus()
  return true
}

observeV327SettingsControl(ensureControl)

window.addEventListener(
  'beforeunload',
  () => {
    if (timer !== null) window.clearInterval(timer)
  },
  { once: true }
)
