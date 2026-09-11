"""Finalize the NetEase API integration before removing this helper.

Usage:
    python tools/apply-netease-enhancements-once.py

Args:
    None.

Returns:
    Applies compatibility, reliability, and regression-test updates in-place.
"""

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, got {count}: {old[:100]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


# Respect the user's UnblockNetEaseMusic toggle instead of forcing it on whenever it is false.
replace_once(
    "src/main/utils/index.ts",
    "  const enableUNM = (store.get('settings.unblockNeteaseMusic.enable') as boolean) || true",
    "  const enableUNM = (store.get('settings.unblockNeteaseMusic.enable') as boolean | undefined) ?? true",
)

# Migrate persisted pre-v1 quality values so the new selector never opens in an unknown state.
replace_once(
    "src/renderer/store/settings.ts",
    '''    onMounted(() => {\n      const path = localMusic.scanDir as unknown''',
    '''    onMounted(() => {\n      const legacyMusicQualityMap = new Map<string | number, string>([\n        [128000, 'standard'],\n        [192000, 'higher'],\n        [320000, 'exhigh'],\n        ['flac', 'lossless'],\n        [999000, 'hires']\n      ])\n      const migratedMusicQuality = legacyMusicQualityMap.get(general.musicQuality)\n      if (migratedMusicQuality) general.musicQuality = migratedMusicQuality\n\n      const path = localMusic.scanDir as unknown''',
)

# Renderer requests intentionally resolve to null on HTTP errors. Fall back explicitly when the
# modern recent-play endpoint returns no usable payload instead of relying on Promise.catch().
replace_once(
    "src/renderer/store/data.ts",
    '''      const weekPromise = userPlayHistory({ uid: user.value.userId as number, type: 1 })\n      const recentPromise = recentSongs(100).catch(async (error) => {\n        console.warn('[Data] 新版最近播放接口失败，回退旧版全部记录：', error)\n        return await userPlayHistory({ uid: user.value.userId as number, type: 0 })\n      })\n\n      const [weekResult, recentResult] = await Promise.all([weekPromise, recentPromise])''',
    '''      const weekPromise = userPlayHistory({ uid: user.value.userId as number, type: 1 })\n      const recentPromise = (async () => {\n        const modernResult = await recentSongs(100)\n        const hasModernList =\n          Array.isArray(modernResult?.data?.list) ||\n          Array.isArray(modernResult?.data) ||\n          Array.isArray(modernResult?.list)\n        if (hasModernList) return modernResult\n\n        console.warn('[Data] 新版最近播放接口不可用，回退旧版全部记录')\n        return await userPlayHistory({ uid: user.value.userId as number, type: 0 })\n      })()\n\n      const [weekResult, recentResult] = await Promise.all([weekPromise, recentPromise])''',
)

# Mutation APIs also resolve to null on HTTP errors, so only update UI after an explicit success.
replace_once(
    "src/renderer/components/VirtualTrackList.vue",
    '''  try {\n    await dislikeRecommendSong(trackId)\n    removeTrack(rightClickedTrackIndex.value)''',
    '''  try {\n    const result = await dislikeRecommendSong(trackId)\n    if (!result || (result.code !== undefined && Number(result.code) !== 200)) {\n      throw new Error(result?.message || 'recommend dislike failed')\n    }\n    removeTrack(rightClickedTrackIndex.value)''',
)

replace_once(
    "src/renderer/components/VirtualTrackList.vue",
    '''  try {\n    await deleteCloudSong(trackId)\n    await dataStore.fetchCloudDisk()''',
    '''  try {\n    const result = await deleteCloudSong(trackId)\n    if (!result || (result.code !== undefined && Number(result.code) !== 200)) {\n      throw new Error(result?.message || 'cloud delete failed')\n    }\n    await dataStore.fetchCloudDisk()''',
)

# Seven discovery tabs still need to fit comfortably before the global search/avatar area.
replace_once(
    "src/renderer/components/NavBar.vue",
    '''  .item {\n    padding: 8px 14px;\n    cursor: pointer;\n    margin: 0 10px;\n    border-radius: 8px;\n    font-size: 18px;''',
    '''  .item {\n    flex: none;\n    padding: 8px 10px;\n    cursor: pointer;\n    margin: 0 5px;\n    border-radius: 8px;\n    white-space: nowrap;\n    font-size: 16px;''',
)

# Add a source-level regression contract for the API upgrade and new product surfaces.
test_path = Path("tests/feature-regression.spec.ts")
test_text = test_path.read_text(encoding="utf-8")
marker = "test.describe('modern NetEase API integration'"
if marker not in test_text:
    test_text += r'''

test.describe('modern NetEase API integration', () => {
  test('pins the upgraded API and uses level-based playback quality', () => {
    const packageJson = readSource('package.json')
    const mainUtils = readSource('src/main/utils/index.ts')
    const settings = readSource('src/renderer/views/SystemSettings.vue')

    expect(packageJson).toContain('"@neteasecloudmusicapienhanced/api": "4.40.1"')
    expect(mainUtils).toContain("url: '/song/url/v1'")
    expect(mainUtils).toContain("'jymaster'")
    expect(mainUtils).toContain("'vivid'")
    expect(mainUtils).toContain("'sky'")
    expect(settings).toContain("value: 'lossless'")
    expect(settings).toContain("value: 'hires'")
  })

  test('uses cloud search plus default and hot NetEase suggestions', () => {
    const searchPage = readSource('src/renderer/views/SearchPage.vue')
    const searchBox = readSource('src/renderer/components/SearchBox.vue')
    const navBar = readSource('src/renderer/components/NavBar.vue')

    expect(searchPage).toContain('cloudSearch')
    expect(searchPage).not.toContain("import { search } from '../api/other'")
    expect(searchBox).toContain('searchDefault')
    expect(searchBox).toContain('searchHotDetail')
    expect(navBar).toContain(':suggestions="true"')
  })

  test('exposes daily history, recommendation feedback, styles, new works, and cloud management', () => {
    const dailyTracks = readSource('src/renderer/views/DailyTracks.vue')
    const trackList = readSource('src/renderer/components/VirtualTrackList.vue')
    const explore = readSource('src/renderer/views/ExplorePage.vue')
    const dataStore = readSource('src/renderer/store/data.ts')

    expect(dailyTracks).toContain('historyRecommendSongsDetail')
    expect(trackList).toContain('dislikeRecommendSong')
    expect(trackList).toContain('deleteCloudSong')
    expect(explore).toContain('stylePreference')
    expect(explore).toContain('styleSongs')
    expect(explore).toContain('followedArtistNewSongs')
    expect(explore).toContain('followedArtistNewMvs')
    expect(dataStore).toContain('recentSongs(100)')
  })
})
'''
    test_path.write_text(test_text, encoding="utf-8")

print("Finalized NetEase API integration.")
