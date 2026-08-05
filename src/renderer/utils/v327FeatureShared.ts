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
    .vutronmusic-v327-controls input[type='text'] {
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

    @media (max-width: 720px) {
      .vutronmusic-v327-controls {
        justify-content: flex-start;
        width: 100%;
      }

      .vutronmusic-v327-controls select {
        flex: 1 1 190px;
      }

      .vutronmusic-v327-status {
        text-align: left;
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
