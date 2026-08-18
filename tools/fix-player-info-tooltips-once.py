"""
Apply the Classic player track-info and hover-tooltip improvements once.

This helper patches exact source patterns on an isolated branch. The workflow
removes this file before validation so it never lands in the final source tree.
"""

from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        raise RuntimeError(f"Expected source pattern not found in {path}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


# CommonPlayer: use the available track-info height instead of truncating both
# lines to a single row, and add hover descriptions to previously unlabeled
# controls.
replace_once(
    "src/renderer/components/CommonPlayer.vue",
    '<div class="transPro" @click="switchTransitionMode">',
    '<div\n                  class="transPro"\n                  :title="$t(\'player.fullPlayer.translationMode\')"\n                  @click="switchTransitionMode"\n                >',
)
replace_once(
    "src/renderer/components/CommonPlayer.vue",
    '<button-icon class="button" @click="addTrackToPlaylist"',
    '<button-icon\n                  class="button"\n                  :title="$t(\'player.addToPlaylist\')"\n                  @click="addTrackToPlaylist"',
)
replace_once(
    "src/renderer/components/CommonPlayer.vue",
    '<button-icon class="button" :prevent-blur="true" @click="showContextMenu">',
    '<button-icon\n                  class="button"\n                  :title="$t(\'player.fullPlayer.moreOptions\')"\n                  :prevent-blur="true"\n                  @click="showContextMenu"\n                >',
)
replace_once(
    "src/renderer/components/CommonPlayer.vue",
    '<button-icon :class="{ active: shuffle }" @click="shuffle = !shuffle"',
    '<button-icon\n              :class="{ active: shuffle }"\n              :title="$t(\'player.shuffle\')"\n              @click="shuffle = !shuffle"',
)
replace_once(
    "src/renderer/components/CommonPlayer.vue",
    '<button-icon> <svg-icon icon-class="volume-half" /></button-icon',
    '<button-icon :title="$t(\'player.volume\')"> <svg-icon icon-class="volume-half" /></button-icon',
)
replace_once(
    "src/renderer/components/CommonPlayer.vue",
    '<button-icon> <svg-icon icon-class="volume" /></button-icon',
    '<button-icon :title="$t(\'player.volume\')"> <svg-icon icon-class="volume" /></button-icon',
)
replace_once(
    "src/renderer/components/CommonPlayer.vue",
    ':title="$t(playing ? \'player.play\' : \'player.pause\')"',
    ':title="$t(playing ? \'player.pause\' : \'player.play\')"',
)
replace_once(
    "src/renderer/components/CommonPlayer.vue",
    ':title="source"',
    ':title="currentTrack?.name || source"',
)
replace_once(
    "src/renderer/components/CommonPlayer.vue",
    '<div class="subtitle">',
    '<div class="subtitle" :title="`${artist.name} - ${album.name}`">',
)

common_path = "src/renderer/components/CommonPlayer.vue"
common_text = read(common_path)
block_start = common_text.index("      .bottom-track-info {")
block_end = common_text.index("      // =========== newADD end ========", block_start)
block = common_text[block_start:block_end]
if block.count("-webkit-line-clamp: 1;") != 2 or block.count("line-clamp: 1;") != 2:
    raise RuntimeError("Unexpected bottom-track-info clamp structure")
block = block.replace("-webkit-line-clamp: 1;", "-webkit-line-clamp: 2;")
block = block.replace("line-clamp: 1;", "line-clamp: 2;")
block = block.replace("justify-content: center;", "justify-content: flex-start;", 1)
block = block.replace("padding: 10px 14px;", "padding: 11px 14px;")
common_text = common_text[:block_start] + block + common_text[block_end:]
write(common_path, common_text)


# PlayerPage: label the top/right player tools and make the tab-switch tooltip
# reactive to the current locale.
replace_once(
    "src/renderer/views/PlayPage.vue",
    'class="player-button theme-button"\n            @click="setThemeModal = !setThemeModal"',
    'class="player-button theme-button"\n            :title="$t(\'player.fullPlayer.theme\')"\n            @click="setThemeModal = !setThemeModal"',
)
replace_once(
    "src/renderer/views/PlayPage.vue",
    '<button-icon class="player-button close-button" @click="showLyrics = !showLyrics">',
    '<button-icon\n            class="player-button close-button"\n            :title="$t(\'player.fullPlayer.collapse\')"\n            @click="showLyrics = !showLyrics"\n          >',
)
replace_once(
    "src/renderer/views/PlayPage.vue",
    'title="重置播放器主题"',
    ':title="$t(\'player.fullPlayer.resetTheme\')"',
)
replace_once(
    "src/renderer/views/PlayPage.vue",
    'title="换场景"',
    ':title="$t(\'player.fullPlayer.changeScene\')"',
)
replace_once(
    "src/renderer/views/PlayPage.vue",
    "import { TrackSourceType } from '@/types/music.d'",
    "import { TrackSourceType } from '@/types/music.d'\nimport { useI18n } from 'vue-i18n'",
)
replace_once(
    "src/renderer/views/PlayPage.vue",
    "const playPageContextMenu = ref<InstanceType<typeof ContextMenu>>()",
    "const { t } = useI18n()\nconst playPageContextMenu = ref<InstanceType<typeof ContextMenu>>()",
)
replace_once(
    "src/renderer/views/PlayPage.vue",
    "const nextTabTitle = computed(() => {\n  if (nextTab.value === 'comment') return '查看评论'\n  if (tabs.value[tabIdx.value] === 'comment') return '返回歌词'\n  return nextTab.value === 'pickLyric' ? '显示精选歌词' : '显示完整歌词'\n})",
    "const nextTabTitle = computed(() => {\n  if (nextTab.value === 'comment') return t('player.fullPlayer.viewComments')\n  if (tabs.value[tabIdx.value] === 'comment') return t('player.fullPlayer.backToLyrics')\n  return nextTab.value === 'pickLyric'\n    ? t('player.fullPlayer.showSelectedLyrics')\n    : t('player.fullPlayer.showFullLyrics')\n})",
)


# LyricPage: translate and complete the global timing control hover text.
replace_once(
    "src/renderer/components/LyricPage.vue",
    'title="提前0.5s；按住 Shift 精调0.1s（应用于所有歌曲）"',
    ':title="$t(\'player.fullPlayer.lyricOffsetAdvance\')"',
)
replace_once(
    "src/renderer/components/LyricPage.vue",
    'title="延后0.5s；按住 Shift 精调0.1s（应用于所有歌曲）"',
    ':title="$t(\'player.fullPlayer.lyricOffsetDelay\')"',
)
replace_once(
    "src/renderer/components/LyricPage.vue",
    "import LyricLine from './LyricLine.vue'",
    "import LyricLine from './LyricLine.vue'\nimport { useI18n } from 'vue-i18n'",
)
replace_once(
    "src/renderer/components/LyricPage.vue",
    "const props = defineProps({",
    "const { t } = useI18n()\n\nconst props = defineProps({",
)
replace_once(
    "src/renderer/components/LyricPage.vue",
    "const offset = computed(() => {\n  const lrcOffset = globalLyricOffset.value\n  if (lrcOffset === 0) {\n    return '所有歌曲：未调整'\n  } else if (lrcOffset > 0) {\n    return `所有歌曲：提前${lrcOffset}s`\n  } else {\n    return `所有歌曲：延后${Math.abs(lrcOffset)}s`\n  }\n})",
    "const offset = computed(() => {\n  const lrcOffset = globalLyricOffset.value\n  if (lrcOffset === 0) {\n    return t('player.fullPlayer.lyricOffsetNone')\n  } else if (lrcOffset > 0) {\n    return t('player.fullPlayer.lyricOffsetAhead', { seconds: lrcOffset })\n  } else {\n    return t('player.fullPlayer.lyricOffsetBehind', { seconds: Math.abs(lrcOffset) })\n  }\n})",
)


# Add the shared tooltip strings to all three language packs without
# reformatting the rest of the JSON files.
locale_insertions = {
    "src/renderer/locales/zh-hans.json": (
        '    "like": "喜欢",\n',
        '    "like": "喜欢",\n'
        '    "fullPlayer": {\n'
        '      "translationMode": "切换歌词翻译/音译",\n'
        '      "moreOptions": "更多操作",\n'
        '      "theme": "播放器主题",\n'
        '      "collapse": "收起播放器",\n'
        '      "resetTheme": "重置播放器主题",\n'
        '      "changeScene": "换场景",\n'
        '      "viewComments": "查看评论",\n'
        '      "backToLyrics": "返回歌词",\n'
        '      "showSelectedLyrics": "显示精选歌词",\n'
        '      "showFullLyrics": "显示完整歌词",\n'
        '      "lyricOffsetAdvance": "提前 0.5 秒；按住 Shift 精调 0.1 秒（应用于所有歌曲）",\n'
        '      "lyricOffsetDelay": "延后 0.5 秒；按住 Shift 精调 0.1 秒（应用于所有歌曲）",\n'
        '      "lyricOffsetNone": "所有歌曲：未调整",\n'
        '      "lyricOffsetAhead": "所有歌曲：提前 {seconds}s",\n'
        '      "lyricOffsetBehind": "所有歌曲：延后 {seconds}s"\n'
        '    },\n',
    ),
    "src/renderer/locales/zh-hant.json": (
        '    "like": "喜歡",\n',
        '    "like": "喜歡",\n'
        '    "fullPlayer": {\n'
        '      "translationMode": "切換歌詞翻譯/音譯",\n'
        '      "moreOptions": "更多操作",\n'
        '      "theme": "播放器主題",\n'
        '      "collapse": "收起播放器",\n'
        '      "resetTheme": "重設播放器主題",\n'
        '      "changeScene": "切換場景",\n'
        '      "viewComments": "查看評論",\n'
        '      "backToLyrics": "返回歌詞",\n'
        '      "showSelectedLyrics": "顯示精選歌詞",\n'
        '      "showFullLyrics": "顯示完整歌詞",\n'
        '      "lyricOffsetAdvance": "提前 0.5 秒；按住 Shift 精調 0.1 秒（套用至所有歌曲）",\n'
        '      "lyricOffsetDelay": "延後 0.5 秒；按住 Shift 精調 0.1 秒（套用至所有歌曲）",\n'
        '      "lyricOffsetNone": "所有歌曲：未調整",\n'
        '      "lyricOffsetAhead": "所有歌曲：提前 {seconds}s",\n'
        '      "lyricOffsetBehind": "所有歌曲：延後 {seconds}s"\n'
        '    },\n',
    ),
    "src/renderer/locales/en.json": (
        '    "like": "Like",\n',
        '    "like": "Like",\n'
        '    "fullPlayer": {\n'
        '      "translationMode": "Switch lyric translation/romanization",\n'
        '      "moreOptions": "More options",\n'
        '      "theme": "Player theme",\n'
        '      "collapse": "Collapse player",\n'
        '      "resetTheme": "Reset player theme",\n'
        '      "changeScene": "Change scene",\n'
        '      "viewComments": "View comments",\n'
        '      "backToLyrics": "Back to lyrics",\n'
        '      "showSelectedLyrics": "Show selected lyrics",\n'
        '      "showFullLyrics": "Show full lyrics",\n'
        '      "lyricOffsetAdvance": "Advance 0.5 s; hold Shift for 0.1 s fine adjustment (all tracks)",\n'
        '      "lyricOffsetDelay": "Delay 0.5 s; hold Shift for 0.1 s fine adjustment (all tracks)",\n'
        '      "lyricOffsetNone": "All tracks: no adjustment",\n'
        '      "lyricOffsetAhead": "All tracks: {seconds}s earlier",\n'
        '      "lyricOffsetBehind": "All tracks: {seconds}s later"\n'
        '    },\n',
    ),
}

for path, (anchor, replacement) in locale_insertions.items():
    replace_once(path, anchor, replacement)


# Regression coverage for both the denser track-info card and the tooltip audit.
test_path = "tests/feature-regression.spec.ts"
test_anchor = "  test('routes Linux update checks through the Electron session network stack', () => {"
test_block = """  test('uses the Classic track-info space and labels player controls', () => {\n    const commonPlayer = readSource('src/renderer/components/CommonPlayer.vue')\n    const playPage = readSource('src/renderer/views/PlayPage.vue')\n    const lyricPage = readSource('src/renderer/components/LyricPage.vue')\n    const zhHans = readSource('src/renderer/locales/zh-hans.json')\n\n    expect(commonPlayer).toContain(':title=\"currentTrack?.name || source\"')\n    expect(commonPlayer).toContain(':title=\"`${artist.name} - ${album.name}`\"')\n    expect(commonPlayer).toContain('-webkit-line-clamp: 2')\n    expect(commonPlayer).toContain(\"$t('player.fullPlayer.moreOptions')\")\n    expect(commonPlayer).toContain(\"$t('player.shuffle')\")\n    expect(commonPlayer).toContain(\"playing ? 'player.pause' : 'player.play'\")\n    expect(playPage).toContain(\"$t('player.fullPlayer.theme')\")\n    expect(playPage).toContain(\"t('player.fullPlayer.viewComments')\")\n    expect(lyricPage).toContain(\"$t('player.fullPlayer.lyricOffsetAdvance')\")\n    expect(lyricPage).toContain(\"t('player.fullPlayer.lyricOffsetNone')\")\n    expect(zhHans).toContain('\"fullPlayer\"')\n    expect(zhHans).toContain('\"moreOptions\": \"更多操作\"')\n  })\n\n"""
replace_once(test_path, test_anchor, test_block + test_anchor)
