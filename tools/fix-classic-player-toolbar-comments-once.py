"""
Apply the Classic player viewport-toolbar and comment layout fixes once.

This helper runs only on an isolated branch. It aligns the lyric timing toolbar
with the viewport-fixed player toolbar, reserves a safe lane for comment-page
controls, and makes the comment list/input use flex sizing instead of a fixed
height subtraction. The helper is removed before the verified result is
committed.
"""

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"Expected source pattern not found in {path}: {old[:120]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "src/renderer/components/CommonPlayer.vue",
    "  padding: 0 clamp(20px, 3vw, 44px);",
    "  padding: 0 0 0 clamp(20px, 3vw, 44px);",
)

replace_once(
    "src/renderer/components/CommonPlayer.vue",
    "            padding: isMobile ? '0' : '40px 0 10px 4vh'",
    "            padding: isMobile ? '0' : '40px 72px 10px 4vh'",
)

replace_once(
    "src/renderer/components/CommentList.vue",
    ".comment-main {\n  width: 100%;\n  height: calc(100% - 108px);\n  box-sizing: border-box;\n}",
    ".comment-main {\n  width: 100%;\n  flex: 1 1 auto;\n  min-height: 0;\n  box-sizing: border-box;\n}",
)

replace_once(
    "src/renderer/components/CommentList.vue",
    ".write-comment {\n  padding: 8px 0;\n  box-sizing: border-box;\n}",
    ".write-comment {\n  flex: 0 0 auto;\n  padding: 8px 0 0;\n  box-sizing: border-box;\n}",
)

replace_once(
    "src/renderer/components/WriteComment.vue",
    "  height: 60px;",
    "  height: 44px;",
)

anchor = "  test('routes Linux update checks through the Electron session network stack', () => {"
regression = """  test('keeps the Classic lyric toolbar and comments inside the viewport tool lane', () => {\n    const commonPlayer = readSource('src/renderer/components/CommonPlayer.vue')\n    const commentList = readSource('src/renderer/components/CommentList.vue')\n    const writeComment = readSource('src/renderer/components/WriteComment.vue')\n\n    expect(commonPlayer).toContain('padding: 0 0 0 clamp(20px, 3vw, 44px)')\n    expect(commonPlayer).toContain(\"'40px 72px 10px 4vh'\")\n    expect(commentList).toContain('flex: 1 1 auto')\n    expect(commentList).toContain('min-height: 0')\n    expect(commentList).toContain('flex: 0 0 auto')\n    expect(writeComment).toContain('height: 44px')\n  })\n\n"""
replace_once("tests/feature-regression.spec.ts", anchor, regression + anchor)
