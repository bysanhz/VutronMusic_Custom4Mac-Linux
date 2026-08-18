"""
Correct the Classic bottom track-info title clamping after the tooltip/readability update.

The prior change accidentally applied the two-line title rule to an unused legacy
style block. This helper restores that legacy block and applies the two-line rule
to the actual bottom track-info card, then is removed by CI before the final commit.
"""

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"Expected source pattern not found in {path}: {old[:140]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


path = "src/renderer/components/CommonPlayer.vue"

replace_once(
    path,
    "          -webkit-line-clamp: 2;\n          line-clamp: 2;\n          line-height: 1.28;\n          overflow: hidden;\n          overflow-wrap: anywhere;\n        }\n\n        .haslist {",
    "          -webkit-line-clamp: 1;\n          line-clamp: 1;\n          overflow: hidden;\n        }\n\n        .haslist {",
)

replace_once(
    path,
    "        .title {\n          font-size: 20px;\n          font-weight: 600;\n          opacity: 0.88;\n\n          display: -webkit-box;\n          -webkit-box-orient: vertical;\n          -webkit-line-clamp: 1;\n          line-clamp: 1;\n          overflow: hidden;\n        }\n\n        .haslist {\n          cursor: pointer;",
    "        .title {\n          font-size: 20px;\n          font-weight: 600;\n          opacity: 0.88;\n\n          display: -webkit-box;\n          -webkit-box-orient: vertical;\n          -webkit-line-clamp: 2;\n          line-clamp: 2;\n          line-height: 1.28;\n          overflow: hidden;\n          overflow-wrap: anywhere;\n        }\n\n        .haslist {\n          cursor: pointer;",
)

replace_once(
    "tests/feature-regression.spec.ts",
    "    expect(commonPlayer).toContain('-webkit-line-clamp: 2')\n",
    "    expect(commonPlayer).toContain(\n      '-webkit-line-clamp: 2;\\n          line-clamp: 2;\\n          line-height: 1.28'\n    )\n",
)
