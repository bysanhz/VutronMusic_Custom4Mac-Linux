export type SupportedLanguage = 'zh' | 'zht' | 'en'
export type JsonRecord = Record<string, any>

const STYLE_ID = 'vutronmusic-v327-feature-style'
const SETTINGS_STORAGE_KEY = 'settings'
const controlEnsurers = new Set<() => boolean>()
let settingsObserver: MutationObserver | null = null
let pendingEnsureTimer: number | null = null
let cleanupRegistered = false
let controlsReady = false

export const resolveFeatureLanguage = (): SupportedLanguage => {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}')
    const language = settings?.general?.language
    return language === 'zh' || language === 'zht' ? language : 'en'
  } catch {
    return 'en'
  }
}

export const readJsonRecord = (key: string): JsonRecord => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

export const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const writeStorageValue = (key: string, newValue: string): void => {
  const oldValue = localStorage.getItem(key)
  localStorage.setItem(key, newValue)
  window.dispatchEvent(
    new StorageEvent('storage', {
      key,
      oldValue,
      newValue,
      storageArea: localStorage,
      url: window.location.href
    })
  )
}

export const writeJsonRecord = (key: string, value: JsonRecord): void => {
  writeStorageValue(key, JSON.stringify(value))
}

const UNSAFE_JSON_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const MAX_MERGE_DEPTH = 12

export const deepMerge = (base: JsonRecord, patch: JsonRecord, depth = 0): JsonRecord => {
  if (depth > MAX_MERGE_DEPTH) throw new Error('设置对象层级过深')
  const result = cloneJson(base)

  Object.entries(patch).forEach(([key, value]) => {
    if (UNSAFE_JSON_KEYS.has(key)) return

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const currentValue = result[key]
      const safeBase =
        currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
          ? currentValue
          : {}
      result[key] = deepMerge(safeBase, value, depth + 1)
      return
    }

    result[key] = cloneJson(value)
  })

  return result
}

