import {
  readOsdCoverControlsVisibility,
  saveOsdCoverControlsVisibility
} from './osdCoverControlsVisibility'

const CONTROL_ID = 'osd-cover-controls-visibility-setting'
const STYLE_ID = 'osd-cover-controls-visibility-setting-style'
const STORAGE_KEY = 'vutronmusic-osd-cover-controls-visible'

const TEXTS = {
  zh: {
    title: '显示左侧封面与控制按钮',
    description: '该设置独立于锁定状态；关闭后无论是否锁定都会隐藏左侧封面与控制按钮'
  },
  zht: {
    title: '顯示左側封面與控制按鈕',
    description: '此設定獨立於鎖定狀態；關閉後無論是否鎖定都會隱藏左側封面與控制按鈕'
  },
  en: {
    title: 'Show Cover and Controls',
    description:
      'Independent of the lock state. When disabled, the left cover and controls remain hidden.'
  }
} as const

type SupportedLanguage = keyof typeof TEXTS

/**
 * 获取当前界面语言。
 *
 * Returns:
 *   zh、zht 或 en；未知语言回退到 en。
 *
 * Raises:
 *   设置解析失败时回退到 en，不向外抛出异常。
 */
const resolveLanguage = (): SupportedLanguage => {
  try {
    const settings = JSON.parse(localStorage.getItem('settings') || '{}')
    const language = settings?.general?.language
    return language === 'zh' || language === 'zht' ? language : 'en'
  } catch {
    return 'en'
  }
}

/** 注入设置项独立样式，避免依赖 SystemSettings.vue 的 scoped 属性。 */
const injectStyle = () => {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${CONTROL_ID} .osd-cover-controls-toggle {
      position: relative;
      width: 44px;
      height: 24px;
      flex: 0 0 auto;
    }

    #${CONTROL_ID} .osd-cover-controls-toggle input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }

    #${CONTROL_ID} .osd-cover-controls-toggle label {
      position: absolute;
      inset: 0;
      display: block;
      box-sizing: border-box;
      border-radius: 999px;
      background: color-mix(in srgb, var(--color-text), transparent 82%);
      cursor: pointer;
      transition: background-color 0.2s ease;
    }

    #${CONTROL_ID} .osd-cover-controls-toggle label::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 3px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: white;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.24);
      transition: transform 0.2s ease;
    }

    #${CONTROL_ID} .osd-cover-controls-toggle input:checked + label {
      background: var(--color-primary);
    }

    #${CONTROL_ID} .osd-cover-controls-toggle input:checked + label::after {
      transform: translateX(20px);
    }
  `
  document.head.appendChild(style)
}

/**
 * 创建桌面歌词封面控件可见性设置项。
 *
 * Returns:
 *   可插入 SystemSettings 的 item 元素。
 *
 * Raises:
 *   不抛出异常。
 */
const createControl = () => {
  const language = resolveLanguage()
  const text = TEXTS[language]
  const item = document.createElement('div')
  item.id = CONTROL_ID
  item.className = 'item'
  item.innerHTML = `
    <div class="left">
      <div class="title">${text.title}</div>
      <div class="description">${text.description}</div>
    </div>
    <div class="right">
      <div class="osd-cover-controls-toggle">
        <input id="showCompactCoverControls" type="checkbox" />
        <label for="showCompactCoverControls"></label>
      </div>
    </div>
  `

  const input = item.querySelector<HTMLInputElement>('#showCompactCoverControls')
  if (input) {
    input.checked = readOsdCoverControlsVisibility()
    input.addEventListener('change', () => {
      saveOsdCoverControlsVisibility(input.checked)
    })
  }

  return item
}

/** 在桌面歌词设置面板中确保开关存在。 */
const ensureControl = () => {
  const lockInput = document.getElementById('isLock')
  const lockItem = lockInput?.closest<HTMLElement>('.item')
  if (!lockItem?.parentElement) return false

  injectStyle()

  const existing = document.getElementById(CONTROL_ID)
  if (existing) return true

  lockItem.insertAdjacentElement('afterend', createControl())
  return true
}

/**
 * 自动监听设置页面挂载和路由切换。
 *
 * 详细说明：
 * SystemSettings.vue 使用路由和 v-show 切换面板。MutationObserver 只负责触发
 * 经过节流的检查，避免播放器等高频 DOM 更新导致重复查询设置面板。
 */
const initializeOsdCoverControlsSettings = () => {
  let pendingTimer: number | null = null

  const scheduleEnsureControl = (delay = 80) => {
    if (pendingTimer !== null) return

    pendingTimer = window.setTimeout(() => {
      pendingTimer = null
      ensureControl()
    }, delay)
  }

  const observer = new MutationObserver(() => {
    scheduleEnsureControl()
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  })

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return
    const input = document.querySelector<HTMLInputElement>('#showCompactCoverControls')
    if (input) input.checked = event.newValue !== 'false'
  }
  window.addEventListener('storage', handleStorage)

  ;[0, 80, 240, 600, 1200].forEach((delay) => {
    window.setTimeout(() => {
      ensureControl()
    }, delay)
  })

  window.addEventListener(
    'beforeunload',
    () => {
      observer.disconnect()
      window.removeEventListener('storage', handleStorage)
      if (pendingTimer !== null) window.clearTimeout(pendingTimer)
    },
    { once: true }
  )
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeOsdCoverControlsSettings, {
    once: true
  })
} else {
  initializeOsdCoverControlsSettings()
}
