"""Apply the remaining NetEase API integration changes once.

Usage:
    python tools/apply-netease-enhancements-once.py

Args:
    None.

Returns:
    Updates tracked source files in-place and raises if an expected source block changed.
"""

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, got {count}: {old[:80]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


# Global search: expose NetEase default/hot suggestions and add two discovery tabs.
replace_once(
    "src/renderer/components/NavBar.vue",
    '<SearchBox ref="searchBoxRef" :clear-keywords="true" @keydown-enter="doSearch($event)" />',
    '<SearchBox\n          ref="searchBoxRef"\n          :clear-keywords="true"\n          :suggestions="true"\n          @keydown-enter="doSearch($event)"\n        />',
)

replace_once(
    "src/renderer/components/NavBar.vue",
    '''        <div\n          class="item"\n          :class="{ active: exploreTab === 'artist' }"\n          @click="toExplore('artist')"\n          >{{ $t('nav.artist') }}</div\n        >\n''',
    '''        <div\n          class="item"\n          :class="{ active: exploreTab === 'artist' }"\n          @click="toExplore('artist')"\n          >{{ $t('nav.artist') }}</div\n        >\n        <div\n          class="item"\n          :class="{ active: exploreTab === 'style' }"\n          @click="toExplore('style')"\n          >曲风</div\n        >\n        <div\n          class="item"\n          :class="{ active: exploreTab === 'following' }"\n          @click="toExplore('following')"\n          >关注新作</div\n        >\n''',
)

# Modern NetEase quality levels. Persisted legacy numeric values are migrated in the main process.
replace_once(
    "src/renderer/store/settings.ts",
    "      musicQuality: 320000,",
    "      musicQuality: 'exhigh' as string | number,",
)

replace_once(
    "src/renderer/views/SystemSettings.vue",
    '''const musicQualityOptions = computed(() => [\n  { label: t('settings.general.musicQuality.low') + ' - 128Kbps', value: 128000 },\n  { label: t('settings.general.musicQuality.medium') + ' - 192Kbps', value: 192000 },\n  { label: t('settings.general.musicQuality.high') + ' - 320Kbps', value: 320000 },\n  { label: t('settings.general.musicQuality.lossless') + ' - FLAC', value: 'flac' },\n  { label: 'Hi-Res', value: 999000 }\n])''',
    '''const musicQualityOptions = computed(() => [\n  { label: t('settings.general.musicQuality.low') + ' - 标准', value: 'standard' },\n  { label: t('settings.general.musicQuality.medium') + ' - 较高', value: 'higher' },\n  { label: t('settings.general.musicQuality.high') + ' - 极高', value: 'exhigh' },\n  { label: t('settings.general.musicQuality.lossless') + ' - 无损', value: 'lossless' },\n  { label: 'Hi-Res', value: 'hires' },\n  { label: '高清环绕声', value: 'jyeffect' },\n  { label: '沉浸环绕声', value: 'sky' },\n  { label: '臻音全景声', value: 'vivid' },\n  { label: '超清母带', value: 'jymaster' }\n])''',
)

# Prefer /song/url/v1 level-based quality with graceful downgrade and old-setting migration.
replace_once(
    "src/main/utils/index.ts",
    '''const getAudioSourceFromNetease = async (track: any): Promise<{ [key: string]: any }> => {\n  const getBr = () => {\n    const quality = store.get('settings.musicQuality')\n    return quality === 'flac' ? 350000 : quality\n  }\n  const getMP3 = async (id: string) => {\n    return request({\n      url: '/song/url',\n      method: 'get',\n      params: {\n        id,\n        br: getBr()\n      }\n    })\n  }\n\n  return getMP3(track.id)\n    .then((result: any) => {\n      const br = result.data[0]?.br || 128000\n      const gain = result.data[0]?.gain || 0\n      const peak = result.data[0]?.peak || 1\n      // if (!result.data[0]) return null\n      if (!result.data[0] || !result.data[0].url || result.data[0].freeTrialInfo !== null) {\n        return { url: null, br, gain, peak }\n      }\n      const source = result.data[0].url.replace(/^http:/, 'https:')\n      return { url: source, br, gain, peak }\n    })\n    .catch(() => {\n      const url = `https://music.163.com/song/media/outer/url?id=${track.id}`\n      return { url, br: 128000, gain: 0, peak: 1 }\n    })\n}''',
    '''type NetEaseSoundQuality =\n  | 'standard'\n  | 'higher'\n  | 'exhigh'\n  | 'lossless'\n  | 'hires'\n  | 'jyeffect'\n  | 'sky'\n  | 'vivid'\n  | 'jymaster'\n\nconst NETEASE_QUALITY_ORDER: NetEaseSoundQuality[] = [\n  'jymaster',\n  'vivid',\n  'sky',\n  'jyeffect',\n  'hires',\n  'lossless',\n  'exhigh',\n  'higher',\n  'standard'\n]\n\nconst normalizeNeteaseQuality = (quality: unknown): NetEaseSoundQuality => {\n  const legacyQualityMap = new Map<unknown, NetEaseSoundQuality>([\n    [128000, 'standard'],\n    [192000, 'higher'],\n    [320000, 'exhigh'],\n    ['flac', 'lossless'],\n    [999000, 'hires']\n  ])\n  if (legacyQualityMap.has(quality)) return legacyQualityMap.get(quality)!\n  if (NETEASE_QUALITY_ORDER.includes(quality as NetEaseSoundQuality)) {\n    return quality as NetEaseSoundQuality\n  }\n  return 'exhigh'\n}\n\nconst getAudioSourceFromNetease = async (track: any): Promise<{ [key: string]: any }> => {\n  const requestedLevel = normalizeNeteaseQuality(store.get('settings.musicQuality'))\n  const startIndex = NETEASE_QUALITY_ORDER.indexOf(requestedLevel)\n  const fallbackLevels = NETEASE_QUALITY_ORDER.slice(Math.max(0, startIndex))\n\n  for (const level of fallbackLevels) {\n    try {\n      const result = await request({\n        url: '/song/url/v1',\n        method: 'get',\n        params: { id: track.id, level }\n      })\n      const item = result?.data?.[0]\n      const br = item?.br || 128000\n      const gain = item?.gain || 0\n      const peak = item?.peak || 1\n      if (!item?.url || item.freeTrialInfo !== null) continue\n\n      return {\n        url: item.url.replace(/^http:/, 'https:'),\n        br,\n        gain,\n        peak,\n        level: item.level || level\n      }\n    } catch (error) {\n      log.warn(`[NetEase] ${level} 音质获取失败，尝试较低音质`, error)\n    }\n  }\n\n  const url = `https://music.163.com/song/media/outer/url?id=${track.id}`\n  return { url, br: 128000, gain: 0, peak: 1, level: 'standard' }\n}''',
)

# Modern recent-play list while keeping the legacy weekly ranking as a fallback-compatible view.
replace_once(
    "src/renderer/store/data.ts",
    "import { getPlaylistDetail } from '../api/playlist'",
    "import { getPlaylistDetail } from '../api/playlist'\nimport { recentSongs } from '../api/discovery'",
)

replace_once(
    "src/renderer/store/data.ts",
    '''    const fetchPlayHistory = () => {\n      if (!isAccountLoggedIn()) return\n      return Promise.all([\n        userPlayHistory({ uid: user.value.userId as number, type: 0 }),\n        userPlayHistory({ uid: user.value.userId as number, type: 1 })\n      ]).then((result) => {\n        const data: { allData: any[]; weekData: any[] } = { allData: [], weekData: [] }\n        const dataType = { 0: 'allData', 1: 'weekData' }\n        if (result[0] && result[1]) {\n          for (let i = 0; i < result.length; i++) {\n            const songData = result[i][dataType[i]].map((item) => {\n              const song = item.song\n              song.playCount = item.playCount\n              return song\n            })\n            data[dataType[i] as 'weekData' | 'allData'] = songData\n          }\n          liked.playHistory = data\n        }\n      })\n    }''',
    '''    const normalizeHistoryTrack = (item: any) => {\n      const track = item?.data ?? item?.song ?? item\n      if (!track?.id) return null\n      return {\n        ...track,\n        type: 'online',\n        matched: true,\n        playCount: item?.playCount ?? track.playCount\n      }\n    }\n\n    const fetchPlayHistory = async () => {\n      if (!isAccountLoggedIn()) return\n\n      const weekPromise = userPlayHistory({ uid: user.value.userId as number, type: 1 })\n      const recentPromise = recentSongs(100).catch(async (error) => {\n        console.warn('[Data] 新版最近播放接口失败，回退旧版全部记录：', error)\n        return await userPlayHistory({ uid: user.value.userId as number, type: 0 })\n      })\n\n      const [weekResult, recentResult] = await Promise.all([weekPromise, recentPromise])\n      const weekData = Array.isArray(weekResult?.weekData)\n        ? weekResult.weekData.map(normalizeHistoryTrack).filter(Boolean)\n        : []\n\n      const recentItems = Array.isArray(recentResult?.data?.list)\n        ? recentResult.data.list\n        : Array.isArray(recentResult?.data)\n          ? recentResult.data\n          : Array.isArray(recentResult?.list)\n            ? recentResult.list\n            : Array.isArray(recentResult?.allData)\n              ? recentResult.allData\n              : []\n      const allData = recentItems.map(normalizeHistoryTrack).filter(Boolean)\n\n      liked.playHistory = { weekData, allData }\n    }''',
)

# Track context actions: daily recommendation dislike feedback and cloud-disk delete.
replace_once(
    "src/renderer/components/VirtualTrackList.vue",
    "import { serviceName, Track } from '@/types/music.d'",
    "import { serviceName, Track } from '@/types/music.d'\nimport { deleteCloudSong, dislikeRecommendSong } from '../api/discovery'\nimport { useDataStore } from '../store/data'",
)

replace_once(
    "src/renderer/components/VirtualTrackList.vue",
    '''    <div\n      v-if="type !== 'cloudDisk' && rightClickedTrackComputed.matched"\n      class="item"\n      @click="openComment"\n      >{{ $t('contextMenu.showComment') }}</div\n    >''',
    '''    <div\n      v-if="type !== 'cloudDisk' && rightClickedTrackComputed.matched"\n      class="item"\n      @click="openComment"\n      >{{ $t('contextMenu.showComment') }}</div\n    >\n    <div v-if="id === '/daily/songs'" class="item" @click="dislikeDailyRecommendation">\n      不感兴趣\n    </div>\n    <div v-if="type === 'cloudDisk'" class="item danger" @click="deleteFromCloudDisk">\n      从云盘删除\n    </div>''',
)

replace_once(
    "src/renderer/components/VirtualTrackList.vue",
    '''const stateStore = useNormalStateStore()\nconst { showToast } = stateStore\nconst { addTrackToPlaylistModal, accurateMatchModal } = storeToRefs(stateStore)''',
    '''const stateStore = useNormalStateStore()\nconst { showToast } = stateStore\nconst { addTrackToPlaylistModal, accurateMatchModal } = storeToRefs(stateStore)\nconst dataStore = useDataStore()''',
)

replace_once(
    "src/renderer/components/VirtualTrackList.vue",
    '''const openComment = () => {\n  showComment.value = true\n}\n''',
    '''const openComment = () => {\n  showComment.value = true\n}\n\nconst dislikeDailyRecommendation = async () => {\n  const trackId = Number(rightClickedTrack.value.id)\n  if (!Number.isFinite(trackId) || trackId <= 0) return\n  if (!isAccountLoggedIn()) {\n    showToast(t('toast.needToLogin'))\n    return\n  }\n  try {\n    await dislikeRecommendSong(trackId)\n    removeTrack(rightClickedTrackIndex.value)\n    trackListMenuRef.value?.closeMenu?.()\n    showToast('已减少此类推荐')\n  } catch (error) {\n    console.warn('[DailyTracks] 提交不感兴趣失败:', error)\n    showToast('操作失败，请稍后重试')\n  }\n}\n\nconst deleteFromCloudDisk = async () => {\n  const rawTrack: any = rightClickedTrack.value\n  const trackId = Number(rawTrack.songId ?? rawTrack.simpleSong?.id ?? rawTrack.id)\n  const trackName = rawTrack.simpleSong?.name ?? rawTrack.name ?? '这首歌曲'\n  if (!Number.isFinite(trackId) || trackId <= 0) return\n  if (!confirm(`确定要从网易云云盘删除 ${trackName}？此操作会同步到网易云账号。`)) return\n\n  try {\n    await deleteCloudSong(trackId)\n    await dataStore.fetchCloudDisk()\n    trackListMenuRef.value?.closeMenu?.()\n    showToast('已从云盘删除')\n  } catch (error) {\n    console.warn('[CloudDisk] 删除云盘歌曲失败:', error)\n    showToast('云盘删除失败，请稍后重试')\n  }\n}\n''',
)

replace_once(
    "src/renderer/components/VirtualTrackList.vue",
    '''.track-item {\n  width: 100%;\n  // padding-bottom: 4px;\n}''',
    '''.track-item {\n  width: 100%;\n  // padding-bottom: 4px;\n}\n\n.danger {\n  color: #d94a4a;\n}''',
)

print("Applied NetEase integration patches.")
