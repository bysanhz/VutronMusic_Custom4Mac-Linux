import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('desktop lyric bottom lock control', () => {
  test('shares one bottom control for lock and unlock in normal and compact modes', () => {
    const osd = readSource('src/renderer/views/OSDLyric.vue')
    const header = readSource('src/renderer/components/OsdHeader.vue')
    const preload = readSource('src/preload/osdWin.ts')
    const unlockIcon = readSource('src/renderer/assets/icons/unlock.svg')

    expect(osd).toContain('v-show="!isLock || (!isLinux && showButtonWhenLock)"')
    expect(osd).toContain(':class="{ \'is-locked\': isLock }"')
    expect(osd).toContain('id="osd-lock"')
    expect(osd).toContain(':class="{ disabled: isLock }"')
    expect(osd).toContain("isLock ? '解锁桌面歌词' : '锁定桌面歌词'")
    expect(osd).toContain(":icon-class=\"isLock ? 'unlock' : 'lock'\"")
    expect(osd).toContain('@click.stop="handleLock"')
    expect(osd).toContain('.osd-drag-bar.disabled')
    expect(osd).toContain('visibility: hidden;')
    expect(osd).not.toContain('class="control-lock"')
    expect(osd).not.toContain('const lockStyle = computed')
    expect(header).not.toContain('icon-class="lock"')
    expect(header).not.toContain('lockLyrics')
    expect(preload).toContain("lockEl?.addEventListener('mouseenter'")
    expect(preload).not.toContain("lockEl.style.opacity = '1'")
    expect(preload).not.toContain("lockEl.style.opacity = '0'")
    expect(unlockIcon).toContain('viewBox="0 0 24 24"')
  })
})
