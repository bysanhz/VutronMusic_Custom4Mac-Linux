"""
Apply the Classic track-info readability and full-player tooltip fixes once.

The helper performs exact replacements on an isolated branch, adds regression
coverage, and is removed by the verification workflow before the final commit.
"""

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"Expected source pattern not found in {path}: {old[:120]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


common = "src/renderer/components/CommonPlayer.vue"
play_page = "src/renderer/views/PlayPage.vue"

replace_once(common, '<div class="transPro" @click="switchTransitionMode">', '<div\n                  class="transPro"\n                  :title="$t(\'player.switchTranslation\')"\n                  @click="switchTransitionMode"\n                >')
replace_once(common, '<button-icon class="button" @click="addTrackToPlaylist"', '<button-icon\n                  class="button"\n                  :title="$t(\'player.addToPlaylist\')"\n                  @click="addTrackToPlaylist"')
replace_once(common, '<button-icon class="button" :prevent-blur="true" @click="showContextMenu">', '<button-icon\n                  class="button"\n                  :title="$t(\'player.moreActions\')"\n                  :prevent-blur="true"\n                  @click="showContextMenu"\n                >')
replace_once(common, ":title=\"$t(playing ? 'player.play' : 'player.pause')\"", ":title=\"$t(playing ? 'player.pause' : 'player.play')\"")
replace_once(common, '<button-icon :class="{ active: shuffle }" @click="shuffle = !shuffle"', '<button-icon\n              :class="{ active: shuffle }"\n              :title="$t(\'player.shuffle\')"\n              @click="shuffle = !shuffle"')
replace_once(common, '<button-icon> <svg-icon icon-class="volume-half" /></button-icon', '<button-icon :title="$t(\'player.volume\')"> <svg-icon icon-class="volume-half" /></button-icon')
replace_once(common, '<button-icon> <svg-icon icon-class="volume" /></button-icon', '<button-icon :title="$t(\'player.volume\')"> <svg-icon icon-class="volume" /></button-icon')
replace_once(common, ':title="source"', ':title="currentTrack?.name || \'\'"')
replace_once(common, '<div class="subtitle">\n              <router-link', '<div class="subtitle" :title="trackDetailsTitle">\n              <router-link')
replace_once(common, '  isLiked,\n  source,\n  chorus,', '  isLiked,\n  chorus,')
replace_once(common, "const album = computed(() => {\n  return currentTrack.value?.album ?? currentTrack.value?.al\n})\n", "const album = computed(() => {\n  return currentTrack.value?.album ?? currentTrack.value?.al\n})\n\nconst trackDetailsTitle = computed(() =>\n  [artist.value?.name, album.value?.name].filter(Boolean).join(' - ')\n)\n")
replace_once(common, '        min-height: 64px;', '        min-height: 76px;')
replace_once(common, '          -webkit-line-clamp: 1;\n          line-clamp: 1;\n          overflow: hidden;\n        }\n\n        .haslist {', '          -webkit-line-clamp: 2;\n          line-clamp: 2;\n          line-height: 1.28;\n          overflow: hidden;\n          overflow-wrap: anywhere;\n        }\n\n        .haslist {')
replace_once(common, '          -webkit-line-clamp: 1;\n          line-clamp: 1;\n          overflow: hidden;\n        }\n      }\n      // =========== newADD end ========', '          -webkit-line-clamp: 2;\n          line-clamp: 2;\n          line-height: 1.35;\n          overflow: hidden;\n          overflow-wrap: anywhere;\n        }\n      }\n      // =========== newADD end ========')

replace_once(play_page, '            v-show="tabs[tabIdx] !== \'comment\'"\n            class="player-button theme-button"', '            v-show="tabs[tabIdx] !== \'comment\'"\n            :title="$t(\'player.playerTheme\')"\n            class="player-button theme-button"')
replace_once(play_page, '<button-icon class="player-button close-button" @click="showLyrics = !showLyrics">', '<button-icon\n            :title="$t(\'player.collapsePlayer\')"\n            class="player-button close-button"\n            @click="showLyrics = !showLyrics"\n          >')
replace_once(play_page, 'title="重置播放器主题"', ':title="$t(\'player.resetPlayerTheme\')"')
replace_once(play_page, 'title="换场景"', ':title="$t(\'player.switchScene\')"')
replace_once(play_page, "import { ref, provide, computed, watch } from 'vue'\n", "import { ref, provide, computed, watch } from 'vue'\nimport { useI18n } from 'vue-i18n'\n")
replace_once(play_page, "const playPageContextMenu = ref<InstanceType<typeof ContextMenu>>()\n", "const playPageContextMenu = ref<InstanceType<typeof ContextMenu>>()\nconst { t } = useI18n()\n")
replace_once(play_page, "const nextTabTitle = computed(() => {\n  if (nextTab.value === 'comment') return '查看评论'\n  if (tabs.value[tabIdx.value] === 'comment') return '返回歌词'\n  return nextTab.value === 'pickLyric' ? '显示精选歌词' : '显示完整歌词'\n})", "const nextTabTitle = computed(() => {\n  if (nextTab.value === 'comment') return t('player.showComments')\n  if (tabs.value[tabIdx.value] === 'comment') return t('player.backToLyrics')\n  return nextTab.value === 'pickLyric'\n    ? t('player.showFeaturedLyrics')\n    : t('player.showFullLyrics')\n})")

