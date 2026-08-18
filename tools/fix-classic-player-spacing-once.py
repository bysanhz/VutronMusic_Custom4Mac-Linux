"""
Apply the Classic player spacing and lyric-side toolbar alignment fix once.

This helper patches the verified source patterns on an isolated branch so the
result can be formatted, tested, built, and then promoted without keeping this
script in the final tree.
"""

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"Expected source pattern not found in {path}: {old[:100]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "src/renderer/components/CommonPlayer.vue",
    ":container-width=\"isMobile ? '50vw' : '90%'\"\n          :container-margin=\"isMobile ? '0 auto' : '0 0 0 auto'\"\n          :hover=\"hover\"\n          :offset-padding=\"isMobile ? '10vw' : '0'\"",
    ":container-width=\"isMobile ? '50vw' : 'calc(100% - 72px)'\"\n          :container-margin=\"isMobile ? '0 auto' : '0'\"\n          :hover=\"hover\"\n          :offset-padding=\"isMobile ? '10vw' : '24px'\"",
)

replace_once(
    "src/renderer/components/CommonPlayer.vue",
    "  display: flex;\n  padding: 0 calc((35vw - min(50vh, 33.33vw)) / 2.3);\n\n  .left-side {\n    flex: 1;\n    display: flex;\n    flex-direction: column;\n    justify-content: center;\n    align-items: center;",
    "  display: flex;\n  box-sizing: border-box;\n  padding: 0 clamp(20px, 3vw, 44px);\n\n  .left-side {\n    flex: 0 1 45%;\n    display: flex;\n    flex-direction: column;\n    justify-content: center;\n    align-items: flex-end;\n    box-sizing: border-box;\n    padding-right: clamp(16px, 2.5vw, 36px);",
)

replace_once(
    "src/renderer/components/CommonPlayer.vue",
    "  .right-side {\n    flex: 1;\n    justify-self: center;\n    align-items: center;\n    height: 100vh;",
    "  .right-side {\n    flex: 1 1 55%;\n    min-width: 0;\n    justify-self: center;\n    align-items: center;\n    height: 100vh;",
)

replace_once(
    "src/renderer/components/CommonPlayer.vue",
    "  &.isMobile {\n    flex-direction: column;\n    justify-content: center;\n    box-sizing: border-box;",
    "  &.isMobile {\n    flex-direction: column;\n    justify-content: center;\n    box-sizing: border-box;\n    padding: 0;",
)

replace_once(
    "src/renderer/components/LyricPage.vue",
    ".offset {\n  position: absolute;\n  background-color: rgba(0, 0, 0, 0.05);\n  padding: 10px 6px;\n  top: 50%;\n  right: v-bind(offsetPadding);\n  border-radius: 8px;\n  transform: translate(0, -50%);\n  z-index: 1;\n  contain: content;\n\n  .button-icon {\n    margin: unset;\n  }\n\n  .recovery {\n    margin: 10px 0;\n  }\n}",
    ".offset {\n  position: absolute;\n  top: 50%;\n  right: v-bind(offsetPadding);\n  z-index: 1;\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  width: 44px;\n  padding: 0;\n  border-radius: 0;\n  background: transparent;\n  transform: translateY(-50%);\n  contain: layout paint;\n\n  :deep(.button-icon) {\n    width: 44px;\n    height: 44px;\n    box-sizing: border-box;\n    margin: 0;\n    padding: 0;\n    border-radius: 0.75rem;\n    opacity: 0.48;\n    transition: 0.2s;\n  }\n\n  :deep(.button-icon .svg-icon) {\n    width: 22px;\n    height: 22px;\n  }\n\n  :deep(.button-icon:hover) {\n    opacity: 0.88;\n  }\n\n  .recovery {\n    margin: 0;\n  }\n}",
)

anchor = "  test('routes Linux update checks through the Electron session network stack', () => {"
regression = """  test('keeps Classic cover, lyrics and lyric timing tools visually aligned', () => {\n    const commonPlayer = readSource('src/renderer/components/CommonPlayer.vue')\n    const lyricPage = readSource('src/renderer/components/LyricPage.vue')\n\n    expect(commonPlayer).toContain(\"'calc(100% - 72px)'\")\n    expect(commonPlayer).toContain(\"'24px'\")\n    expect(commonPlayer).toContain('flex: 0 1 45%')\n    expect(commonPlayer).toContain('align-items: flex-end')\n    expect(commonPlayer).toContain('flex: 1 1 55%')\n    expect(lyricPage).toContain('width: 44px')\n    expect(lyricPage).toContain('height: 44px')\n    expect(lyricPage).toContain('width: 22px')\n    expect(lyricPage).toContain('height: 22px')\n  })\n\n"""
replace_once("tests/feature-regression.spec.ts", anchor, regression + anchor)
