<template>
  <ul
    v-if="releaseNoteItems.length"
    class="update-release"
    :aria-label="$t('settings.update.diagnostics.releaseNotesLabel')"
  >
    <li v-for="(item, index) in releaseNoteItems" :key="`${index}-${item}`">
      {{ item }}
    </li>
  </ul>

  <!-- ======== newADD start====== -->
  <section class="diagnostic-panel">
    <div class="diagnostic-panel__header">
      <div>
        <div class="diagnostic-panel__title">{{ $t('settings.update.diagnostics.title') }}</div>
        <div class="diagnostic-panel__description">
          {{ installFormatLabel }} · {{ platformLabel }}
        </div>
      </div>
      <span class="diagnostic-panel__badge">v{{ appVersion }}</span>
    </div>

    <div v-if="updateError" class="diagnostic-panel__error">
      {{ $t('settings.update.diagnostics.lastError', { error: updateError }) }}
    </div>

    <div class="diagnostic-panel__actions">
      <button @click="copyDiagnostics">{{ $t('settings.update.diagnostics.copy') }}</button>
      <button @click="downloadDiagnostics">{{ $t('settings.update.diagnostics.export') }}</button>
      <button v-if="isElectron" @click="openLogFile">{{
        $t('settings.update.diagnostics.openLog')
      }}</button>
      <button v-if="releaseUrl" @click="openReleasePage">{{
        $t('settings.update.diagnostics.openRelease')
      }}</button>
    </div>

    <div v-if="actionMessage" class="diagnostic-panel__message">{{ actionMessage }}</div>
  </section>
  <!-- =========== newADD end ======== -->
</template>

<script setup lang="ts">
import { computed, onMounted, ref, toRefs } from 'vue'
import { useNormalStateStore } from '../store/state'
import { useI18n } from 'vue-i18n'

const stateStore = useNormalStateStore()
const { latestVersion, updateError } = toRefs(stateStore)
const { t } = useI18n()

// ======== newADD start======
const appVersion = ref('unknown')
const actionMessage = ref('')
const isElectron = Boolean(window.env?.isElectron)

const installFormat = computed(() => {
  if (latestVersion.value?.installFormat) {
    return latestVersion.value.installFormat
  }

  if (window.env?.isDev) return 'development'
  if (window.env?.isLinux) return 'linux-package'
  if (window.env?.isMac) return 'macos-unsigned'
  if (window.env?.isWindows) return 'windows-package'
  return 'browser'
})

const installFormatLabel = computed(() => {
  const labels: Record<string, string> = {
    development: t('settings.update.diagnostics.development'),
    appimage: 'Linux AppImage',
    'linux-package': t('settings.update.diagnostics.linuxPackage'),
    'macos-unsigned': t('settings.update.diagnostics.macosUnsigned'),
    'windows-package': t('settings.update.diagnostics.windowsPackage'),
    package: t('settings.update.diagnostics.desktopPackage'),
    browser: t('settings.update.diagnostics.browser')
  }

  return labels[installFormat.value] || installFormat.value
})

const platformLabel = computed(() => {
  if (window.env?.isLinux) return 'Linux'
  if (window.env?.isMac) return 'macOS'
  if (window.env?.isWindows) return 'Windows'
  return navigator.platform || 'Unknown platform'
})

const releaseUrl = computed(() => latestVersion.value?.releaseUrl || '')

const MAX_RELEASE_NOTE_ITEMS = 8
const MAX_RELEASE_NOTE_LENGTH = 120

