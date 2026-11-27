<template>
  <section class="diagnostic-panel">
    <div class="diagnostic-panel__header">
      <div>
        <div class="diagnostic-panel__title">{{ $t('settings.update.diagnostics.title') }}</div>
        <div class="diagnostic-panel__description">
          {{ installFormatLabel }} · {{ platformLabel }}
        </div>
      </div>
    </div>

    <div v-if="updateError" class="diagnostic-panel__error">
      {{ $t('settings.update.diagnostics.lastError', { error: updateError }) }}
    </div>

    <div class="diagnostic-panel__actions">
      <button :disabled="pending" @click="copyDiagnostics">{{
        $t('settings.update.diagnostics.copy')
      }}</button>
      <button :disabled="pending" @click="downloadDiagnostics">{{
        $t('settings.update.diagnostics.export')
      }}</button>
      <button v-if="isElectron" @click="openLogFile">{{
        $t('settings.update.diagnostics.openLog')
      }}</button>
      <button v-if="releaseUrl" @click="openReleasePage">{{
        $t('settings.update.diagnostics.openRelease')
      }}</button>
    </div>

    <div v-if="actionMessage" class="diagnostic-panel__message">{{ actionMessage }}</div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, toRefs } from 'vue'
import { useNormalStateStore } from '../store/state'
import { useI18n } from 'vue-i18n'
import {
  createDiagnosticsSnapshot,
  copyDiagnosticsSnapshot
} from '../utils/diagnosticsSnapshotSettings'

const stateStore = useNormalStateStore()
const { latestVersion, updateError } = toRefs(stateStore)
const { t } = useI18n()

// ======== newADD start======
const props = defineProps<{ appVersion: string }>()
const actionMessage = ref('')
const pending = ref(false)
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
    `${t(`${d}.appVersion`)}: ${props.appVersion}`,
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
  if (pending.value) return
  pending.value = true
  try {
    await copyDiagnosticsSnapshot({ update: buildDiagnostics() })
    setActionMessage(t('settings.update.diagnostics.copied'))
  } catch {
    setActionMessage(t('playbackInfo.diagnosticsUnavailable'))
  } finally {
    pending.value = false
  }
}

const downloadDiagnostics = async () => {
  if (pending.value) return
  pending.value = true
  try {
    const report = await createDiagnosticsSnapshot({ update: buildDiagnostics() })
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' })
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
  } catch {
    setActionMessage(t('playbackInfo.diagnosticsUnavailable'))
  } finally {
    pending.value = false
  }
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
</script>

<style scoped lang="scss">
// ======== newADD start======
.diagnostic-panel {
  width: 100%;
  box-sizing: border-box;
  margin-top: 14px;
  padding: 16px;
  border-radius: 12px;
  background-color: var(--color-secondary-bg);
  color: var(--color-text);
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
    color: var(--color-text);
    font: inherit;
  }
}
// =========== newADD end ========
</style>
