import { autoUpdater } from 'electron-updater'
import { parse } from 'node-html-parser'
import { BrowserWindow, app, dialog, session, shell } from 'electron'
import { compareVersions } from 'compare-versions'
import Constants from './utils/Constants'
import store from './store'

// ======== newADD start======
const RELEASE_OWNER = 'bysanhz'
const RELEASE_REPOSITORY = 'VutronMusic_Custom4Mac-Linux'
const RELEASE_PAGE_URL = `https://github.com/${RELEASE_OWNER}/${RELEASE_REPOSITORY}/releases`
const RELEASE_API_URL = `https://api.github.com/repos/${RELEASE_OWNER}/${RELEASE_REPOSITORY}/releases?per_page=10`

let nativeUpdaterConfigured = false

const UPDATE_DIALOG_TEXT = {
  zh: {
    noReleaseNotes: '无更新说明',
    noPublishedRelease: '当前仓库尚未发布新的正式版本',
    checkTitle: '检查更新',
    latest: '当前已经是最新版本。',
    confirm: '确定',
    foundTitle: '发现新版本',
    found: '发现新版本 {version}',
    manualInstall: '当前安装格式需要通过系统安装器完成升级。',
    openDownload: '打开下载安装页',
    later: '稍后',
    downloadQuestion: '发现新版本 {version}，是否立即下载？',
    downloadNow: '立即下载',
    downloadLater: '稍后下载',
    downloadedTitle: '下载完成',
    installQuestion: '新版本 {version} 下载完成，是否立即安装？',
    installNow: '立即安装',
    installLater: '稍后安装'
  },
  zht: {
    noReleaseNotes: '無更新說明',
    noPublishedRelease: '目前倉庫尚未發佈新的正式版本',
    checkTitle: '檢查更新',
    latest: '目前已經是最新版本。',
    confirm: '確定',
    foundTitle: '發現新版本',
    found: '發現新版本 {version}',
    manualInstall: '目前安裝格式需要透過系統安裝程式完成升級。',
    openDownload: '開啟下載安裝頁',
    later: '稍後',
    downloadQuestion: '發現新版本 {version}，是否立即下載？',
    downloadNow: '立即下載',
    downloadLater: '稍後下載',
    downloadedTitle: '下載完成',
    installQuestion: '新版本 {version} 下載完成，是否立即安裝？',
    installNow: '立即安裝',
    installLater: '稍後安裝'
  },
  en: {
    noReleaseNotes: 'No release notes available.',
    noPublishedRelease: 'No newer stable release has been published yet.',
    checkTitle: 'Check for Updates',
    latest: 'You are already using the latest version.',
    confirm: 'OK',
    foundTitle: 'Update Available',
    found: 'Version {version} is available.',
    manualInstall: 'This installation format must be upgraded with the system installer.',
    openDownload: 'Open Download Page',
    later: 'Later',
    downloadQuestion: 'Version {version} is available. Download it now?',
    downloadNow: 'Download Now',
    downloadLater: 'Later',
    downloadedTitle: 'Download Complete',
    installQuestion: 'Version {version} has been downloaded. Install it now?',
    installNow: 'Install Now',
    installLater: 'Later'
  }
} as const

const getUpdateLanguage = () => {
  const language = store.get('settings.lang')
  return language === 'en' || language === 'zht' ? language : 'zh'
}

const updateText = () => UPDATE_DIALOG_TEXT[getUpdateLanguage()]
const formatUpdateText = (value: string, version: string) => value.replace('{version}', version)

const isWindowsPortable = () =>
  Constants.IS_WINDOWS && Boolean(process.env.PORTABLE_EXECUTABLE_FILE)

const getWindowsUpdateChannel = () =>
  process.arch === 'arm64' ? 'latest-win-arm64' : 'latest-win-x64'

/**
 * v3.3.2 起正式 Release 只发布 Windows x64 EXE、Linux amd64 DEB 和 macOS arm64 DMG。
 * Release 不再附带 electron-updater 所需的 latest*.yml / blockmap，因此所有正式安装格式
 * 都统一走 GitHub Release 只读检查，并在用户主动确认后打开发布页完成系统安装器升级。
 */
const canUseNativeUpdater = () => false

const configureNativeUpdater = () => {
  if (nativeUpdaterConfigured || !canUseNativeUpdater()) return

  autoUpdater.setFeedURL({
    provider: 'github',
    owner: RELEASE_OWNER,
    repo: RELEASE_REPOSITORY,
    private: false
  })
  autoUpdater.autoDownload = false

  if (Constants.IS_WINDOWS) {
    // Windows x64 / ARM64 发布物使用独立更新元数据，避免 latest.yml 在
    // Release 汇总时被另一架构覆盖，进而下载到错误架构的安装程序。
    autoUpdater.channel = getWindowsUpdateChannel()
  }

  nativeUpdaterConfigured = true
}

const normalizeVersion = (value: unknown) => {
  const text = String(value || '').trim()
  return text.replace(/^v/i, '') || app.getVersion()
}

const releaseNotesToText = (releaseNotes: unknown) => {
  if (typeof releaseNotes !== 'string' || !releaseNotes.trim()) {
    return updateText().noReleaseNotes
  }

  return parse(releaseNotes).text.trim() || updateText().noReleaseNotes
}

