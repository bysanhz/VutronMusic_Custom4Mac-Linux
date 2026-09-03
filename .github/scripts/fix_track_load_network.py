from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'{label} block not found')
    return text.replace(old, new, 1)


player_path = Path('src/renderer/store/player.ts')
player = player_path.read_text()

player = replace_once(
    player,
    '''    let lastUpdateTime = 0
    let trackLoadRevision = 0
''',
    '''    let lastUpdateTime = 0
    let trackLoadRevision = 0
    let trackLookupFailureRevision = -1
''',
    'player revision',
)

player = replace_once(
    player,
    '''    const replaceCurrentTrack = async (trackID: number | string, autoPlay = true) => {
      const revision = ++trackLoadRevision
      cancelSleepTimerForTrackChange(trackID)
      if (autoPlay && currentTrack.value?.name) {
        scrobbleFM(currentTrack.value, seek.value)
      }

      const track = await getLocalMusic(trackID as number)
      if (revision !== trackLoadRevision) return false

      if (!track) {
        nextTrackCallback()
        return false
      }
''',
    '''    const replaceCurrentTrack = async (trackID: number | string, autoPlay = true) => {
      const revision = ++trackLoadRevision
      trackLookupFailureRevision = -1
      cancelSleepTimerForTrackChange(trackID)
      if (autoPlay && currentTrack.value?.name) {
        scrobbleFM(currentTrack.value, seek.value)
      }

      let track: Track | undefined
      try {
        track = await getLocalMusic(trackID as number)
      } catch (error) {
        if (revision !== trackLoadRevision) return false
        trackLookupFailureRevision = revision
        console.error(`[Player] 获取歌曲信息失败: ${trackID}`, error)
        showToast('歌曲信息获取失败，未跳过当前歌曲，请稍后重试')
        return false
      }
      if (revision !== trackLoadRevision) return false

      if (!track) {
        showToast('歌曲信息不存在，正在切换下一首...')
        nextTrackCallback()
        return false
      }
''',
    'replaceCurrentTrack',
)

player = replace_once(
    player,
    '''    const getLocalMusic = (id: number) => {
      return new Promise<Track | undefined>((resolve) => {
        let matchTrack = getALocalTrack({ id })
        if (matchTrack) {
          if (!isLocalList.value) {
            showToast(`使用本地文件播放`)
          }
          matchTrack.source = 'localTrack'
          resolve(matchTrack)
          return
        }
        matchTrack = getAStreamTrack(id)
        if (matchTrack) {
          resolve(matchTrack)
          return
        }
        if (window.env?.isElectron) {
          fetch(`atom://local-asset?type=track&id=${id}`).then((data) => {
            if (data.status === 200) {
              data.json().then((track: Track) => {
                resolve(track)
              })
            } else if (data.status === 404) {
              resolve(undefined)
            }
          })
        } else {
          getTrackDetail(id.toString()).then((data) => {
            if (data.code === 200) {
              resolve(data.songs[0])
            } else {
              resolve(undefined)
            }
          })
        }
      })
    }
''',
    '''    const getLocalMusic = async (id: number): Promise<Track | undefined> => {
      let matchTrack = getALocalTrack({ id })
      if (matchTrack) {
        if (!isLocalList.value) {
          showToast(`使用本地文件播放`)
        }
        matchTrack.source = 'localTrack'
        return matchTrack
      }

      matchTrack = getAStreamTrack(id)
      if (matchTrack) return matchTrack

      if (window.env?.isElectron) {
        let lastError: unknown = null
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const response = await fetch(`atom://local-asset?type=track&id=${id}`)
            if (response.status === 200) {
              return (await response.json()) as Track
            }
            if (response.status === 404) return undefined

            const details = await response.text().catch(() => '')
            throw new Error(
              `歌曲信息请求失败 (${response.status})${details ? `: ${details}` : ''}`
            )
          } catch (error) {
            lastError = error
            if (attempt === 0) await delay(400)
          }
        }

        throw lastError instanceof Error ? lastError : new Error('歌曲信息请求失败')
      }

      const data = await getTrackDetail(id.toString())
      if (data?.code === 200 && data.songs?.length) return data.songs[0]
      return undefined
    }
''',
    'getLocalMusic',
)

