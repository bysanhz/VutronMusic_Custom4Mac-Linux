from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, got {count}")
    file_path.write_text(text.replace(old, new, 1))


replace_once(
    "src/main/utils/Constants.ts",
    "import '../osdPlaybackBridge'\n",
    "",
)

replace_once(
    "src/renderer/components/LatestVersion.vue",
    """  <div
    v-if=\"latestVersion?.updateInfo?.releaseNotes\"
    v-same-html=\"latestVersion?.updateInfo?.releaseNotes || ''\"
    class=\"update-release\"
  ></div>
""",
    """  <ul v-if=\"releaseNoteItems.length\" class=\"update-release\" aria-label=\"版本变化\">
    <li v-for=\"(item, index) in releaseNoteItems\" :key=\"`${index}-${item}`\">
      {{ item }}
    </li>
  </ul>
""",
)

replace_once(
    "src/renderer/components/LatestVersion.vue",
    "const releaseUrl = computed(() => latestVersion.value?.releaseUrl || '')\n",
    """const releaseUrl = computed(() => latestVersion.value?.releaseUrl || '')

const MAX_RELEASE_NOTE_ITEMS = 8
const MAX_RELEASE_NOTE_LENGTH = 120

const cleanReleaseNoteText = (value: string): string =>
  value
    .replace(/!\\[([^\\]]*)\\]\\([^)]+\\)/g, '$1')
    .replace(/\\[([^\\]]+)\\]\\([^)]+\\)/g, '$1')
    .replace(/https?:\\/\\/\\S+/g, '')
    .replace(/[*_`~]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/^[-+*]\\s+/, '')
    .replace(/^#{1,6}\\s*/, '')
    .replace(/\\s+/g, ' ')
    .trim()

const buildReleaseNoteItems = (releaseNotes: unknown): string[] => {
  const raw = String(releaseNotes || '').replace(/\\r/g, '').trim()
  if (!raw) return []

  const normalized = raw
    .replace(/(^|\\n)\\s*#{1,6}\\s*/g, '\\n')
    .replace(/\\s+#{1,6}\\s+/g, '\\n')
    .replace(/(^|\\n)\\s*[-+*]\\s+/g, '\\n')
    .replace(/\\s+-\\s+(?=[\\p{L}\\p{N}“\"'《（])/gu, '\\n')

  return normalized
    .split('\\n')
    .map(cleanReleaseNoteText)
    .filter(Boolean)
    .filter((item) => !/^VutronMusic\\s+v?\\d/i.test(item))
    .filter((item) => !/^完整变更记录[:：]?/i.test(item))
    .filter((item) => !/^v?\\d+\\.\\d+\\.\\d+\\s*(?:\\.{2,}|…)/i.test(item))
    .filter((item) => !(item.length <= 14 && !/[，。,:：；!?！？]/.test(item)))
    .map((item) =>
      item.length > MAX_RELEASE_NOTE_LENGTH
        ? `${item.slice(0, MAX_RELEASE_NOTE_LENGTH - 1).trimEnd()}…`
        : item
    )
    .slice(0, MAX_RELEASE_NOTE_ITEMS)
}

const releaseNoteItems = computed(() =>
  buildReleaseNoteItems(latestVersion.value?.updateInfo?.releaseNotes)
)
""",
)

replace_once(
    "src/renderer/components/LatestVersion.vue",
    """.update-release {
  width: 100%;
  display: table;
  border-radius: 12px;
  padding: 10px 10px;
  background-color: var(--color-secondary-bg);

  h1,
  h2,
  h3 {
    padding: 0.3em 0;
    border-bottom: 2px solid var(--color-secondary-bg-for-transparent);
  }

  ul,
  ol {
    padding: 0.5em 0 0.5em 2em;
  }
}
""",
    """.update-release {
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 14px 18px 14px 38px;
  border-radius: 12px;
  background-color: var(--color-secondary-bg);

  li {
    margin: 0 0 8px;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }

  li:last-child {
    margin-bottom: 0;
  }
}
""",
)

replace_once(
    "src/renderer/utils/v327FeatureShared.ts",
    """    .vutronmusic-v327-controls button {
      min-height: 36px;
      white-space: nowrap;
    }
""",
    """    .vutronmusic-v327-controls button {
      min-height: 36px;
      box-sizing: border-box;
      padding: 8px 12px;
      border: none;
      border-radius: 8px;
      color: var(--color-text);
      background: var(--color-secondary-bg);
      font: inherit;
      font-weight: 600;
      line-height: 1.2;
      white-space: nowrap;
      cursor: pointer;
      transition: 0.2s;
    }

    .vutronmusic-v327-controls button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
""",
)

replace_once(
    "src/renderer/utils/v327FeatureShared.ts",
    """    .vutronmusic-osd-preset-transfer-actions button {
      min-height: 28px;
      padding: 3px 9px;
      border-radius: 7px;
    }
""",
    """    .vutronmusic-osd-preset-transfer-actions button {
      min-height: 36px;
      padding: 8px 12px;
      border-radius: 8px;
    }
""",
)

replace_once(
    "src/renderer/utils/v327FeatureShared.ts",
    """    .vutronmusic-osd-preset-draft-row button {
      min-height: 28px;
      padding: 3px 9px;
      border-radius: 7px;
    }
""",
    """    .vutronmusic-osd-preset-draft-row button {
      min-height: 28px;
      padding: 4px 10px;
      border-radius: 8px;
    }
""",
)

feature_test_path = Path("tests/feature-regression.spec.ts")
feature_test = feature_test_path.read_text()
marker = "  test('registers diagnostics and playback-history integrations', () => {\n"
if feature_test.count(marker) != 1:
    raise SystemExit("feature regression insertion marker mismatch")
new_tests = """  test('uses exactly one desktop-lyric play toggle route', () => {
    const constants = readSource('src/main/utils/Constants.ts')
    const ipcs = readSource('src/main/IPCs.ts')
    const player = readSource('src/renderer/store/player.ts')

    expect(constants).not.toContain(\"import '../osdPlaybackBridge'\")
    expect(ipcs).toContain(\"message === 'playOrPauseFromOsd'\")
    expect(ipcs).toContain(\"win.webContents.send('play-from-osd')\")
    expect(player).toContain(\"window.mainApi?.on('play-from-osd'\")
    expect(player).toContain('watch(playing, (value) => {')
  })

  test('renders concise release notes as cleaned bullet points', () => {
    const latestVersion = readSource('src/renderer/components/LatestVersion.vue')

    expect(latestVersion).toContain('v-if=\"releaseNoteItems.length\"')
    expect(latestVersion).toContain('MAX_RELEASE_NOTE_ITEMS = 8')
    expect(latestVersion).toContain('buildReleaseNoteItems')
    expect(latestVersion).not.toContain('v-same-html=\"latestVersion?.updateInfo?.releaseNotes')
  })

  test('keeps injected settings action buttons consistent with native settings buttons', () => {
    const shared = readSource('src/renderer/utils/v327FeatureShared.ts')

    expect(shared).toContain('.vutronmusic-v327-controls button {')
    expect(shared).toContain('border: none;')
    expect(shared).toContain('border-radius: 8px;')
    expect(shared).toContain('background: var(--color-secondary-bg);')
    expect(shared).toContain('.vutronmusic-osd-preset-transfer-actions button {')
    expect(shared).toContain('min-height: 36px;')
  })

"""
feature_test_path.write_text(feature_test.replace(marker, new_tests + marker, 1))
