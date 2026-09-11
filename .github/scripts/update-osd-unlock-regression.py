"""Update the existing desktop-lyric lock regression for unified unlock behavior.

Usage:
    python .github/scripts/update-osd-unlock-regression.py

Args:
    None.

Returns:
    Updates tests/feature-regression.spec.ts in place. Exits non-zero if the
    expected old regression block is not found exactly once.
"""

from pathlib import Path
import re

path = Path("tests/feature-regression.spec.ts")
text = path.read_text()

pattern = re.compile(
    r"  test\('uses one shared bottom lock action for normal and compact desktop lyrics', \(\) => \{.*?\n  \}\)\n\n",
    re.S,
)

replacement = '''  test('uses one shared bottom lock and unlock action for normal and compact desktop lyrics', () => {
    const osd = readSource('src/renderer/views/OSDLyric.vue')
    const header = readSource('src/renderer/components/OsdHeader.vue')

    expect(osd).toContain('class="osd-bottom-tools"')
    expect(osd).toContain(":class=\"{ 'is-locked': isLock }\"")
    expect(osd).toContain('v-show="!isLock || (!isLinux && showButtonWhenLock)"')
    expect(osd).toContain('id="osd-lock"')
    expect(osd).toContain('class="osd-lock-button"')
    expect(osd).toContain(':class="{ visible: hover }"')
    expect(osd).toContain(':class="{ disabled: isLock }"')
    expect(osd).toContain("isLock ? '解锁桌面歌词' : '锁定桌面歌词'")
    expect(osd).toContain(":icon-class=\"isLock ? 'unlock' : 'lock'\"")
    expect(osd).toContain('@click.stop="handleLock"')
    expect(osd).toContain('width: 24px;')
    expect(osd).toContain('height: 24px;')
    expect(osd).toContain('gap: 10px;')
    expect(osd).toContain('.osd-lock-button.visible')
    expect(osd).toContain('.osd-drag-bar.disabled')
    expect(osd).toContain('visibility: hidden;')
    expect(osd).not.toContain('class="control-lock"')
    expect(osd).not.toContain('const lockStyle = computed')
    expect(header).not.toContain('icon-class="lock"')
    expect(header).not.toContain('lockLyrics')
  })

'''

text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f"expected exactly one old bottom-lock regression block, found {count}")

path.write_text(text)
print("updated existing unified desktop lyric lock/unlock regression")
