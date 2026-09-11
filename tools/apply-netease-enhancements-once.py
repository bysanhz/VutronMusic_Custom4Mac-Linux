"""Fix daily recommendation removal when the visible list is search-filtered.

Usage:
    python tools/apply-netease-enhancements-once.py

Args:
    None.

Returns:
    Updates the daily recommendation callback to remove by track ID rather than visible index.
"""

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, got {count}: {old[:100]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "src/renderer/components/VirtualTrackList.vue",
    "    removeTrack(rightClickedTrackIndex.value)",
    "    removeTrack(trackId)",
)

replace_once(
    "src/renderer/views/DailyTracks.vue",
    '''provide('removeTrack', (index: number) => {\n  if (!Number.isInteger(index) || index < 0) return\n  if (mode.value === 'today') dailyTracks.value.splice(index, 1)\n  else historyTracks.value.splice(index, 1)\n})''',
    '''provide('removeTrack', (trackId: number) => {\n  if (!Number.isFinite(trackId) || trackId <= 0) return\n  const target = mode.value === 'today' ? dailyTracks.value : historyTracks.value\n  const index = target.findIndex((track) => Number(track.id) === Number(trackId))\n  if (index >= 0) target.splice(index, 1)\n})''',
)

print("Fixed filtered daily recommendation removal.")
