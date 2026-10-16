/**
 * Shared, presentation-only text for the existing sleep timer.
 * Does not create timers or change timer execution semantics.
 */
import type { SleepTimerMode } from './sleepTimerSettings'
import type { SupportedLanguage } from './v327FeatureShared'

type SleepTimerDisplay = {
  active: boolean
  label: string
  title: string
}

const TEXT = {
  zh: {
    inactive: '定时',
    title: '睡眠定时器',
    remaining: '剩余',
    trackEnd: '本曲后',
    queueEnd: '队列后',
    afterTrack: '当前歌曲播放完后停止',
    afterQueue: '当前队列播放完后停止'
  },
  zht: {
    inactive: '定時',
    title: '睡眠定時器',
    remaining: '剩餘',
    trackEnd: '本曲後',
    queueEnd: '佇列後',
    afterTrack: '目前歌曲播放完後停止',
    afterQueue: '目前佇列播放完後停止'
  },
  en: {
    inactive: 'Timer',
    title: 'Sleep timer',
    remaining: 'Remaining',
    trackEnd: 'Track end',
    queueEnd: 'Queue end',
    afterTrack: 'Stop after current track',
    afterQueue: 'Stop after current queue'
  }
} as const

export const formatSleepTimerDuration = (seconds: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(Number.isFinite(seconds) ? seconds : 0))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60
  const minuteText = String(minutes).padStart(2, '0')
  const secondText = String(remainingSeconds).padStart(2, '0')
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${minuteText}:${secondText}`
    : `${minuteText}:${secondText}`
}

export const getSleepTimerDisplay = (
  mode: SleepTimerMode,
  remainingSeconds: number,
  language: SupportedLanguage
): SleepTimerDisplay => {
  const text = TEXT[language]

  if (mode === 'minutes') {
    const label = formatSleepTimerDuration(remainingSeconds)
    return { active: true, label, title: `${text.title} · ${text.remaining} ${label}` }
  }
  if (mode === 'trackEnd') {
    return { active: true, label: text.trackEnd, title: `${text.title} · ${text.afterTrack}` }
  }
  if (mode === 'queueEnd') {
    return { active: true, label: text.queueEnd, title: `${text.title} · ${text.afterQueue}` }
  }
  return { active: false, label: text.inactive, title: text.title }
}