player = replace_once(
    player,
    '''    const playPrev = async () => {
      const [trackID, index] = getPrevTrack()
      if (!trackID) {
        playing.value = false
        return false
      }
      currentTrackIndex.value = index!
      await replaceCurrentTrack(trackID, true)
      return true
    }
''',
    '''    const playPrev = async () => {
      const [trackID, index] = getPrevTrack()
      if (!trackID) {
        playing.value = false
        return false
      }

      const previousIndex = currentTrackIndex.value
      currentTrackIndex.value = index!
      const replaced = await replaceCurrentTrack(trackID, true)
      if (
        !replaced &&
        trackLookupFailureRevision === trackLoadRevision &&
        currentTrackIndex.value === index
      ) {
        currentTrackIndex.value = previousIndex
      }
      return replaced
    }
''',
    'playPrev',
)

player = replace_once(
    player,
    '''    const playNext = async () => {
      if (playingNext.value) {
        list.value.splice(currentTrackIndex.value, 0, currentTrack.value!.id)
      }
      const [trackID, index, isPlayingNext] = getNextTrack()
      playingNext.value = isPlayingNext
      if (!trackID) {
        playing.value = false
        return false
      }
      currentTrackIndex.value = index
      await replaceCurrentTrack(trackID, true)
    }
''',
    '''    const playNext = async () => {
      if (playingNext.value) {
        list.value.splice(currentTrackIndex.value, 0, currentTrack.value!.id)
      }
      const [trackID, index, isPlayingNext] = getNextTrack()
      const previousIndex = currentTrackIndex.value
      const previousPlayingNext = playingNext.value
      playingNext.value = isPlayingNext
      if (!trackID) {
        playing.value = false
        return false
      }
      currentTrackIndex.value = index
      const replaced = await replaceCurrentTrack(trackID, true)
      if (
        !replaced &&
        trackLookupFailureRevision === trackLoadRevision &&
        currentTrackIndex.value === index
      ) {
        currentTrackIndex.value = previousIndex
        playingNext.value = previousPlayingNext
      }
      return replaced
    }
''',
    'playNext',
)

player_path.write_text(player)


main_path = Path('src/main/index.ts')
main = main_path.read_text()
main = replace_once(
    main,
    '''          case 'track':
            ids = searchParams.get('id')
            res = cache.get(CacheAPIs.Track, { ids })
            if (res) {
              const track = res.songs[0]
              return new Response(JSON.stringify(track), {
                headers: { 'content-type': 'application/json' }
              })
            } else {
              res = await getTrackDetail(ids)
              if (!res || !res.songs?.length) {
                log.error('======get-track-error=====', ids)
                return new Response(JSON.stringify({ status: 404 }), {
                  headers: { 'content-type': 'application/json' }
                })
              }
              const track = res.songs[0]
              const { url, br, gain, peak, source } = await getAudioSource(track)
              track.url = url
              track.source = source
              track.gain = gain
              track.peak = peak
              track.br = br

              return new Response(JSON.stringify(track), {
                headers: { 'content-type': 'application/json' }
              })
            }
''',
    '''          case 'track':
            ids = searchParams.get('id')
            try {
              res = cache.get(CacheAPIs.Track, { ids })
              if (res) {
                const track = res.songs[0]
                return new Response(JSON.stringify(track), {
                  headers: { 'content-type': 'application/json' }
                })
              }

              res = await getTrackDetail(ids)
              if (!res || !res.songs?.length) {
                log.warn('[Player] 歌曲信息不存在', ids)
                return new Response(JSON.stringify({ code: 404, message: 'Track not found' }), {
                  status: 404,
                  headers: { 'content-type': 'application/json' }
                })
              }

              const track = res.songs[0]
              const { url, br, gain, peak, source } = await getAudioSource(track)
              track.url = url
              track.source = source
              track.gain = gain
              track.peak = peak
              track.br = br

              return new Response(JSON.stringify(track), {
                headers: { 'content-type': 'application/json' }
              })
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              log.error(`[Player] 获取歌曲信息失败: ${ids}`, error)
              return new Response(JSON.stringify({ code: 503, retryable: true, message }), {
                status: 503,
                headers: { 'content-type': 'application/json' }
              })
            }
''',
    'main track protocol',
)
main_path.write_text(main)