/**
 * 对不支持原生更新的安装格式执行只读 Release 检查。
 *
 * Returns:
 * 返回与 electron-updater 兼容的 updateInfo 结构，设置页可以继续读取
 * `result.updateInfo.version`，同时附带 manualDownload 和 releaseUrl 供后续界面扩展。
 */
const checkGitHubRelease = async () => {
  // Use Electron's Chromium network stack so Linux update checks honor the
  // application's configured proxy and the system proxy instead of bypassing them.
  const response = await session.defaultSession.fetch(RELEASE_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `${RELEASE_REPOSITORY}/${app.getVersion()}`
    }
  })

  if (!response.ok) {
    throw new Error(`GitHub Release 检查失败：HTTP ${response.status}`)
  }

  const releases = (await response.json()) as Array<Record<string, any>>
  const latestRelease = releases.find((release) => !release.draft && !release.prerelease)
  const version = normalizeVersion(latestRelease?.tag_name || latestRelease?.name)

  return {
    isUpdateAvailable: compareVersions(version, normalizeVersion(app.getVersion())) > 0,
    updateInfo: {
      version,
      releaseName: latestRelease?.name || `VutronMusic ${version}`,
      releaseNotes: latestRelease?.body || updateText().noPublishedRelease,
      releaseDate: latestRelease?.published_at || '',
      files: [],
      path: '',
      sha512: ''
    },
    manualDownload: true,
    releaseUrl: latestRelease?.html_url || RELEASE_PAGE_URL,
    installFormat: Constants.IS_DEV_ENV
      ? 'development'
      : Constants.IS_LINUX
        ? process.env.APPIMAGE
          ? 'appimage'
          : 'linux-package'
        : Constants.IS_MAC
          ? 'macos-unsigned'
          : isWindowsPortable()
            ? 'windows-portable'
            : 'package'
  }
}
// =========== newADD end ========

export const showManualUpdateDialog = async (
  win: BrowserWindow,
  result: {
    isUpdateAvailable?: boolean
    updateInfo?: {
      version?: string
      releaseNotes?: unknown
    }
    releaseUrl?: string
  }
) => {
  const text = updateText()

  if (!result?.isUpdateAvailable) {
    await dialog.showMessageBox(win, {
      type: 'info',
      title: text.checkTitle,
      message: text.latest,
      buttons: [text.confirm]
    })
    return
  }

  const version = normalizeVersion(result.updateInfo?.version)
  const detail = releaseNotesToText(result.updateInfo?.releaseNotes)
  const response = await dialog.showMessageBox(win, {
    type: 'info',
    title: text.foundTitle,
    message: formatUpdateText(text.found, version),
    detail: `${detail}\n\n${text.manualInstall}`,
    buttons: [text.openDownload, text.later],
    defaultId: 0,
    cancelId: 1
  })

  if (response.response === 0) {
    await shell.openExternal(result.releaseUrl || RELEASE_PAGE_URL)
  }
}

export const downloadUpdate = async () => {
  if (!canUseNativeUpdater()) {
    await shell.openExternal(RELEASE_PAGE_URL)
    return
  }

  configureNativeUpdater()
  return autoUpdater.downloadUpdate()
}

const handleUpdateAvailable = (win: BrowserWindow, info: any) => {
  const plainNode = releaseNotesToText(info.releaseNotes)
  const text = updateText()

  dialog
    .showMessageBox(win, {
      type: 'info',
      title: text.foundTitle,
      message: formatUpdateText(text.downloadQuestion, String(info.version)),
      detail: plainNode,
      buttons: [text.downloadNow, text.downloadLater]
    })
    .then((result) => {
      if (result.response === 0) {
        downloadUpdate().catch((error) => {
          win.webContents.send('update-error', String(error?.message || error))
        })
      }
    })
    .catch((error) => {
      win.webContents.send('update-error', String(error?.message || error))
    })
}

export const initAutoUpdater = (win: BrowserWindow) => {
  if (!canUseNativeUpdater()) return

  configureNativeUpdater()

  autoUpdater.on('update-available', (info) => {
    handleUpdateAvailable(win, info)
  })

  autoUpdater.on('update-not-available', (info) => {
    win.webContents.send('update-not-available', info)
  })

  autoUpdater.on('download-progress', (info) => {
    win.webContents.send('download-progress', info)
  })

  autoUpdater.on('update-downloaded', (info) => {
    const text = updateText()
    dialog
      .showMessageBox(win, {
        type: 'info',
        title: text.downloadedTitle,
        message: formatUpdateText(text.installQuestion, String(info.version)),
        buttons: [text.installNow, text.installLater]
      })
      .then((result) => {
        if (result.response === 0) {
          // 强制安装完成后重新启动应用。Windows NSIS 自动更新路径如果不显式
          // 要求重新运行，安装完成后可能停留在“已安装但未重新打开”的状态。
          autoUpdater.quitAndInstall(false, true)
        }
      })
      .catch((error) => {
        win.webContents.send('update-error', String(error?.message || error))
      })
  })

  autoUpdater.on('error', (error) => {
    win.webContents.send('update-error', String(error?.message || error))
  })
}

export const checkUpdate = async () => {
  if (!canUseNativeUpdater()) {
    return checkGitHubRelease()
  }

  configureNativeUpdater()
  return autoUpdater.checkForUpdates()
}