locale_entries = {
    'src/renderer/locales/zh-hans.json': ('    "like": "喜欢",\n', '    "like": "喜欢",\n    "switchTranslation": "切换翻译/音译",\n    "moreActions": "更多操作",\n    "playerTheme": "播放器主题",\n    "collapsePlayer": "收起播放器",\n    "resetPlayerTheme": "重置播放器主题",\n    "switchScene": "切换场景",\n    "showComments": "查看评论",\n    "backToLyrics": "返回歌词",\n    "showFeaturedLyrics": "显示精选歌词",\n    "showFullLyrics": "显示完整歌词",\n'),
    'src/renderer/locales/zh-hant.json': ('    "like": "喜歡",\n', '    "like": "喜歡",\n    "switchTranslation": "切換翻譯/音譯",\n    "moreActions": "更多操作",\n    "playerTheme": "播放器主題",\n    "collapsePlayer": "收起播放器",\n    "resetPlayerTheme": "重設播放器主題",\n    "switchScene": "切換場景",\n    "showComments": "查看評論",\n    "backToLyrics": "返回歌詞",\n    "showFeaturedLyrics": "顯示精選歌詞",\n    "showFullLyrics": "顯示完整歌詞",\n'),
    'src/renderer/locales/en.json': ('    "like": "Like",\n', '    "like": "Like",\n    "switchTranslation": "Switch translation/romanization",\n    "moreActions": "More actions",\n    "playerTheme": "Player theme",\n    "collapsePlayer": "Collapse player",\n    "resetPlayerTheme": "Reset player theme",\n    "switchScene": "Switch scene",\n    "showComments": "Show comments",\n    "backToLyrics": "Back to lyrics",\n    "showFeaturedLyrics": "Show featured lyrics",\n    "showFullLyrics": "Show full lyrics",\n'),
}
for path, (old, new) in locale_entries.items():
    replace_once(path, old, new)

anchor = "  test('routes Linux update checks through the Electron session network stack', () => {"
regression = """  test('keeps Classic track metadata readable and player actions self-describing', () => {\n    const commonPlayer = readSource('src/renderer/components/CommonPlayer.vue')\n    const playPage = readSource('src/renderer/views/PlayPage.vue')\n    const zhHans = readSource('src/renderer/locales/zh-hans.json')\n    const zhHant = readSource('src/renderer/locales/zh-hant.json')\n    const en = readSource('src/renderer/locales/en.json')\n\n    expect(commonPlayer).toContain(':title=\"currentTrack?.name || \\\'\\\'\"')\n    expect(commonPlayer).toContain(':title=\"trackDetailsTitle\"')\n    expect(commonPlayer).toContain("$t('player.switchTranslation')")\n    expect(commonPlayer).toContain("$t('player.addToPlaylist')")\n    expect(commonPlayer).toContain("$t('player.moreActions')")\n    expect(commonPlayer).toContain("$t(playing ? 'player.pause' : 'player.play')")\n    expect(commonPlayer).toContain("$t('player.shuffle')")\n    expect(commonPlayer).toContain('-webkit-line-clamp: 2')\n    expect(playPage).toContain("$t('player.playerTheme')")\n    expect(playPage).toContain("$t('player.collapsePlayer')")\n    expect(playPage).toContain("t('player.showComments')")\n    for (const locale of [zhHans, zhHant, en]) {\n      expect(locale).toContain('\\\"switchTranslation\\\"')\n      expect(locale).toContain('\\\"collapsePlayer\\\"')\n      expect(locale).toContain('\\\"showFullLyrics\\\"')\n    }\n  })\n\n"""
replace_once('tests/feature-regression.spec.ts', anchor, regression + anchor)
