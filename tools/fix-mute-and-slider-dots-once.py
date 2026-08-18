"""Apply the mute-toggle and slider-position-dot UI fix once."""

from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}: found {count}\n{old}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


player_bar = Path("src/renderer/components/PlayerBar.vue")
replace_once(
    player_bar,
    """              :dot-style=\"{ display: 'none' }\"\n""",
    """              :dot-style=\"{\n                backgroundColor: 'var(--color-primary)',\n                border: '2px solid var(--color-body-bg)',\n                boxShadow: '0 1px 4px rgba(0, 0, 0, 0.18)'\n              }\"\n""",
)
replace_once(
    player_bar,
    """          <button-icon\n            ><svg-icon v-show=\"volume > 0.5\" icon-class=\"volume\" />\n""",
    """          <button-icon\n            :title=\"volume === 0 ? $t('player.unmute') : $t('player.mute')\"\n            @click.stop=\"toggleMute\"\n            ><svg-icon v-show=\"volume > 0.5\" icon-class=\"volume\" />\n""",
)
replace_once(
    player_bar,
    """  volume,\n  isLiked,\n""",
    """  volume,\n  volumeBeforeMuted,\n  isLiked,\n""",
)
replace_once(
    player_bar,
    """const updateVolume = (e: WheelEvent) => {\n  e.preventDefault()\n  const delta = e.deltaY < 0 ? 0.02 : -0.02\n  volume.value = Math.min(Math.max(volume.value + delta, 0), 1)\n}\n\n""",
    """const updateVolume = (e: WheelEvent) => {\n  e.preventDefault()\n  const delta = e.deltaY < 0 ? 0.02 : -0.02\n  volume.value = Math.min(Math.max(volume.value + delta, 0), 1)\n}\n\nconst toggleMute = () => {\n  if (volume.value > 0) {\n    volumeBeforeMuted.value = volume.value\n    volume.value = 0\n    return\n  }\n\n  const restoreVolume = Math.min(1, Math.max(0, Number(volumeBeforeMuted.value) || 1))\n  volume.value = restoreVolume\n}\n\n""",
)

slider = Path("src/renderer/components/VueSlider.vue")
replace_once(
    slider,
    """      <div v-if=\"marks.length\" class=\"vue-slider-marks\">\n        <div\n          v-for=\"mark of marks\"\n          :key=\"mark.toString()\"\n          class=\"vue-slider-mark\"\n          :style=\"mark.activeStyle\"\n        >\n          <div class=\"vue-slider-mark-step\" :style=\"stepStyle\"></div>\n          <div class=\"vue-slider-mark-label\" :style=\"mark.labelStyle\">{{ mark.label }}</div>\n        </div>\n      </div>\n""",
    """      <div v-if=\"marks.length\" class=\"vue-slider-marks\">\n        <div\n          v-for=\"mark of marks\"\n          :key=\"mark.toString()\"\n          class=\"vue-slider-mark\"\n          :style=\"mark.activeStyle\"\n        >\n          <div class=\"vue-slider-mark-step\" :style=\"stepStyle\"></div>\n          <div class=\"vue-slider-mark-label\" :style=\"mark.labelStyle\">{{ mark.label }}</div>\n        </div>\n      </div>\n      <div class=\"vue-slider-dot\" :style=\"dotStyle\"></div>\n""",
)
replace_once(
    slider,
    """const processStyle = computed(() => {\n""",
    """const normalizedValue = computed(() => {\n  const range = props.max - props.min\n  if (!Number.isFinite(range) || range <= 0) return 0\n  return Math.max(0, Math.min(1, (modelValue.value - props.min) / range))\n})\n\nconst dotStyle = computed(() => {\n  const pos = `${normalizedValue.value * 100}%`\n  const result: Style = {\n    width: `${props.dotSize}px`,\n    height: `${props.dotSize}px`,\n    background:\n      props.processStyle.background ??\n      props.processStyle.backgroundColor ??\n      'var(--color-primary)'\n  }\n\n  if (props.direction === 'ltr') {\n    result.left = pos\n    result.top = '50%'\n    result.transform = 'translate(-50%, -50%)'\n  } else if (props.direction === 'rtl') {\n    result.right = pos\n    result.top = '50%'\n    result.transform = 'translate(50%, -50%)'\n  } else if (props.direction === 'btt') {\n    result.bottom = pos\n    result.left = '50%'\n    result.transform = 'translate(-50%, 50%)'\n  } else {\n    result.top = pos\n    result.left = '50%'\n    result.transform = 'translate(-50%, -50%)'\n  }\n\n  return result\n})\n\nconst processStyle = computed(() => {\n""",
)
replace_once(
    slider,
    """.vue-slider-process {\n  position: absolute;\n  transition: all 0.3s;\n}\n\n""",
    """.vue-slider-process {\n  position: absolute;\n  transition: all 0.3s;\n}\n\n.vue-slider-dot {\n  position: absolute;\n  z-index: 3;\n  border: 2px solid var(--color-body-bg);\n  border-radius: 50%;\n  box-sizing: border-box;\n  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);\n  pointer-events: none;\n  transition: all 0.3s;\n}\n\n""",
)

locale_values = {
    "src/renderer/locales/zh-hans.json": "取消静音",
    "src/renderer/locales/zh-hant.json": "取消靜音",
    "src/renderer/locales/en.json": "Unmute",
}
for locale_path, unmute_text in locale_values.items():
    path = Path(locale_path)
    replace_once(
        path,
        '    "mute": ' + ('"静音",\n' if 'zh-hans' in locale_path else '"靜音",\n' if 'zh-hant' in locale_path else '"Mute",\n'),
        '    "mute": ' + ('"静音",\n' if 'zh-hans' in locale_path else '"靜音",\n' if 'zh-hant' in locale_path else '"Mute",\n')
        + f'    "unmute": "{unmute_text}",\n',
    )

tests = Path("tests/feature-regression.spec.ts")
text = tests.read_text(encoding="utf-8")
anchor = "  test('makes Classic volume step icons functional and self-describing', () => {"
if anchor not in text:
    raise RuntimeError("Could not find volume-step regression anchor")
new_test = """  test('toggles PlayerBar mute and keeps continuous sliders position-aware', () => {\n    const playerBar = readSource('src/renderer/components/PlayerBar.vue')\n    const slider = readSource('src/renderer/components/VueSlider.vue')\n    const zhHans = readSource('src/renderer/locales/zh-hans.json')\n    const zhHant = readSource('src/renderer/locales/zh-hant.json')\n    const en = readSource('src/renderer/locales/en.json')\n\n    expect(playerBar).toContain('@click.stop=\"toggleMute\"')\n    expect(playerBar).toContain('volumeBeforeMuted.value = volume.value')\n    expect(playerBar).toContain('volume.value = restoreVolume')\n    expect(playerBar).toContain("$t('player.unmute')")\n    expect(playerBar).not.toContain(\":dot-style=\\\"{ display: 'none' }\\\"\")\n    expect(slider).toContain('class=\"vue-slider-dot\"')\n    expect(slider).toContain('const dotStyle = computed')\n    expect(slider).toContain('normalizedValue.value * 100')\n    for (const locale of [zhHans, zhHant, en]) {\n      expect(locale).toContain('\\\"unmute\\\"')\n    }\n  })\n\n"""
tests.write_text(text.replace(anchor, new_test + anchor, 1), encoding="utf-8")