netease_path = Path('src/main/appServer/netease.ts')
netease = netease_path.read_text()
netease = replace_once(
    netease,
    '''import { normalizeNeteaseAssetUrls } from '../../shared/neteaseAssetUrl'

const isRepeatedDailySignin = (name: string, error: any): boolean => {
''',
    '''import { normalizeNeteaseAssetUrls } from '../../shared/neteaseAssetUrl'
import https from 'node:https'
import tls from 'node:tls'

const configureSystemTrustedCAs = () => {
  const getCACertificates = (tls as any).getCACertificates as
    | ((type?: 'default' | 'system' | 'bundled' | 'extra') => string[])
    | undefined
  if (!getCACertificates) return

  try {
    const defaultCAs = getCACertificates('default')
    const systemCAs = getCACertificates('system')
    if (!systemCAs.length) return

    https.globalAgent.options.ca = Array.from(new Set([...defaultCAs, ...systemCAs]))
    log.info(`[TLS] 已合并 ${systemCAs.length} 个系统受信任 CA，供网易云 Node 请求使用`)
  } catch (error) {
    log.warn('[TLS] 读取系统 CA 失败，将继续使用 Node 默认 CA', error)
  }
}

configureSystemTrustedCAs()

const getNeteaseErrorMessage = (error: any): string => {
  const message = error?.body?.msg
  if (typeof message === 'string' && message) return message
  if (message && typeof message === 'object') {
    if (typeof message.message === 'string' && message.message) return message.message
    if (typeof message.code === 'string' && message.code) return message.code
  }
  if (typeof error?.message === 'string' && error.message) return error.message
  return 'Netease API request failed'
}

const isRepeatedDailySignin = (name: string, error: any): boolean => {
''',
    'netease import',
)

netease = replace_once(
    netease,
    '''        log.error(`Netease API Error: ${name}`, error)
        if ([400, 301, 250].includes(error.status)) {
          return reply.status(error.status).send(error.body)
        }
        return reply.status(500).send({
          code: 500,
          message: 'Netease API request failed'
        })
''',
    '''        log.error(`Netease API Error: ${name}`, error)
        if ([400, 301, 250].includes(error.status)) {
          return reply.status(error.status).send(error.body)
        }

        const upstreamStatus = Number(error?.status)
        if (upstreamStatus >= 500 && upstreamStatus <= 599) {
          return reply.status(upstreamStatus).send({
            code: upstreamStatus,
            retryable: true,
            message: getNeteaseErrorMessage(error)
          })
        }

        return reply.status(500).send({
          code: 500,
          retryable: true,
          message: getNeteaseErrorMessage(error)
        })
''',
    'netease error',
)
netease_path.write_text(netease)


test_path = Path('tests/player-track-state-race.spec.ts')
tests = test_path.read_text()
marker = '''  test('keeps heart-mode selection in bounds and ignores stale responses', () => {
'''
insert = '''  test('keeps a transient track lookup failure from corrupting playlist navigation', () => {
    const player = readSource('src/renderer/store/player.ts')

    expect(player).toContain('let trackLookupFailureRevision = -1')
    expect(player).toContain('for (let attempt = 0; attempt < 2; attempt += 1)')
    expect(player).toContain('if (response.status === 404) return undefined')
    expect(player).toContain("showToast('歌曲信息获取失败，未跳过当前歌曲，请稍后重试')")
    expect(player).toContain('trackLookupFailureRevision === trackLoadRevision')
  })

  test('returns explicit HTTP failures from the atom track protocol', () => {
    const main = readSource('src/main/index.ts')

    expect(main).toContain("log.warn('[Player] 歌曲信息不存在', ids)")
    expect(main).toContain("JSON.stringify({ code: 404, message: 'Track not found' })")
    expect(main).toContain('JSON.stringify({ code: 503, retryable: true, message })')
  })

  test('adds system trusted CAs without disabling TLS validation', () => {
    const netease = readSource('src/main/appServer/netease.ts')

    expect(netease).toContain("getCACertificates('system')")
    expect(netease).toContain('https.globalAgent.options.ca =')
    expect(netease).not.toContain('NODE_TLS_REJECT_UNAUTHORIZED')
    expect(netease).not.toContain('rejectUnauthorized: false')
  })

'''
tests = replace_once(tests, marker, insert + marker, 'test insertion')
test_path.write_text(tests)
