import { app, BrowserWindow } from 'electron'

const repeatModeList = ['off', 'on', 'one']
let idx = 0
let shuffleMode = false
let isPersonalFM = false

export interface MprisImpl {
  setPlayState: (isPlaying: boolean) => void
  setRepeatMode: (repeat: string) => void
  setShuffleMode: (isShuffle: boolean) => void
  setMetadata: (metadata: any) => void
  setPosition: (data: { progress: number; seeked?: boolean }) => void
  setRate: (rdata: { rate: number }) => void
  setPersonalFM: (value: boolean) => void
}

class Mpris implements MprisImpl {
  private _player: any
  private _win: BrowserWindow
  private Player: any
  private positionSeconds = 0
  private positionSampledAt = Date.now()
  private currentRate = 1
  private isPlaying = false

  // MPRIS Position is a read-only clock. Seeked must only be emitted for
  // explicit discontinuities, not for normal timeupdate samples.
  private estimatedPositionSeconds(): number {
    const elapsed = this.isPlaying
      ? Math.max(0, Date.now() - this.positionSampledAt) / 1000 * this.currentRate
      : 0
    return Math.max(0, this.positionSeconds + elapsed)
  }

  private samplePosition(progress: number): void {
    if (!Number.isFinite(progress) || progress < 0) return
    this.positionSeconds = progress
    this.positionSampledAt = Date.now()
  }

  constructor(win: BrowserWindow) {
    this.Player = require('@jellybrick/mpris-service')
    this._player = new this.Player({
      name: 'VutronMusic',
      identity: 'VutronMusic'
    })
    this._win = win
    this._player.getPosition = () => Math.round(this.estimatedPositionSeconds() * 1_000_000)
    this._handleEvent()
  }

  private _handleEvent() {
    const renderer = this._win.webContents
    this._player.on('next', () => renderer.send('next'))
    this._player.on('previous', () => renderer.send(isPersonalFM ? 'fm-trash' : 'previous'))
    this._player.on('playpause', () => renderer.send('play'))
    this._player.on('play', () => renderer.send('play'))
    this._player.on('pause', () => renderer.send('play'))
    this._player.on('quit', () => app.exit())
    this._player.on('position', (args) => renderer.send('setPosition', args.position / 1000 / 1000))
    this._player.on('loopStatus', () => {
      idx = idx === 2 ? 0 : idx + 1
      renderer.send('repeat', repeatModeList[idx])
    })
    this._player.on('shuffle', () => {
      shuffleMode = !shuffleMode
      renderer.send('repeat-shuffle', shuffleMode)
    })
  }

  setPlayState(isPlaying: boolean) {
    this.samplePosition(this.estimatedPositionSeconds())
    this.isPlaying = isPlaying
    this._player.playbackStatus = isPlaying
      ? this.Player.PLAYBACK_STATUS_PLAYING
      : this.Player.PLAYBACK_STATUS_PAUSED
  }

  setRepeatMode(repeat: 'on' | 'one' | 'off') {
    idx = repeatModeList.indexOf(repeat)
    switch (repeat) {
      case 'on':
        this._player.loopStatus = this.Player.LOOP_STATUS_PLAYLIST
        break
      case 'one':
        this._player.loopStatus = this.Player.LOOP_STATUS_TRACK
        break
      case 'off':
        this._player.loopStatus = this.Player.LOOP_STATUS_NONE
        break
    }
  }

  setShuffleMode(isShuffle: boolean) {
    shuffleMode = isShuffle
    this._player.shuffle = isShuffle
  }

  setMetadata(metadata: any) {
    this._player.metadata = {
      'mpris:trackid': this._player.objectPath('track/' + metadata.trackId),
      'mpris:artUrl': metadata.artwork[0].src,
      'mpris:length': metadata.length * 1000 * 1000,
      'xesam:title': metadata.title,
      'xesam:artist': metadata.artist.split(','),
      'xesam:album': metadata.album,
      'xesam:url': metadata.url,
      'xesam:asText': metadata.asText,
      'xesam:lyricOffset': metadata.lyricOffset
    }
    this.currentRate = Number(metadata.rate) || 1
    this._player.rate = this.currentRate
    this.samplePosition(Number(metadata.progress) || 0)
  }

  setPersonalFM(value: boolean) {
    isPersonalFM = value
  }

  setRate(data: { rate: number }) {
    this.samplePosition(this.estimatedPositionSeconds())
    this.currentRate = Number(data.rate) || 1
    this._player.rate = this.currentRate
  }

  setPosition(data: { progress: number; seeked?: boolean }) {
    if (!Number.isFinite(data.progress) || data.progress < 0) return
    this.samplePosition(data.progress)
    if (data.seeked) {
      this._player.seeked(Math.round(data.progress * 1_000_000))
    }
  }
}

export async function createMpris(win: BrowserWindow): Promise<MprisImpl> {
  const mprisInstance = new Mpris(win)
  await new Promise((resolve) => setImmediate(resolve))

  return mprisInstance
}
