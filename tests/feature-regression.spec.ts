import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isPointInsideRectangle } from '../src/main/osdHitRegion'
import {
  shouldResetPlaybackPosition,
  type PlaybackStartReason
} from '../src/renderer/utils/playbackStartGuard'
import { normalizeTrackLyricOffset } from '../src/renderer/utils/trackLyricOffset'

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf-8')

test.describe('playback start policy', () => {
  const resetCases: Array<{
    previous: number | null
    next: number
    reason: PlaybackStartReason
    expected: boolean
  }> = [
    { previous: 1, next: 2, reason: 'manual-playlist', expected: true },
    { previous: 1, next: 1, reason: 'heart-mode', expected: true },
    { previous: 1, next: 2, reason: 'previous', expected: true },
    { previous: 1, next: 2, reason: 'next', expected: true },
    { previous: 1, next: 2, reason: 'session-restore', expected: false },
    { previous: 1, next: 1, reason: 'automatic-track-change', expected: false }
  ]

  for (const item of resetCases) {
    test(`${item.reason}: ${item.previous} -> ${item.next}`, () => {
      expect(shouldResetPlaybackPosition(item.previous, item.next, item.reason)).toBe(item.expected)
    })
  }

  test('does not clamp legitimate first-playback progress while media buffers', () => {
    const guard = readSource('src/renderer/utils/playbackStartGuard.ts')
    const player = readSource('src/renderer/store/player.ts')

    expect(guard).not.toContain('() => Number(playerStore.seek)')
    expect(guard).not.toContain('requestAnimationFrame(resetToTrackStart)')
    expect(guard).not.toContain('[0, 50, 180, 500, 1200, 2500]')
    expect(player).not.toContain('seek.value = playing.value ? 0 : progress.value')
    expect(player).toContain('const resumePosition =')
    expect(player).toContain('seek.value = resumePosition')
  })
})

test.describe('track lyric timing', () => {
  test('rounds to one decimal place and clamps to the supported range', () => {
    expect(normalizeTrackLyricOffset(1.26)).toBe(1.3)
    expect(normalizeTrackLyricOffset(-1.24)).toBe(-1.2)
    expect(normalizeTrackLyricOffset(99)).toBe(30)
    expect(normalizeTrackLyricOffset(-99)).toBe(-30)
    expect(normalizeTrackLyricOffset(Number.NaN)).toBe(0)
  })

  test('keeps offset controls responsive instead of squeezing five numeric controls', () => {
    const modal = readSource('src/renderer/components/ModalTrackLyricOffset.vue')

    expect(modal).toContain('<div class="step-controls">')
    expect(modal).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));')
    expect(modal).not.toContain('minmax(78px, 1.2fr)')
    expect(modal).toContain('font-variant-numeric: tabular-nums;')
    expect(modal).toContain('white-space: nowrap;')
  })
})

test.describe('desktop lyric partial passthrough', () => {
  const region = { x: 100, y: 50, width: 45, height: 35 }

  test('keeps the cover-control region interactive', () => {
    expect(isPointInsideRectangle({ x: 110, y: 60 }, region, 2)).toBe(true)
    expect(isPointInsideRectangle({ x: 98, y: 48 }, region, 2)).toBe(true)
  })

  test('keeps the lyric region outside the interactive hit target', () => {
    expect(isPointInsideRectangle({ x: 200, y: 60 }, region, 2)).toBe(false)
    expect(isPointInsideRectangle({ x: 110, y: 100 }, region, 2)).toBe(false)
  })
})

