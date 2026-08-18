from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, got {count}")
    file_path.write_text(text.replace(old, new, 1))


# Linux GNOME groups windows by WM_CLASS. Keep the runtime class identical to
# electron-builder's StartupWMClass so launched windows stay under the pinned app.
replace_once(
    "src/main/index.ts",
    """    if (Constants.IS_LINUX) {
      app.commandLine.appendSwitch(
        'disable-features',
        'HardwareMediaKeyHandling,MediaSessionService'
      )
    }
""",
    """    if (Constants.IS_LINUX) {
      app.commandLine.appendSwitch('class', 'vutron')
      app.commandLine.appendSwitch(
        'disable-features',
        'HardwareMediaKeyHandling,MediaSessionService'
      )
    }
""",
)

# Match every native settings toggle to the already-approved cover-controls
# switch: 44x24 pill track with an 18x18 circular white thumb.
replace_once(
    "src/renderer/views/SystemSettings.vue",
    """.toggle input + label {
  position: relative;
  display: inline-block;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-transition: 0.4s ease;
  transition: 0.4s ease;
  height: 32px;
  width: 52px;
  background: var(--color-secondary-bg);
  border-radius: 8px;
}
.toggle input + label:before {
  content: '';
  position: absolute;
  display: block;
  -webkit-transition: 0.2s cubic-bezier(0.24, 0, 0.5, 1);
  transition: 0.2s cubic-bezier(0.24, 0, 0.5, 1);
  height: 32px;
  width: 52px;
  top: 0;
  left: 0;
  border-radius: 8px;
}

.toggle input + label:after {
  content: '';
  position: absolute;
  display: block;
  box-shadow:
    0 0 0 1px hsla(0, 0%, 0%, 0.02),
    0 4px 0px 0 hsla(0, 0%, 0%, 0.01),
    0 4px 9px hsla(0, 0%, 0%, 0.08),
    0 3px 3px hsla(0, 0%, 0%, 0.03);
  -webkit-transition: 0.35s cubic-bezier(0.54, 1.6, 0.5, 1);
  transition: 0.35s cubic-bezier(0.54, 1.6, 0.5, 1);
  background: #fff;
  height: 20px;
  width: 20px;
  top: 6px;
  left: 6px;
  border-radius: 6px;
}
.toggle input:checked + label:before {
  background: var(--color-primary);
  -webkit-transition: width 0.2s cubic-bezier(0, 0, 0, 0.1);
  transition: width 0.2s cubic-bezier(0, 0, 0, 0.1);
}
.toggle input:checked + label:after {
  left: 26px;
}
""",
    """.toggle input + label {
  position: relative;
  display: inline-block;
  box-sizing: border-box;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-transition: 0.2s ease;
  transition: 0.2s ease;
  height: 24px;
  width: 44px;
  background: color-mix(in srgb, var(--color-text), transparent 82%);
  border-radius: 999px;
}
.toggle input + label:before {
  content: '';
  position: absolute;
  display: block;
  -webkit-transition: 0.2s cubic-bezier(0.24, 0, 0.5, 1);
  transition: 0.2s cubic-bezier(0.24, 0, 0.5, 1);
  height: 24px;
  width: 44px;
  top: 0;
  left: 0;
  border-radius: 999px;
}

.toggle input + label:after {
  content: '';
  position: absolute;
  display: block;
  box-shadow:
    0 0 0 1px hsla(0, 0%, 0%, 0.02),
    0 4px 0px 0 hsla(0, 0%, 0%, 0.01),
    0 4px 9px hsla(0, 0%, 0%, 0.08),
    0 3px 3px hsla(0, 0%, 0%, 0.03);
  -webkit-transition: 0.2s cubic-bezier(0.24, 0, 0.5, 1);
  transition: 0.2s cubic-bezier(0.24, 0, 0.5, 1);
  background: #fff;
  height: 18px;
  width: 18px;
  top: 3px;
  left: 3px;
  border-radius: 50%;
}
.toggle input:checked + label:before {
  background: var(--color-primary);
}
.toggle input:checked + label:after {
  left: 23px;
}
""",
)

# Undo the previous misunderstanding: ordinary text/action buttons should keep
# their existing component styling. Only toggle switches are being normalized.
replace_once(
    "src/renderer/utils/v327FeatureShared.ts",
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
    """    .vutronmusic-v327-controls button {
      min-height: 36px;
      white-space: nowrap;
    }
""",
)

replace_once(
    "src/renderer/utils/v327FeatureShared.ts",
    """    .vutronmusic-osd-preset-draft-row button {
      min-height: 28px;
      padding: 4px 10px;
      border-radius: 8px;
    }
""",
    """    .vutronmusic-osd-preset-draft-row button {
      min-height: 28px;
      padding: 3px 9px;
      border-radius: 7px;
    }
""",
)

replace_once(
    "src/renderer/utils/v327FeatureShared.ts",
    """    .vutronmusic-osd-preset-transfer-actions button {
      min-height: 36px;
      padding: 8px 12px;
      border-radius: 8px;
    }
""",
    """    .vutronmusic-osd-preset-transfer-actions button {
      min-height: 28px;
      padding: 3px 9px;
      border-radius: 7px;
    }
""",
)

# Replace the regression test that encoded the misunderstood action-button
# styling with tests for the actual toggle visual and Linux app identity.
test_path = Path("tests/feature-regression.spec.ts")
test_text = test_path.read_text()
old_test = """  test('keeps injected settings action buttons consistent with native settings buttons', () => {
    const shared = readSource('src/renderer/utils/v327FeatureShared.ts')

    expect(shared).toContain('.vutronmusic-v327-controls button {')
    expect(shared).toContain('border: none;')
    expect(shared).toContain('border-radius: 8px;')
    expect(shared).toContain('background: var(--color-secondary-bg);')
    expect(shared).toContain('.vutronmusic-osd-preset-transfer-actions button {')
    expect(shared).toContain('min-height: 36px;')
  })

"""
new_tests = """  test('uses the same pill toggle geometry across settings controls', () => {
    const settings = readSource('src/renderer/views/SystemSettings.vue')
    const coverControls = readSource('src/renderer/utils/osdCoverControlsSettings.ts')

    expect(settings).toContain('.toggle input + label {')
    expect(settings).toContain('height: 24px;')
    expect(settings).toContain('width: 44px;')
    expect(settings).toContain('border-radius: 999px;')
    expect(settings).toContain('height: 18px;')
    expect(settings).toContain('width: 18px;')
    expect(settings).toContain('border-radius: 50%;')
    expect(settings).toContain('left: 23px;')

    expect(coverControls).toContain('width: 44px;')
    expect(coverControls).toContain('height: 24px;')
    expect(coverControls).toContain('border-radius: 999px;')
    expect(coverControls).toContain('width: 18px;')
    expect(coverControls).toContain('height: 18px;')
    expect(coverControls).toContain('border-radius: 50%;')
  })

  test('keeps Linux runtime WM_CLASS aligned with the packaged desktop entry', () => {
    const main = readSource('src/main/index.ts')
    const builder = readSource('buildAssets/builder/config.js')

    expect(main).toContain("app.commandLine.appendSwitch('class', 'vutron')")
    expect(builder).toContain("StartupWMClass: 'vutron'")
    expect(builder).toContain("executableName: 'vutron'")
  })

"""
if test_text.count(old_test) != 1:
    raise SystemExit("feature regression action-button test marker mismatch")
test_path.write_text(test_text.replace(old_test, new_tests, 1))
