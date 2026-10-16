import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  formatSleepTimerDuration,
  getSleepTimerDisplay
} from '../src/renderer/utils/sleepTimerDisplay'

const readSource = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('shared sleep-timer button', () => {
  test('rounds remaining duration up to the next whole second', () => {
    expect(formatSleepTimerDuration(59.1)).toBe('01:00')
    expect(formatSleepTimerDuration(59)).toBe('00:59')
    expect(formatSleepTimerDuration(3600)).toBe('01:00:00')
    expect(formatSleepTimerDuration(3661.2)).toBe('01:01:02')
    expect(formatSleepTimerDuration(-1)).toBe('00:00')
    expect(formatSleepTimerDuration(Number.NaN)).toBe('00:00')
  })

  test('does not invent countdowns for track-end and queue-end modes', () => {
    expect(getSleepTimerDisplay('off', 0, 'zh')).toMatchObject({
      active: false,
      label: '定时'
    })
    expect(getSleepTimerDisplay('minutes', 74, 'zh')).toMatchObject({
      active: true,
      label: '01:14'
    })
    expect(getSleepTimerDisplay('trackEnd', 0, 'zh')).toMatchObject({
      active: true,
      label: '本曲后'
    })
    expect(getSleepTimerDisplay('queueEnd', 0, 'zht')).toMatchObject({
      active: true,
      label: '佇列後'
    })
    const queueEndEn = getSleepTimerDisplay('queueEnd', 0, 'en')
    expect(queueEndEn.title).toContain('current queue')
  })

  test('reuses the existing timer state and modal', () => {
    const button = readSource('src/renderer/components/SleepTimerButton.vue')
    expect(button).toContain('sleepTimerRemainingSeconds.value')
    expect(button).toContain('sleepTimerMode.value')
    expect(button).toContain('sleepTimerModalVisible.value = true')
    expect(button).not.toContain('setInterval')
    expect(button).not.toContain('startSleepTimer(')
  })

  test('shows the timer beside playback rate on all player surfaces', () => {
    const common = readSource('src/renderer/components/CommonPlayer.vue')
    const creative = readSource('src/renderer/components/CreativePlayer.vue')
    const bar = readSource('src/renderer/components/PlayerBar.vue')

    const adjacentControls = /<PlaybackSpeedButton\s*\/>\s*<SleepTimerButton\b/
    expect(common).toMatch(adjacentControls)
    expect(creative).toMatch(adjacentControls)
    expect(bar).toMatch(adjacentControls)
    expect(creative).toContain('<SleepTimerButton compact />')
    expect(bar).toContain('<SleepTimerButton compact />')

    const bottomControls = common.split('<div class="media-controls">')[1]
    expect(bottomControls.split('</div>')[0]).not.toContain('<PlaybackSpeedButton')
  })
})