test.describe('desktop feature integration', () => {
  test('keeps strict CSP while enabling Vue I18n JIT AST compilation', () => {
    const csp = readSource('src/main/security/contentSecurityPolicy.ts')
    const vite = readSource('vite.config.ts')

    expect(csp).toContain('"script-src \'self\'"')
    expect(csp).not.toContain("'unsafe-eval'")
    expect(vite).toContain('__INTLIFY_JIT_COMPILATION__: true')
    expect(vite).toContain('__INTLIFY_DROP_MESSAGE_COMPILER__: false')
  })

  test('includes queue-end sleep actions and preset editing tools', () => {
    const sleepTimer = readSource('src/renderer/utils/sleepTimerSettings.ts')
    const presetDraft = readSource('src/renderer/utils/osdPresetDraftState.ts')
    const presetTransfer = readSource('src/renderer/utils/osdPresetTransferPreview.ts')

    expect(sleepTimer).toContain("'queueEnd'")
    expect(sleepTimer).toContain("SleepTimerAction = 'pause' | 'quit'")
    expect(sleepTimer).toContain('completeSleepTimerAtQueueEnd')
    expect(presetDraft).toContain('未保存修改')
    expect(presetDraft).toContain('撤销本次修改')
    expect(presetTransfer).toContain('vutronmusic-osd-preset')
    expect(presetTransfer).toContain('导出当前')
    expect(presetTransfer).toContain('导入预设')
    expect(presetTransfer).toContain("select.addEventListener('change', showSelectedPresetPreview)")
    expect(presetTransfer).toContain('resolveSelectedSettings(select.value)')
    expect(presetTransfer).toContain(
      'event.key === PRESETS_STORAGE_KEY || event.key === BUILTIN_OVERRIDES_STORAGE_KEY'
    )
    expect(presetTransfer).toContain(
      "button.addEventListener('click', refreshPreviewAfterPresetAction)"
    )
  })

  test('allows context menus to be dismissed without choosing an action', () => {
    const contextMenu = readSource('src/renderer/components/ContextMenu.vue')

    expect(contextMenu).toContain("document.addEventListener('pointerdown'")
    expect(contextMenu).toContain("document.addEventListener('keydown'")
    expect(contextMenu).toContain("event.key !== 'Escape'")
    expect(contextMenu).toContain('const shouldToggleClosed =')
    expect(contextMenu).toContain('if (shouldToggleClosed) return')
  })

  test('keeps speed and pitch presets separated from the fine-adjust sliders', () => {
    const playback = readSource('src/renderer/components/ModalPlayback.vue')
    const pitch = readSource('src/renderer/components/ModalPitch.vue')

    expect(playback).toContain('title="倍速播放"')
    expect(playback).toContain('当前倍速:')
    expect(playback).toContain('class="preset-grid"')
    expect(playback).toContain('playbackRatePresets')
    expect(playback).not.toContain(':marks="marks"')
    expect(pitch).toContain('class="preset-grid"')
    expect(pitch).toContain('pitchPresets')
    expect(pitch).not.toContain(':marks="marks"')
  })

  test('routes Linux update checks through the Electron session network stack', () => {
    const updater = readSource('src/main/checkUpdate.ts')

    expect(updater).toContain(
      "import { BrowserWindow, app, dialog, session, shell } from 'electron'"
    )
    expect(updater).toContain('session.defaultSession.fetch(RELEASE_API_URL')
    expect(updater).not.toContain('await fetch(RELEASE_API_URL')
  })

  test('keeps desktop lyric playback independent from main-window input focus', () => {
    const ipcs = readSource('src/main/IPCs.ts')
    const preload = readSource('src/preload/index.ts')
    const player = readSource('src/renderer/store/player.ts')

    expect(ipcs).toContain("message === 'playOrPauseFromOsd'")
    expect(ipcs).toContain("win.webContents.send('play-from-osd')")
    expect(preload).toContain("'play-from-osd'")
    expect(player).toContain("window.mainApi?.on('play-from-osd'")
    expect(player).toContain("window.mainApi?.on('play', () => {")
  })

  test('restores or raises the main window from desktop lyrics before hiding it', () => {
    const ipcs = readSource('src/main/IPCs.ts')

    expect(ipcs).toContain('const revealMainWindowFromOsd =')
    expect(ipcs).toContain('if (win.isMinimized()) win.restore()')
    expect(ipcs).toContain('win.isMinimized() || !win.isVisible() || !win.isFocused()')
    expect(ipcs).toContain('revealMainWindowFromOsd(win)')
  })

  test('keeps desktop lyric play-pause on exactly one IPC path', () => {
    const constants = readSource('src/main/utils/Constants.ts')
    const ipcs = readSource('src/main/IPCs.ts')

    expect(constants).not.toContain("import '../osdPlaybackBridge'")
    expect(ipcs).toContain("message === 'playOrPauseFromOsd'")
    expect(ipcs).toContain("win.webContents.send('play-from-osd')")
  })

  test('formats release notes as concise bullet points without raw markdown headings', () => {
    const latestVersion = readSource('src/renderer/components/LatestVersion.vue')

    expect(latestVersion).toContain('releaseNoteItems')
    expect(latestVersion).toContain('MAX_RELEASE_NOTE_ITEMS = 8')
    expect(latestVersion).toContain('<li v-for="(item, index) in releaseNoteItems"')
    expect(latestVersion).not.toContain('v-same-html="latestVersion?.updateInfo?.releaseNotes')
  })

  test('uses the rounded settings button style for dynamically mounted controls', () => {
    const shared = readSource('src/renderer/utils/v327FeatureShared.ts')
    const latestVersion = readSource('src/renderer/components/LatestVersion.vue')

    expect(shared).toContain('.vutronmusic-v327-controls button {')
    expect(shared).toContain('border-radius: 10px;')
    expect(shared).toContain('background: var(--color-secondary-bg);')
    expect(latestVersion).toContain('.diagnostic-panel__actions')
    expect(latestVersion).toContain('border-radius: 10px;')
  })

  test('registers diagnostics and playback-history integrations', () => {
    const constants = readSource('src/main/utils/Constants.ts')
    const main = readSource('src/renderer/main.ts')
    const playPage = readSource('src/renderer/views/PlayPage.vue')

    expect(constants).toContain("import '../runtimeDiagnostics'")
    expect(main).toContain('initializePlaybackHistory(playerStore)')
    expect(main).toContain('initializeTrackLyricOffset(playerStore)')
    expect(playPage).toContain('<PlaybackHistoryModal />')
    expect(playPage).toContain('<TrackLyricOffsetModal />')
  })
})
