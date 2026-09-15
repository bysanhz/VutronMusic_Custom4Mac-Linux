from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new in text:
            return text
        raise SystemExit(f"missing replacement target: {label}")
    return text.replace(old, new, 1)


# 1) Make `liked` a ref so persisted hydration cannot detach the store-facing
# value from the setup-store closure. Normalize stale/null persisted data after hydrate.
path = Path("src/renderer/store/data.ts")
text = path.read_text()
text = replace_once(text, "import { ref, reactive } from 'vue'", "import { ref } from 'vue'", "data import")

marker = "interface LikedState {"
if marker not in text:
    insert_at = text.index("\n\nexport const useDataStore")
    helpers = """

interface LikedState {
  songs: number[]
  songsWithDetails: any[]
  playlists: any[]
  albums: any[]
  artists: any[]
  mvs: any[]
  cloudDisk: any[]
  playHistory: {
    weekData: any[]
    allData: any[]
  }
}

const createDefaultLikedState = (): LikedState => ({
  songs: [],
  songsWithDetails: [],
  playlists: [],
  albums: [],
  artists: [],
  mvs: [],
  cloudDisk: [],
  playHistory: {
    weekData: [],
    allData: []
  }
})

const normalizeLikedState = (value: any): LikedState => ({
  songs: normalizeTrackIDs(Array.isArray(value?.songs) ? value.songs : []),
  songsWithDetails: Array.isArray(value?.songsWithDetails) ? value.songsWithDetails : [],
  playlists: Array.isArray(value?.playlists) ? value.playlists : [],
  albums: Array.isArray(value?.albums) ? value.albums : [],
  artists: Array.isArray(value?.artists) ? value.artists : [],
  mvs: Array.isArray(value?.mvs) ? value.mvs : [],
  cloudDisk: Array.isArray(value?.cloudDisk) ? value.cloudDisk : [],
  playHistory: {
    weekData: Array.isArray(value?.playHistory?.weekData) ? value.playHistory.weekData : [],
    allData: Array.isArray(value?.playHistory?.allData) ? value.playHistory.allData : []
  }
})
"""
    text = text[:insert_at] + helpers + text[insert_at:]

old_decl_start = "    const liked = reactive<{"
if old_decl_start in text:
    start = text.index(old_decl_start)
    end = text.index("\n\n    const { showToast }", start)
    text = text[:start] + "    const liked = ref<LikedState>(createDefaultLikedState())" + text[end:]

body_start = text.index("    const { showToast }")
body_end = text.index("\n\n    return {", body_start)
body = text[body_start:body_end].replace("liked.", "liked.value.")
text = text[:body_start] + body + text[body_end:]

persist_old = """    persist: {
      pick: ['user', 'likedSongPlaylistID', 'lastRefreshCookieDate', 'loginMode', 'liked.songs']
    }"""
persist_new = """    persist: {
      afterHydrate: ({ store }) => {
        const hydratedStore = store as unknown as { liked?: unknown }
        hydratedStore.liked = normalizeLikedState(hydratedStore.liked)
      },
      pick: ['user', 'likedSongPlaylistID', 'lastRefreshCookieDate', 'loginMode', 'liked.songs']
    }"""
text = replace_once(text, persist_old, persist_new, "liked hydration normalization")
path.write_text(text)


# 2) Library uses one outer scroll flow, but only mounts the active tab and only
# renders a bounded cover batch. This avoids both the old nested-scroll handoff and
# the regression where disabling virtualization rendered every hidden tab at once.
path = Path("src/renderer/views/LibraryMusic.vue")
text = path.read_text()

template_end = text.index("</template>")
template = text[:template_end].replace("liked.", "libraryData.")
text = template + text[template_end:]
text = text.replace('<div v-show="currentTab ===', '<div v-if="currentTab ===')

text = replace_once(text, ':items="filterPlaylists"', ':items="visiblePlaylists"', "visible playlists")
text = replace_once(
    text,
    """            :enable-virtual-scroll="false"
            :is-end="true"
            :padding-bottom="96"
          />""",
    """            :enable-virtual-scroll="false"
            :is-end="visiblePlaylists.length >= filterPlaylists.length"
            :padding-bottom="96"
            :load-more="loadMorePlaylists"
          />""",
    "playlist local paging",
)
text = replace_once(text, ':items="libraryData.albums"', ':items="visibleAlbums"', "visible albums")
text = replace_once(
    text,
    """            :enable-virtual-scroll="false"
            :is-end="true"
            :padding-bottom="96"
          />""",
    """            :enable-virtual-scroll="false"
            :is-end="visibleAlbums.length >= libraryData.albums.length"
            :padding-bottom="96"
            :load-more="loadMoreAlbums"
          />""",
    "album local paging",
)
text = replace_once(text, ':items="libraryData.artists"', ':items="visibleArtists"', "visible artists")
text = replace_once(
    text,
    """            :enable-virtual-scroll="false"
            :is-end="true"
            :padding-bottom="96"
          />""",
    """            :enable-virtual-scroll="false"
            :is-end="visibleArtists.length >= libraryData.artists.length"
            :padding-bottom="96"
            :load-more="loadMoreArtists"
          />""",
    "artist local paging",
)

