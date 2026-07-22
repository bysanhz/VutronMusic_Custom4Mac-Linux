import { autoUpdater } from 'electron-updater'
import { parse } from 'node-html-parser'
import { BrowserWindow, app, dialog, shell } from 'electron'
import Constants from './utils/Constants'

// ======== newADD start======
const RELEASE_OWNER = 'bysanhz'
const RELEASE_REPOSITORY = 'VutronMusic_Custom4Mac-Linux'
const RELEASE_PAGE_URL = `https://github.com/${RELEASE_OWNER}/${RELEASE_REPOSITORY}/releases`
const RELEASE_API_URL = `https://api.github.com/repos/${RELEASE_OWNER}/${RELEASE_REPOSITORY}/releases?per_page=10`

let nativeUpdaterConfigured = false

/**
 * 判断当前安装格式是否支持 electron-updater 原生下载安装。
 *
 * 详细说明：
 * 1. Windows 安装包继续使用 electron-updater；
 * 2. Linux 只有 AppImage 存在 APPIMAGE 环境变量时才调用 electron-updater；
 * 3. Linux Deb、源码开发环境和未签名 macOS 构建仅检查 GitHub Release，下载时打开发布页；
 * 4. 这样可以避免非 AppImage 环境反复输出 APPIMAGE env is not defined。
 */
const canUseNativeUpdater = () => {
  if (!app.isPackaged || Constants.IS_MAC) return false
  if (Constants.IS_LINUX) return Boolean(process.env.APPIMAGE)
  return true
}

const configureNativeUpdater = () => {
  if (nativeUpdaterConfigured || !canUseNativeUpdater()) return

  autoUpdater.setFeedURL({
    provider: 'github',
    owner: RELEASE_OWNER,
    repo: RELEASE_REPOSITORY,
    private: false
  })
  autoUpdater.autoDownload = false
  nativeUpdaterConfigured = true
}

const normalizeVersion = (value: unknown) => {
  const text = String(value || '').trim()
  return text.replace(/^v/i, '') || app.getVersion()
}

const releaseNotesToText = (releaseNotes: unknown) => {
  if (typeof releaseNotes !== 'string' || !releaseNotes.trim()) {
    return '无更新说明'
  }

  return parse(releaseNotes).text.trim() || '无更新说明'
}

/**
 * 对不支持原生更新的安装格式执行只读 Release 检查。
 *
 * Returns:
 * 返回与 electron-updater 兼容的 updateInfo 结构，设置页可以继续读取
 * `result.updateInfo.version`，同时附带 manualDownload 和 releaseUrl 供后续界面扩展。
 */
const checkGitHubRelease = async () => {
  const response = await fetch(RELEASE_API_URL, {
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
    updateInfo: {
      version,
      releaseName: latestRelease?.name || `VutronMusic ${version}`,
      releaseNotes: latestRelease?.body || '当前仓库尚未发布新的正式版本',
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
          : 'package'
  }
}
// =========== newADD end ========

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

  dialog
    .showMessageBox(win, {
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 ${info.version} \n是否立即下载？`,
      detail: plainNode,
      buttons: ['立即下载', '稍后下载']
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
    dialog
      .showMessageBox(win, {
        type: 'info',
        title: '下载完成',
        message: `新版本 ${info.version} 下载完成，是否立即安装？`,
        buttons: ['立即安装', '稍后安装']
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall()
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
