"""Apply the unified desktop-lyric lock/unlock UI patch.

Usage:
    python .github/scripts/apply-osd-unlock.py

Args:
    None.

Returns:
    Updates the desktop lyric Vue/preload sources, adds the unlock icon, and
    writes a focused regression test. Exits non-zero if expected source anchors
    are missing so the patch cannot silently corrupt a changed file.
"""

from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label}: expected source not found")
    return text.replace(old, new, 1)


osd_path = Path("src/renderer/views/OSDLyric.vue")
osd = osd_path.read_text()

# Remove the old normal-mode-only text unlock control. Lock and unlock now share
# one bottom position in both normal and compact layouts.
osd, count = re.subn(
    r'\n    <!-- 普通模式锁定后的解锁按钮 -->\n'
    r'    <div v-show="isLock && !isCompactMode" class="control-lock" tabindex="-1">.*?\n'
    r'    </div>\n',
    "\n",
    osd,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("normal-mode unlock block: expected exactly one match")

old_bottom = '''    <div v-show="!isLock" class="osd-bottom-tools">
      <div class="osd-drag-bar" title="拖动桌面歌词窗口" @mousedown="startCustomOsdDrag" />

      <button
        v-if="!isLinux"
        type="button"
        class="osd-lock-button"
        :class="{ visible: hover }"
        title="锁定桌面歌词"
        aria-label="锁定桌面歌词"
        @click.stop="handleLock"
      >
        <SvgIcon icon-class="lock" />
      </button>
    </div>'''
new_bottom = '''    <div
      v-show="!isLock || (!isLinux && showButtonWhenLock)"
      class="osd-bottom-tools"
      :class="{ 'is-locked': isLock }"
    >
      <div
        class="osd-drag-bar"
        :class="{ disabled: isLock }"
        title="拖动桌面歌词窗口"
        @mousedown="startCustomOsdDrag"
      />

      <button
        v-if="!isLinux"
        v-show="!isLock || showButtonWhenLock"
        id="osd-lock"
        type="button"
        class="osd-lock-button"
        :class="{ visible: hover }"
        :title="isLock ? '解锁桌面歌词' : '锁定桌面歌词'"
        :aria-label="isLock ? '解锁桌面歌词' : '锁定桌面歌词'"
        @click.stop="handleLock"
      >
        <SvgIcon :icon-class="isLock ? 'unlock' : 'lock'" />
      </button>
    </div>'''
osd = replace_once(osd, old_bottom, new_bottom, "bottom lock control")

osd = replace_once(
    osd,
    "const { isLock, type, playedLrcColor, backgroundColor, showButtonWhenLock } =\n  storeToRefs(osdLyricStore)",
    "const { isLock, type, backgroundColor, showButtonWhenLock } = storeToRefs(osdLyricStore)",
    "OSD store refs",
)

osd, count = re.subn(
    r"\nconst lockStyle = computed\(\(\) => \{.*?\n\}\)\n",
    "\n",
    osd,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("lockStyle: expected exactly one match")

osd = replace_once(
    osd,
    "const startCustomOsdDrag = (event: MouseEvent) => {\n  if (event.button !== 0) return",
    "const startCustomOsdDrag = (event: MouseEvent) => {\n  if (isLock.value || event.button !== 0) return",
    "drag lock guard",
)

# The old text unlock button CSS is obsolete.
osd, count = re.subn(
    r"\n\.control-lock \{.*?\n\}\n\n\.btn \{.*?\n\}\n",
    "\n",
    osd,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("obsolete unlock CSS: expected exactly one match")

drag_block = '''.osd-drag-bar {
  position: relative;

  width: clamp(112px, 24vw, 180px);
  height: 26px;

  background: transparent;

  cursor: grab !important;
  pointer-events: auto;

  -webkit-app-region: no-drag;
}
'''
osd = replace_once(
    osd,
    drag_block,
    drag_block
    + '''
.osd-drag-bar.disabled {
  visibility: hidden;
  pointer-events: none;
  cursor: default !important;
}
''',
    "drag bar CSS",
)

osd = osd.replace(
    " * 低干扰锁定按钮。\n *\n * 默认仅保留位置，不接受点击；鼠标进入桌面歌词后渐显，\n * 避免长期占据歌词视觉区域。点击区 24px，图标保持 13px。\n */",
    " * 低干扰锁定/解锁按钮。\n *\n * 未锁定时位于拖动条右侧；锁定后拖动条保留不可交互占位，\n * 因而解锁按钮保持在同一位置。锁定后的显示由\n * `showButtonWhenLock` 控制。点击区 24px，图标保持 13px。\n */",
    1,
)

osd_path.write_text(osd)

preload_path = Path("src/preload/osdWin.ts")
preload = preload_path.read_text()
preload = replace_once(
    preload,
    "    root.style.opacity = '1'\n    if (lockEl) lockEl.style.opacity = '0'",
    "    root.style.opacity = '1'",
    "preload lock opacity reset",
)
preload = replace_once(
    preload,
    "  root.addEventListener('mouseenter', () => {\n    mouseInside = true\n    if (lockEl) lockEl.style.opacity = '1'\n    scheduleLockedAutoHide()\n  })",
    "  root.addEventListener('mouseenter', () => {\n    mouseInside = true\n    scheduleLockedAutoHide()\n  })",
    "preload root mouseenter",
)
preload_path.write_text(preload)

unlock_path = Path("src/renderer/assets/icons/unlock.svg")
if unlock_path.exists():
    raise SystemExit("unlock.svg already exists unexpectedly")
unlock_path.write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">\n'
    '  <path fill="currentColor" d="M8 10V7a4 4 0 0 1 7.87-1H14a2 2 0 0 0-4 0v4h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h1Zm4 4a2 2 0 0 0-1 3.73V19h2v-1.27A2 2 0 0 0 12 14Z"/>\n'
    '</svg>\n'
)

test_path = Path("tests/osd-bottom-lock.spec.ts")
if test_path.exists():
    raise SystemExit("tests/osd-bottom-lock.spec.ts already exists unexpectedly")
test_path.write_text(
    "import { expect, test } from '@playwright/test'\n"
    "import { readFileSync } from 'node:fs'\n"
    "import { resolve } from 'node:path'\n\n"
    "const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')\n\n"
    "test.describe('desktop lyric bottom lock control', () => {\n"
    "  test('shares one bottom control for lock and unlock in normal and compact modes', () => {\n"
    "    const osd = readSource('src/renderer/views/OSDLyric.vue')\n"
    "    const header = readSource('src/renderer/components/OsdHeader.vue')\n"
    "    const preload = readSource('src/preload/osdWin.ts')\n"
    "    const unlockIcon = readSource('src/renderer/assets/icons/unlock.svg')\n\n"
    "    expect(osd).toContain('v-show=\"!isLock || (!isLinux && showButtonWhenLock)\"')\n"
    "    expect(osd).toContain(\":class=\\\"{ 'is-locked': isLock }\\\"\")\n"
    "    expect(osd).toContain('id=\"osd-lock\"')\n"
    "    expect(osd).toContain(':class=\"{ disabled: isLock }\"')\n"
    "    expect(osd).toContain(\"isLock ? '解锁桌面歌词' : '锁定桌面歌词'\")\n"
    "    expect(osd).toContain(\":icon-class=\\\"isLock ? 'unlock' : 'lock'\\\"\")\n"
    "    expect(osd).toContain('@click.stop=\"handleLock\"')\n"
    "    expect(osd).toContain('.osd-drag-bar.disabled')\n"
    "    expect(osd).toContain('visibility: hidden;')\n"
    "    expect(osd).not.toContain('class=\"control-lock\"')\n"
    "    expect(osd).not.toContain('const lockStyle = computed')\n"
    "    expect(header).not.toContain('icon-class=\"lock\"')\n"
    "    expect(header).not.toContain('lockLyrics')\n"
    "    expect(preload).toContain(\"lockEl?.addEventListener('mouseenter'\")\n"
    "    expect(preload).not.toContain(\"lockEl.style.opacity = '1'\")\n"
    "    expect(preload).not.toContain(\"lockEl.style.opacity = '0'\")\n"
    "    expect(unlockIcon).toContain('viewBox=\"0 0 24 24\"')\n"
    "  })\n"
    "})\n"
)

print("patched unified desktop lyric lock/unlock UI")
