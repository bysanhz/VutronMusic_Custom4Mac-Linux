"""
Apply functional Classic volume step buttons and localized tooltips once.

The helper performs exact replacements on an isolated branch and is removed
before the verified result commit.
"""

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"Expected source pattern not found in {path}: {old[:120]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


common = "src/renderer/components/CommonPlayer.vue"

replace_once(
    common,
    """              ><button-icon :title="$t('player.volume')">
                <svg-icon icon-class="volume-half" /></button-icon
""",
    """              ><button-icon :title="$t('player.volumeDown')" @click="adjustVolume(-0.05)">
                <svg-icon icon-class="volume-half" /></button-icon
""",
)
replace_once(
    common,
    """              <button-icon :title="$t('player.volume')">
                <svg-icon icon-class="volume" /></button-icon
""",
    """              <button-icon :title="$t('player.volumeUp')" @click="adjustVolume(0.05)">
                <svg-icon icon-class="volume" /></button-icon
""",
)
replace_once(
    common,
    """const formatTime = (time: number) => {
  time = Math.round(time)
  const minutes = Math.floor(time / 60)
  const remainingSeconds = Math.ceil(time % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

""",
    """const formatTime = (time: number) => {
  time = Math.round(time)
  const minutes = Math.floor(time / 60)
  const remainingSeconds = Math.ceil(time % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

const adjustVolume = (delta: number) => {
  const nextVolume = Math.min(1, Math.max(0, volume.value + delta))
  volume.value = Math.round(nextVolume * 100) / 100
}

""",
)

locale_entries = {
    "src/renderer/locales/zh-hans.json": (
        '    "volume": "音量",\n',
        '    "volume": "音量",\n    "volumeDown": "降低音量",\n    "volumeUp": "提高音量",\n',
    ),
    "src/renderer/locales/zh-hant.json": (
        '    "volume": "音量",\n',
        '    "volume": "音量",\n    "volumeDown": "降低音量",\n    "volumeUp": "提高音量",\n',
    ),
    "src/renderer/locales/en.json": (
        '    "volume": "Volume",\n',
        '    "volume": "Volume",\n    "volumeDown": "Volume down",\n    "volumeUp": "Volume up",\n',
    ),
}
for path, (old, new) in locale_entries.items():
    replace_once(path, old, new)

anchor = "  test('keeps Classic track metadata readable and player actions self-describing', () => {"
regression = """  test('makes Classic volume step icons functional and self-describing', () => {\n    const commonPlayer = readSource('src/renderer/components/CommonPlayer.vue')\n    const zhHans = readSource('src/renderer/locales/zh-hans.json')\n    const zhHant = readSource('src/renderer/locales/zh-hant.json')\n    const en = readSource('src/renderer/locales/en.json')\n\n    expect(commonPlayer).toContain('@click=\"adjustVolume(-0.05)\"')\n    expect(commonPlayer).toContain('@click=\"adjustVolume(0.05)\"')\n    expect(commonPlayer).toContain("$t('player.volumeDown')")\n    expect(commonPlayer).toContain("$t('player.volumeUp')")\n    expect(commonPlayer).toContain('Math.min(1, Math.max(0, volume.value + delta))')\n    expect(commonPlayer).toContain('Math.round(nextVolume * 100) / 100')\n    for (const locale of [zhHans, zhHant, en]) {\n      expect(locale).toContain('\\\"volumeDown\\\"')\n      expect(locale).toContain('\\\"volumeUp\\\"')\n    }\n  })\n\n"""
replace_once("tests/feature-regression.spec.ts", anchor, regression + anchor)