export const injectV327FeatureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .vutronmusic-v327-controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      width: min(430px, 100%);
    }

    .vutronmusic-v327-controls select,
    .vutronmusic-v327-controls input[type='text'],
    .vutronmusic-v327-controls input[type='number'] {
      min-width: 190px;
      height: 38px;
      box-sizing: border-box;
      padding: 0 10px;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      outline: none;
      background: var(--color-secondary-bg);
      color: var(--color-text);
      font: inherit;
    }

    .vutronmusic-v327-controls button {
      min-height: 36px;
      white-space: nowrap;
    }

    .vutronmusic-v327-status {
      flex-basis: 100%;
      min-height: 18px;
      color: var(--color-text-secondary);
      font-size: 12px;
      text-align: right;
    }

    .vutronmusic-osd-preset-draft-row {
      display: flex;
      flex-basis: 100%;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      min-height: 28px;
      color: var(--color-text-secondary);
      font-size: 12px;
    }

    .vutronmusic-osd-preset-draft-row button {
      min-height: 28px;
      padding: 3px 9px;
      border-radius: 7px;
    }

    .vutronmusic-preset-dirty .vutronmusic-osd-preset-draft-indicator {
      color: var(--color-primary);
      font-weight: 600;
    }

    .vutronmusic-osd-preset-transfer-preview {
      display: grid;
      flex-basis: 100%;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
    }

    .vutronmusic-osd-preset-preview {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      align-items: center;
      min-height: 58px;
      box-sizing: border-box;
      padding: 8px 10px;
      overflow: hidden;
      border: 1px solid var(--color-border);
      border-radius: 10px;
      background-image:
        linear-gradient(45deg, rgba(127, 127, 127, 0.08) 25%, transparent 25%),
        linear-gradient(-45deg, rgba(127, 127, 127, 0.08) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, rgba(127, 127, 127, 0.08) 75%),
        linear-gradient(-45deg, transparent 75%, rgba(127, 127, 127, 0.08) 75%);
      background-position: 0 0, 0 6px, 6px -6px, -6px 0;
      background-size: 12px 12px;
    }

    .vutronmusic-osd-preset-preview.has-cover {
      grid-template-columns: 38px minmax(0, 1fr);
      gap: 8px;
    }

    .vutronmusic-osd-preset-preview-cover {
      width: 38px;
      height: 38px;
      border-radius: 7px;
      background:
        radial-gradient(circle at 58% 40%, rgba(255, 255, 255, 0.78) 0 9%, transparent 10%),
        linear-gradient(135deg, var(--color-primary), rgba(40, 40, 40, 0.82));
      box-shadow: 0 2px 7px rgba(0, 0, 0, 0.18);
    }

    .vutronmusic-osd-preset-preview-lyrics {
      display: grid;
      min-width: 0;
      gap: 3px;
    }

    .vutronmusic-osd-preset-preview-lyrics strong,
    .vutronmusic-osd-preset-preview-lyrics small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .vutronmusic-osd-preset-preview-lyrics strong {
      font-size: 13px;
    }

    .vutronmusic-osd-preset-preview-lyrics small {
      font-size: 10px;
    }

    .vutronmusic-osd-preset-preview.single-line {
      min-height: 46px;
    }

    .vutronmusic-osd-preset-transfer-actions {
      display: grid;
      gap: 6px;
    }

    .vutronmusic-osd-preset-transfer-actions button {
      min-height: 28px;
      padding: 3px 9px;
      border-radius: 7px;
    }

    #vutronmusic-diagnostics-snapshot-setting .vutronmusic-v327-controls button {
      color: var(--color-primary);
      background: color-mix(in srgb, var(--color-primary), transparent 88%);
    }

    @media (max-width: 720px) {
      .vutronmusic-v327-controls {
        justify-content: flex-start;
        width: 100%;
      }

      .vutronmusic-v327-controls select,
      .vutronmusic-v327-controls input[type='text'],
      .vutronmusic-v327-controls input[type='number'] {
        flex: 1 1 190px;
      }

      .vutronmusic-v327-status,
      .vutronmusic-osd-preset-draft-row {
        justify-content: flex-start;
        text-align: left;
      }

      .vutronmusic-osd-preset-transfer-preview {
        grid-template-columns: 1fr;
      }

      .vutronmusic-osd-preset-transfer-actions {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `
  document.head.appendChild(style)
}

export const createV327SettingsItem = (
  id: string,
  title: string,
  description: string
): HTMLElement => {
  const item = document.createElement('div')
  item.id = id
  item.className = 'item'

  const left = document.createElement('div')
  left.className = 'left'

  const titleElement = document.createElement('div')
  titleElement.className = 'title'
  titleElement.textContent = title

  const descriptionElement = document.createElement('div')
  descriptionElement.className = 'description'
  descriptionElement.textContent = description

  left.append(titleElement, descriptionElement)

  const right = document.createElement('div')
  right.className = 'right'

  const controls = document.createElement('div')
  controls.className = 'vutronmusic-v327-controls'
  right.appendChild(controls)
  item.append(left, right)

  return item
}

const ensureAllControls = (): void => {
  let allMounted = controlEnsurers.size > 0

  controlEnsurers.forEach((ensureControl) => {
    try {
      allMounted = ensureControl() && allMounted
    } catch (error) {
      allMounted = false
      console.warn('[V327Features] 挂载设置项失败：', error)
    }
  })

  controlsReady = allMounted
}

const scheduleEnsureAllControls = (): void => {
  const settingsRoot = document.querySelector('#app .system-settings')
  if (!settingsRoot) {
    controlsReady = false
    return
  }
  if (controlsReady || pendingEnsureTimer !== null) return

  pendingEnsureTimer = window.setTimeout(() => {
    pendingEnsureTimer = null
    ensureAllControls()
  }, 80)
}

const initializeSharedObserver = (): void => {
  if (settingsObserver) return

  settingsObserver = new MutationObserver(scheduleEnsureAllControls)
  settingsObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  })
  ;[0, 100, 300, 800, 1600].forEach((delay) => {
    window.setTimeout(ensureAllControls, delay)
  })

  if (!cleanupRegistered) {
    cleanupRegistered = true
    window.addEventListener(
      'beforeunload',
      () => {
        settingsObserver?.disconnect()
        settingsObserver = null
        controlEnsurers.clear()
        controlsReady = false
        if (pendingEnsureTimer !== null) {
          window.clearTimeout(pendingEnsureTimer)
          pendingEnsureTimer = null
        }
      },
      { once: true }
    )
  }
}

export const observeV327SettingsControl = (ensureControl: () => boolean): void => {
  injectV327FeatureStyle()
  controlEnsurers.add(ensureControl)
  controlsReady = false
  ensureAllControls()
  initializeSharedObserver()
}
