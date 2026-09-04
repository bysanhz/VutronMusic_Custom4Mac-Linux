import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isPointInsideRectangle } from '../src/main/osdHitRegion'
import {
  shouldResetPlaybackPosition,
  type PlaybackStartReason
} from '../src/renderer/utils/playbackStartGuard'
import { normalizeTrackLyricOffset } from '../src/renderer/utils/trackLyricOffset'
import {
  rankHeartModeCandidates,
  selectHeartModeSeedIDs
} from '../src/renderer/utils/heartModeHistory'
import {
  calculateActiveListenIncrement,
  scorePlaybackFeedback,
  type PlaybackFeedback
} from '../src/renderer/utils/playbackFeedback'
import { getHeartModePresetProfile } from '../src/renderer/utils/heartModeProfile'

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

test.describe('heart mode history-aware recommendations', () => {
  test('pushes recent unliked repeats behind fresh and liked candidates', () => {
    const ranked = rankHeartModeCandidates({
      seedTrackID: 1,
      candidateTrackIDs: [10, 11, 12, 13],
      likedTrackIDs: [1, 11],
      recentPlayedTrackIDs: [10, 11],
      recentHeartModeTrackIDs: [12],
      targetCount: 5
    })

    expect(ranked).toEqual([1, 13, 11, 12, 10])
  })

  test('prefers unseen liked tracks when choosing heart-mode seeds', () => {
    const seeds = selectHeartModeSeedIDs([1, 2, 3, 4], [1, 2, 3], 3, () => 0.5)

    expect(seeds[0]).toBe(4)
    expect(new Set(seeds).size).toBe(seeds.length)
    expect(seeds).toHaveLength(3)
  })

  test('counts only real active listening and ignores pause or seek jumps', () => {
    expect(
      calculateActiveListenIncrement({
        playing: true,
        wallDeltaSeconds: 1,
        progressDeltaSeconds: 1,
        playbackRate: 1
      })
    ).toBe(1)
    expect(
      calculateActiveListenIncrement({
        playing: false,
        wallDeltaSeconds: 1,
        progressDeltaSeconds: 1,
        playbackRate: 1
      })
    ).toBe(0)
    expect(
      calculateActiveListenIncrement({
        playing: true,
        wallDeltaSeconds: 1,
        progressDeltaSeconds: 180,
        playbackRate: 1
      })
    ).toBe(0)
    expect(
      calculateActiveListenIncrement({
        playing: true,
        wallDeltaSeconds: 1,
        progressDeltaSeconds: 0,
        playbackRate: 1
      })
    ).toBe(0)
  })

  test('maps listening behavior to preference signals without treating lifecycle events as dislike', () => {
    const makeFeedback = (patch: Partial<PlaybackFeedback>): PlaybackFeedback => ({
      trackId: 1,
      source: 'intelligence',
      durationSeconds: 200,
      activeListenSeconds: 10,
      completionRatio: 0.05,
      endReason: 'manual-next',
      likedAtEnd: false,
      playedAt: Date.now(),
      ...patch
    })

    expect(scorePlaybackFeedback(makeFeedback({}))).toBe(-4)
    expect(scorePlaybackFeedback(makeFeedback({ endReason: 'manual-select' }))).toBe(-4)
    expect(
      scorePlaybackFeedback(
        makeFeedback({ activeListenSeconds: 180, completionRatio: 0.9, endReason: 'manual-next' })
      )
    ).toBe(1)
    expect(
      scorePlaybackFeedback(
        makeFeedback({ activeListenSeconds: 200, completionRatio: 1, endReason: 'natural-end' })
      )
    ).toBe(2)
    expect(
      scorePlaybackFeedback(
        makeFeedback({
          activeListenSeconds: 120,
          completionRatio: 0.6,
          endReason: 'natural-end',
          likedAtEnd: true
        })
      )
    ).toBe(7)
    expect(scorePlaybackFeedback(makeFeedback({ endReason: 'playback-error' }))).toBeNull()
    expect(scorePlaybackFeedback(makeFeedback({ endReason: 'app-close' }))).toBeNull()
    expect(scorePlaybackFeedback(makeFeedback({ endReason: 'queue-replaced' }))).toBeNull()
  })

  test('uses the requested presets and keeps Diverse as the default exploration profile', () => {
    expect(getHeartModePresetProfile('continuous')).toMatchObject({
      diversity: 15,
      novelty: 40,
      familiarity: 80,
      repeatTolerance: 60,
      seedCount: 1
    })
    expect(getHeartModePresetProfile('diverse')).toMatchObject({
      diversity: 80,
      novelty: 75,
      familiarity: 35,
      repeatTolerance: 20,
      seedCount: 4
    })
    expect(getHeartModePresetProfile('explore')).toMatchObject({
      diversity: 95,
      novelty: 95,
      familiarity: 15,
      repeatTolerance: 5,
      seedCount: 5
    })
  })

  test('persists a cross-session cooldown and supplements candidates with multiple seeds', () => {
    const main = readSource('src/renderer/main.ts')
    const history = readSource('src/renderer/utils/heartModeHistory.ts')
    const feedback = readSource('src/renderer/utils/playbackFeedback.ts')
    const profile = readSource('src/renderer/utils/heartModeProfile.ts')
    const session = readSource('src/renderer/utils/heartModeSession.ts')
    const settings = readSource('src/renderer/views/SystemSettings.vue')
    const player = readSource('src/renderer/store/player.ts')
    const virtualTrackList = readSource('src/renderer/components/VirtualTrackList.vue')

    expect(main).toContain('await dataStore.fetchPlayHistory()')
    expect(main).toContain('recentTracks.value.map')
    expect(main).toContain('heartModeProfile.value.seedCount')
    expect(main).toContain('rankHeartModeCandidates({')
    expect(main).toContain('recordHeartModeTrackIDs(heartModeTrackIDs)')
    expect(history).toContain("HEART_MODE_HISTORY_KEY = 'vutronmusic-heart-mode-history-v1'")
    expect(history).toContain('MAX_HEART_MODE_HISTORY = 300')
    expect(history).toContain('HEART_MODE_HISTORY_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000')
    expect(history).toContain('recentUnlikedRepeats.push(id)')
    expect(main).toContain('initializePlaybackFeedback(playerStore)')
    expect(main).toContain("markPlaybackEndReason('heart-mode-restart')")
    expect(main).toContain('createHeartModeSession({')
    expect(feedback).toContain("PLAYBACK_FEEDBACK_KEY = 'vutronmusic-playback-feedback-v1'")
    expect(feedback).toContain('activeListenSeconds')
    expect(feedback).toContain('window.vutronmusic?.progress')
    expect(feedback).toContain("case '_playNextTrack':")
    expect(feedback).toContain("return 'manual-next'")
    expect(feedback).toContain("finalizeActivePlayback('app-close')")
    expect(profile).toContain("HEART_MODE_PROFILE_KEY = 'vutronmusic-heart-mode-profile-v1'")
    expect(profile).toContain('DEFAULT_HEART_MODE_PROFILE')
    expect(session).toContain("HEART_MODE_SESSION_KEY = 'vutronmusic-heart-mode-session-v1'")
    expect(session).toContain('sourceSeedByTrackID')
    expect(settings).toContain("settings.heartModeProfile.title")
    expect(settings).toContain('v-model="selectedHeartModeMode"')
    expect(settings).toContain("heartModeProfile.mode === 'custom'")
    expect(player).toContain("markPlaybackEndReason('natural-end')")
    expect(player).toContain("markPlaybackEndReason('playback-error')")
    expect(virtualTrackList).toContain("markPlaybackEndReason('manual-select')")
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

    expect(playback).toContain("$t('player.playbackRateModal.title')")
    expect(playback).toContain("$t('player.playbackRateModal.current')")
    expect(playback).toContain('class="preset-grid"')
    expect(playback).toContain('playbackRatePresets')
    expect(playback).not.toContain(':marks="marks"')
    expect(pitch).toContain('class="preset-grid"')
    expect(pitch).toContain('pitchPresets')
    expect(pitch).not.toContain(':marks="marks"')
  })

  test('keeps Classic cover, lyrics and lyric timing tools visually aligned', () => {
    const commonPlayer = readSource('src/renderer/components/CommonPlayer.vue')
    const lyricPage = readSource('src/renderer/components/LyricPage.vue')

    expect(commonPlayer).toContain("'calc(100% - 72px)'")
    expect(commonPlayer).toContain("'24px'")
    expect(commonPlayer).toContain('flex: 0 1 45%')
    expect(commonPlayer).toContain('align-items: flex-end')
    expect(commonPlayer).toContain('flex: 1 1 55%')
    expect(lyricPage).toContain('width: 44px')
    expect(lyricPage).toContain('height: 44px')
    expect(lyricPage).toContain('width: 22px')
    expect(lyricPage).toContain('height: 22px')
  })

  test('centers the Classic cover when lyrics are absent or the window becomes portrait', () => {
    const commonPlayer = readSource('src/renderer/components/CommonPlayer.vue')

    expect(commonPlayer).toContain('&.no-lyric {')
    expect(commonPlayer).toContain('flex: 1 1 100%')
    expect(commonPlayer).toContain('flex: 0 0 0')
    expect(commonPlayer).toContain('width: 0')
    expect(commonPlayer).toContain('overflow: hidden')
    expect(commonPlayer).toContain('&.isMobile {')
    expect(commonPlayer).toContain('width: 100%')
    expect(commonPlayer).toContain('align-items: center')
  })

  test('keeps the Classic lyric toolbar and comments inside the viewport tool lane', () => {
    const commonPlayer = readSource('src/renderer/components/CommonPlayer.vue')
    const commentList = readSource('src/renderer/components/CommentList.vue')
    const writeComment = readSource('src/renderer/components/WriteComment.vue')

    expect(commonPlayer).toContain('padding: 0 0 0 clamp(20px, 3vw, 44px)')
    expect(commonPlayer).toContain("'40px 72px 10px 4vh'")
    expect(commentList).toContain('flex: 1 1 auto')
    expect(commentList).toContain('min-height: 0')
    expect(commentList).toContain('flex: 0 0 auto')
    expect(writeComment).toContain('height: 44px')
  })

  test('toggles PlayerBar mute and keeps continuous sliders position-aware', () => {
    const playerBar = readSource('src/renderer/components/PlayerBar.vue')
    const slider = readSource('src/renderer/components/VueSlider.vue')
    const zhHans = readSource('src/renderer/locales/zh-hans.json')
    const zhHant = readSource('src/renderer/locales/zh-hant.json')
    const en = readSource('src/renderer/locales/en.json')

    expect(playerBar).toContain('@click.stop="toggleMute"')
    expect(playerBar).toContain('volumeBeforeMuted.value = volume.value')
    expect(playerBar).toContain('volume.value = restoreVolume')
    expect(playerBar).toContain("$t('player.unmute')")
    expect(playerBar).not.toContain(':dot-style="{ display: \'none\' }"')
    expect(slider).toContain('class="vue-slider-dot"')
    expect(slider).toContain('const dotStyle = computed')
    expect(slider).toContain('normalizedValue.value * 100')
    for (const locale of [zhHans, zhHant, en]) {
      expect(locale).toContain('\"unmute\"')
    }
  })

  test('keeps injected settings controls theme-aware and activates custom accent colors', () => {
    const settings = readSource('src/renderer/views/SystemSettings.vue')
    const sharedFeatures = readSource('src/renderer/utils/v327FeatureShared.ts')

    expect(settings).toContain('@update:value="selectCustomizeColor"')
    expect(settings).toContain('const selectCustomizeColor = (value: string) => {')
    expect(settings).toContain('customizeColor.value.color = value')
    expect(settings).toContain('changeColor(customizeColor.value)')
    expect(sharedFeatures).toContain('color: var(--color-text);')
    expect(sharedFeatures).toContain('background: var(--color-secondary-bg);')
    expect(sharedFeatures).toContain('.vutronmusic-v327-controls button {')
  })

  test('keeps update diagnostics actions readable in dark mode', () => {
    const latestVersion = readSource('src/renderer/components/LatestVersion.vue')

    expect(latestVersion).toContain('.diagnostic-panel {')
    expect(latestVersion).toContain('.diagnostic-panel__actions {')
    expect(latestVersion).toContain('color: var(--color-text);')
    expect(latestVersion).toContain('font: inherit;')
  })

  test('applies fade-in only after audio playback has started', () => {
    const player = readSource('src/renderer/store/player.ts')
    const replacePlaylist = player.slice(
      player.indexOf('const replacePlaylist = async'),
      player.indexOf('const replaceCurrentTrack = async')
    )
    const replaceCurrentTrack = player.slice(
      player.indexOf('const replaceCurrentTrack = async'),
      player.indexOf('// const _scrobble')
    )
    const play = player.slice(
      player.indexOf('const play = async'),
      player.indexOf('const pause = async')
    )

    expect(replacePlaylist).not.toContain('await smoothGain(0, 0)')
    expect(replaceCurrentTrack).not.toContain('await smoothGain(0, 0)')
    expect(player).toContain('await smoothGain(0, fade)')
    expect(play).toContain('await smoothGain(0, 0)')
    expect(play).toContain('await audioNodes.audio.play()')
    expect(play).toContain('void smoothGain(volume.value, fade)')
    expect(play.indexOf('await audioNodes.audio.play()')).toBeLessThan(
      play.indexOf('void smoothGain(volume.value, fade)')
    )
  })

  test('makes Classic volume step icons functional and self-describing', () => {
    const commonPlayer = readSource('src/renderer/components/CommonPlayer.vue')
    const zhHans = readSource('src/renderer/locales/zh-hans.json')
    const zhHant = readSource('src/renderer/locales/zh-hant.json')
    const en = readSource('src/renderer/locales/en.json')

    expect(commonPlayer).toContain('@click="adjustVolume(-0.05)"')
    expect(commonPlayer).toContain('@click="adjustVolume(0.05)"')
    expect(commonPlayer).toContain("$t('player.volumeDown')")
    expect(commonPlayer).toContain("$t('player.volumeUp')")
    expect(commonPlayer).toContain('Math.min(1, Math.max(0, volume.value + delta))')
    expect(commonPlayer).toContain('Math.round(nextVolume * 100) / 100')
    for (const locale of [zhHans, zhHant, en]) {
      expect(locale).toContain('\"volumeDown\"')
      expect(locale).toContain('\"volumeUp\"')
    }
  })

  test('keeps Classic track metadata readable and player actions self-describing', () => {
    const commonPlayer = readSource('src/renderer/components/CommonPlayer.vue')
    const playPage = readSource('src/renderer/views/PlayPage.vue')
    const zhHans = readSource('src/renderer/locales/zh-hans.json')
    const zhHant = readSource('src/renderer/locales/zh-hant.json')
    const en = readSource('src/renderer/locales/en.json')

    expect(commonPlayer).toContain(':title="currentTrack?.name || \'\'"')
    expect(commonPlayer).toContain(':title="trackDetailsTitle"')
    expect(commonPlayer).toContain("$t('player.switchTranslation')")
    expect(commonPlayer).toContain("$t('player.addToPlaylist')")
    expect(commonPlayer).toContain("$t('player.moreActions')")
    expect(commonPlayer).toContain("$t(playing ? 'player.pause' : 'player.play')")
    expect(commonPlayer).toContain("$t('player.shuffle')")
    expect(commonPlayer).toContain(
      '-webkit-line-clamp: 2;\n          line-clamp: 2;\n          line-height: 1.28'
    )
    expect(playPage).toContain("$t('player.playerTheme')")
    expect(playPage).toContain("$t('player.collapsePlayer')")
    expect(playPage).toContain("t('player.showComments')")
    for (const locale of [zhHans, zhHant, en]) {
      expect(locale).toContain('\"switchTranslation\"')
      expect(locale).toContain('\"collapsePlayer\"')
      expect(locale).toContain('\"showFullLyrics\"')
    }
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

  test('toggles the main window by visibility rather than transient focus', () => {
    const ipcs = readSource('src/main/IPCs.ts')

    expect(ipcs).toContain('const revealMainWindowFromOsd =')
    expect(ipcs).toContain('if (win.isMinimized()) win.restore()')
    expect(ipcs).toContain('win.isMinimized() || !win.isVisible()')
    expect(ipcs).not.toContain('win.isMinimized() || !win.isVisible() || !win.isFocused()')
    expect(ipcs).toContain('win.hide()')
    expect(ipcs).toContain('revealMainWindowFromOsd(win)')
  })

  test('uses exactly one desktop-lyric play toggle route', () => {
    const constants = readSource('src/main/utils/Constants.ts')
    const ipcs = readSource('src/main/IPCs.ts')
    const player = readSource('src/renderer/store/player.ts')

    expect(constants).not.toContain("import '../osdPlaybackBridge'")
    expect(ipcs).toContain("message === 'playOrPauseFromOsd'")
    expect(ipcs).toContain("win.webContents.send('play-from-osd')")
    expect(player).toContain("window.mainApi?.on('play-from-osd'")
    expect(player).toContain('watch(playing, (value) => {')
  })

  test('renders concise release notes as cleaned bullet points', () => {
    const latestVersion = readSource('src/renderer/components/LatestVersion.vue')

    expect(latestVersion).toContain('v-if="releaseNoteItems.length"')
    expect(latestVersion).toContain('MAX_RELEASE_NOTE_ITEMS = 8')
    expect(latestVersion).toContain('buildReleaseNoteItems')
    expect(latestVersion).not.toContain('v-same-html="latestVersion?.updateInfo?.releaseNotes')
  })

  test('uses the same pill toggle geometry across settings controls', () => {
    const settings = readSource('src/renderer/views/SystemSettings.vue')
    const coverControls = readSource('src/renderer/utils/osdCoverControlsSettings.ts')

    expect(settings).toContain('.toggle input + label {')
    expect(settings).toContain('height: 24px;')
    expect(settings).toContain('width: 44px;')
    expect(settings).toContain('border-radius: 999px;')
    expect(settings).toContain('height: 18px;')
    expect(settings).toContain('width: 18px;')
    expect(settings).toContain('border-radius: 50%;')
    expect(settings).toContain('left: 23px;')

    expect(coverControls).toContain('width: 44px;')
    expect(coverControls).toContain('height: 24px;')
    expect(coverControls).toContain('border-radius: 999px;')
    expect(coverControls).toContain('width: 18px;')
    expect(coverControls).toContain('height: 18px;')
    expect(coverControls).toContain('border-radius: 50%;')
  })

  test('matches the Linux desktop launcher to Electron actual WM_CLASS', () => {
    const main = readSource('src/main/index.ts')
    const builder = readSource('buildAssets/builder/config.js')

    expect(main).not.toContain("app.commandLine.appendSwitch('class', 'vutron')")
    expect(builder).toContain("StartupWMClass: 'VutronMusic'")
    expect(builder).toContain("executableName: 'vutron'")
  })

  test('restores and explicitly reveals persisted desktop lyrics', () => {
    const main = readSource('src/main/index.ts')

    expect(main).toContain('this.initOSDWindow()')
    expect(main).toContain('this.handleOSDWindowEvents()')
    expect(main).toContain('await lyricWin.loadURL(Constants.APP_OSD_URL)')
    expect(main).toContain('lyricWin.showInactive()')
    expect(main).toContain("log.error('[OSD] Failed to load desktop lyric window:'")
    expect(main).toContain('if (this.lyricWin?.isDestroyed()) this.lyricWin = null')
  })

  test('keeps language switching reactive across Vue and injected controls', () => {
    const settings = readSource('src/renderer/views/SystemSettings.vue')
    const shared = readSource('src/renderer/utils/v327FeatureShared.ts')
    const select = readSource('src/renderer/components/CustomSelect.vue')
    const playback = readSource('src/renderer/components/ModalPlayback.vue')
    const pitch = readSource('src/renderer/components/ModalPitch.vue')
    const diagnostics = readSource('src/renderer/components/LatestVersion.vue')
    const compact = readSource('src/renderer/components/CompactCoverControls.vue')

    expect(settings).toContain('setFeatureLanguage(value as SupportedLanguage)')
    expect(settings).toContain('const languageOption = computed(() => [')
    expect(settings).toContain('const translateOptions = computed(() => [')
    expect(shared).toContain("FEATURE_LANGUAGE_CHANGE_EVENT = 'vutronmusic-language-change'")
    expect(shared).toContain('const featureLanguage = ref<SupportedLanguage>')
    expect(shared).toContain('refreshInjectedControlsForLanguage')
    expect(select).toContain("t('common.selectPlaceholder')")
    expect(select).toContain("t('common.searchPlaceholder')")
    expect(playback).toContain("$t('player.playbackRateModal.title')")
    expect(pitch).toContain("$t('player.pitchModal.title')")
    expect(diagnostics).toContain('settings.update.diagnostics.title')
    expect(compact).toContain('computed(() => TEXTS[resolveFeatureLanguage()])')
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
