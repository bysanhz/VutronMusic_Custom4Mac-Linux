<template>
  <div
    v-if="latestVersion?.updateInfo?.releaseNotes"
    v-same-html="latestVersion?.updateInfo?.releaseNotes || ''"
    class="update-release"
  ></div>

  <!-- ======== newADD start====== -->
  <section class="diagnostic-panel">
    <div class="diagnostic-panel__header">
      <div>
        <div class="diagnostic-panel__title">更新与诊断</div>
        <div class="diagnostic-panel__description">
          {{ installFormatLabel }} · {{ platformLabel }}
        </div>
      </div>
      <span class="diagnostic-panel__badge">v{{ appVersion }}</span>
    </div>

    <div v-if="updateError" class="diagnostic-panel__error">
      最近一次更新检查失败：{{ updateError }}
    </div>

    <div class="diagnostic-panel__actions">
      <button @click="copyDiagnostics">复制诊断信息</button>
      <button @click="downloadDiagnostics">导出诊断文件</button>
      <button v-if="isElectron" @click="openLogFile">打开日志文件</button>
      <button v-if="releaseUrl" @click="openReleasePage">打开发布页面</button>
    </div>

    <div v-if="actionMessage" class="diagnostic-panel__message">{{ actionMessage }}</div>
  </section>
  <!-- =========== newADD end ======== -->
</template>

<script setup lang="ts">
import { computed, onMounted, ref, toRefs } from 'vue'
import { useNormalStateStore } from '../store/state'

const stateStore = useNormalStateStore()
const { latestVersion, updateError } = toRefs(stateStore)

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
    development: '开发环境',
    appimage: 'Linux AppImage',
    'linux-package': 'Linux 安装包',
    'macos-unsigned': 'macOS 未签名构建',
    'windows-package': 'Windows 安装包',
    package: '桌面安装包',
    browser: '浏览器环境'
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

  return [
    'VutronMusic Custom 诊断信息',
    `生成时间: ${new Date().toISOString()}`,
    `应用版本: ${appVersion.value}`,
    `最新版本: ${latest}`,
    `安装格式: ${installFormatLabel.value}`,
    `运行平台: ${platformLabel.value}`,
    `开发环境: ${window.env?.isDev ? '是' : '否'}`,
    `系统语言: ${navigator.language}`,
    `屏幕尺寸: ${screenSize}`,
    `窗口尺寸: ${viewportSize}`,
    `设备像素比: ${window.devicePixelRatio}`,
    `页面缩放: ${getZoomFactor().toFixed(3)}`,
    `User-Agent: ${navigator.userAgent}`,
    `更新检查错误: ${updateError.value || '无'}`
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
    setActionMessage('诊断信息已复制到剪贴板')
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = diagnostics
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
    setActionMessage('诊断信息已复制到剪贴板')
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
  setActionMessage('诊断文件已导出')
}

const openLogFile = () => {
  window.mainApi?.send('openLogFile')
  setActionMessage('已在文件管理器中定位日志文件')
}

const openReleasePage = () => {
  if (!releaseUrl.value) return
  window.mainApi?.send('msgOpenExternalLink', releaseUrl.value)
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

// ======== newADD start======
.diagnostic-panel {
  width: 100%;
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
  color: var(--color-text-secondary);
  font-size: 0.88em;
}

.diagnostic-panel__badge {
  flex: 0 0 auto;
  padding: 4px 9px;
  border-radius: 999px;
  background-color: var(--color-primary-bg);
  color: var(--color-primary);
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