const cleanReleaseNoteText = (value: string): string =>
  value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`~]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/^[-+*]\s+/, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()

const buildReleaseNoteItems = (releaseNotes: unknown): string[] => {
  const raw = String(releaseNotes || '')
    .replace(/\r/g, '')
    .trim()
  if (!raw) return []

  const normalized = raw
    .replace(/(^|\n)\s*#{1,6}\s*/g, '\n')
    .replace(/\s+#{1,6}\s+/g, '\n')
    .replace(/(^|\n)\s*[-+*]\s+/g, '\n')
    .replace(/\s+-\s+(?=[\p{L}\p{N}“"'《（])/gu, '\n')

  return normalized
    .split('\n')
    .map(cleanReleaseNoteText)
    .filter(Boolean)
    .filter((item) => !/^VutronMusic\s+v?\d/i.test(item))
    .filter((item) => !/^完整变更记录[:：]?/i.test(item))
    .filter((item) => !/^v?\d+\.\d+\.\d+\s*(?:\.{2,}|…)/i.test(item))
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

const getZoomFactor = () => {
  try {
    return window.mainApi?.getZoomFactor?.() || 1
  } catch {
    return 1
  }
}

const buildDiagnostics = () => {
  const latest = latestVersion.value?.updateInfo?.version || 'unknown'
  const screenSize = `${window.screen.width}x${window.screen.height}`
  const viewportSize = `${window.innerWidth}x${window.innerHeight}`

  const d = 'settings.update.diagnostics'
  return [
    t(`${d}.reportTitle`),
    `${t(`${d}.generatedAt`)}: ${new Date().toISOString()}`,
    `${t(`${d}.appVersion`)}: ${appVersion.value}`,
    `${t(`${d}.latestVersion`)}: ${latest}`,
    `${t(`${d}.installFormat`)}: ${installFormatLabel.value}`,
    `${t(`${d}.platform`)}: ${platformLabel.value}`,
    `${t(`${d}.devEnvironment`)}: ${t(window.env?.isDev ? `${d}.yes` : `${d}.no`)}`,
    `${t(`${d}.systemLanguage`)}: ${navigator.language}`,
    `${t(`${d}.screenSize`)}: ${screenSize}`,
    `${t(`${d}.windowSize`)}: ${viewportSize}`,
    `${t(`${d}.pixelRatio`)}: ${window.devicePixelRatio}`,
    `${t(`${d}.pageZoom`)}: ${getZoomFactor().toFixed(3)}`,
    `User-Agent: ${navigator.userAgent}`,
    `${t(`${d}.updateError`)}: ${updateError.value || t(`${d}.none`)}`
  ].join('\n')
}

const setActionMessage = (message: string) => {
  actionMessage.value = message
  window.setTimeout(() => {
    if (actionMessage.value === message) {
      actionMessage.value = ''
    }
  }, 3200)
}

const copyDiagnostics = async () => {
  const diagnostics = buildDiagnostics()

  try {
    await navigator.clipboard.writeText(diagnostics)
    setActionMessage(t('settings.update.diagnostics.copied'))
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = diagnostics
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
    setActionMessage(t('settings.update.diagnostics.copied'))
  }
}

const downloadDiagnostics = () => {
  const blob = new Blob([buildDiagnostics()], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

  anchor.href = url
  anchor.download = `VutronMusic-diagnostics-${timestamp}.txt`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  setActionMessage(t('settings.update.diagnostics.exported'))
}

const openLogFile = () => {
  window.mainApi?.send('openLogFile')
  setActionMessage(t('settings.update.diagnostics.logLocated'))
}

const openReleasePage = () => {
  if (!releaseUrl.value) return

  if (window.mainApi) {
    window.mainApi.send('msgOpenExternalLink', releaseUrl.value)
  } else {
    window.open(releaseUrl.value, '_blank', 'noopener,noreferrer')
  }
}

onMounted(async () => {
  try {
    const version = await window.mainApi?.invoke('msgRequestGetVersion')
    if (version) {
      appVersion.value = String(version).replace(/^v/i, '')
    }
  } catch {
    appVersion.value = 'unknown'
  }
})
// =========== newADD end ========
</script>

<style lang="scss">
.update-release {
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

// ======== newADD start======
.diagnostic-panel {
  width: 100%;
  box-sizing: border-box;
  margin-top: 14px;
  padding: 16px;
  border-radius: 12px;
  background-color: var(--color-secondary-bg);
}

.diagnostic-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.diagnostic-panel__title {
  font-size: 1.05em;
  font-weight: 650;
}

.diagnostic-panel__description,
.diagnostic-panel__message {
  margin-top: 5px;
  color: var(--color-secondary);
  font-size: 0.88em;
}

.diagnostic-panel__badge {
  flex: 0 0 auto;
  padding: 4px 9px;
  border-radius: 999px;
  background-color: var(--color-primary-bg-for-transparent);
  color: var(--color-text);
  font-size: 0.82em;
  font-weight: 600;
}

.diagnostic-panel__error {
  margin-top: 12px;
  padding: 9px 11px;
  border-radius: 8px;
  background: rgba(220, 38, 38, 0.1);
  color: #dc2626;
  overflow-wrap: anywhere;
}

.diagnostic-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 14px;

  button {
    min-width: 116px;
  }
}
// =========== newADD end ========
</style>