text = text.replace(
    "import { ref, computed, onMounted, onUnmounted, inject, nextTick } from 'vue'",
    "import { ref, computed, onMounted, onUnmounted, inject, nextTick, watch } from 'vue'",
)

script_start = text.index('<script setup lang="ts">')
script_end = text.index("</script>", script_start)
script = text[script_start:script_end].replace("liked.value", "libraryData.value")
text = text[:script_start] + script + text[script_end:]

anchor = """const tabsRowRef = ref()

const hasCustomTitleBar"""
view_model = """const tabsRowRef = ref()

const libraryData = computed(() => {
  const value = liked.value
  return {
    songs: Array.isArray(value?.songs) ? value.songs : [],
    songsWithDetails: Array.isArray(value?.songsWithDetails) ? value.songsWithDetails : [],
    playlists: Array.isArray(value?.playlists) ? value.playlists : [],
    albums: Array.isArray(value?.albums) ? value.albums : [],
    artists: Array.isArray(value?.artists) ? value.artists : [],
    mvs: Array.isArray(value?.mvs) ? value.mvs : [],
    cloudDisk: Array.isArray(value?.cloudDisk) ? value.cloudDisk : [],
    playHistory: {
      weekData: Array.isArray(value?.playHistory?.weekData) ? value.playHistory.weekData : [],
      allData: Array.isArray(value?.playHistory?.allData) ? value.playHistory.allData : []
    }
  }
})

const COVER_PAGE_SIZE = 40
const playlistVisibleLimit = ref(COVER_PAGE_SIZE)
const albumVisibleLimit = ref(COVER_PAGE_SIZE)
const artistVisibleLimit = ref(COVER_PAGE_SIZE)

const hasCustomTitleBar"""
text = replace_once(text, anchor, view_model, "library null-safe view model")

filter_end = """  return playlists
})

const playHistoryList = computed"""
paging = """  return playlists
})

const visiblePlaylists = computed(() =>
  filterPlaylists.value.slice(0, playlistVisibleLimit.value)
)
const visibleAlbums = computed(() =>
  libraryData.value.albums.slice(0, albumVisibleLimit.value)
)
const visibleArtists = computed(() =>
  libraryData.value.artists.slice(0, artistVisibleLimit.value)
)

const loadMorePlaylists = () => {
  playlistVisibleLimit.value = Math.min(
    filterPlaylists.value.length,
    playlistVisibleLimit.value + COVER_PAGE_SIZE
  )
}
const loadMoreAlbums = () => {
  albumVisibleLimit.value = Math.min(
    libraryData.value.albums.length,
    albumVisibleLimit.value + COVER_PAGE_SIZE
  )
}
const loadMoreArtists = () => {
  artistVisibleLimit.value = Math.min(
    libraryData.value.artists.length,
    artistVisibleLimit.value + COVER_PAGE_SIZE
  )
}

watch(playlistFilter, () => {
  playlistVisibleLimit.value = COVER_PAGE_SIZE
})

const playHistoryList = computed"""
text = replace_once(text, filter_end, paging, "library cover paging")

old_tail = """  fetchLikedAlbums()
  fetchLikedArtists()
  fetchLikedMVs()
  fetchPlayHistory()
  fetchCloudDisk()
}"""
new_tail = """  void Promise.allSettled([
    Promise.resolve().then(() => fetchLikedAlbums()),
    Promise.resolve().then(() => fetchLikedArtists()),
    Promise.resolve().then(() => fetchLikedMVs()),
    Promise.resolve().then(() => fetchPlayHistory()),
    Promise.resolve().then(() => fetchCloudDisk())
  ])
}"""
text = replace_once(text, old_tail, new_tail, "background library loads")
text = replace_once(
    text,
    """  loadData()
  dailyTask()""",
    """  void loadData().catch((error) => {
    console.error('[Library] 加载音乐库失败:', error)
    tricklingProgress.done()
    show.value = true
  })
  dailyTask()""",
    "library load rejection guard",
)
path.write_text(text)


# 3) Regression coverage.
path = Path("tests/feature-regression.spec.ts")
text = path.read_text()
marker = "test.describe('library hydration and bounded rendering'"
if marker not in text:
    text += r'''

test.describe('library hydration and bounded rendering', () => {
  test('repairs nullable persisted liked state and avoids mounting unbounded hidden cover grids', () => {
    const dataStore = readSource('src/renderer/store/data.ts')
    const library = readSource('src/renderer/views/LibraryMusic.vue')

    expect(dataStore).toContain('const liked = ref<LikedState>(createDefaultLikedState())')
    expect(dataStore).toContain('afterHydrate: ({ store }) =>')
    expect(dataStore).toContain('normalizeLikedState(hydratedStore.liked)')
    expect(library).toContain('const libraryData = computed(() =>')
    expect(library).toContain('const COVER_PAGE_SIZE = 40')
    expect(library).toContain(':items="visiblePlaylists"')
    expect(library).toContain(':items="visibleAlbums"')
    expect(library).toContain(':items="visibleArtists"')
    expect(library).toContain('v-if="currentTab === \'playlist\'"')
    expect(library).toContain('Promise.allSettled([')
    expect(library).toContain("console.error('[Library] 加载音乐库失败:', error)")
  })
})
'''
path.write_text(text)
