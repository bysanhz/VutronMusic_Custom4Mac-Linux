import { app } from 'electron'
import { join, dirname } from 'path'
import { name, version } from '../../../package.json'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default class Constants {
  // Display app name (uppercase first letter)
  static APP_NAME = name.charAt(0).toUpperCase() + name.slice(1)

  static APP_VERSION = version

  static IS_DEV_ENV = process.env.NODE_ENV === 'development'

  static IS_MAC = process.platform === 'darwin'

  static IS_WINDOWS = process.platform === 'win32'

  static IS_LINUX = process.platform === 'linux'

  // ======== newADD start======
  /**
   * 主窗口与打包产物统一使用的应用图标路径。
   *
   * 开发环境从仓库根目录读取；打包后从 electron-builder 的
   * extraResources 目录读取。这样直接运行 linux-unpacked/vutron 时，
   * BrowserWindow 也不会继续使用旧图标或 Electron 默认图标。
   */
  static APP_ICON_PATH = Constants.IS_DEV_ENV
    ? join(process.cwd(), 'new_icon.png')
    : join(process.resourcesPath, 'new_icon.png')
  // =========== newADD end ========

  static DEFAULT_WEB_PREFERENCES = {
    nodeIntegration: false,
    contextIsolation: true,
    enableRemoteModule: false,
    preload: join(__dirname, '../preload/index.js')
  }

  static DEFAULT_OSD_PREFERENCES = {
    nodeIntegration: false,
    contextIsolation: true,
    enableRemoteModule: false,
    preload: join(__dirname, '../preload/osdWin.js')
  }

  static DEFAULT_AUTH_PREFERENCES = {
    nodeIntegration: false,
    contextIsolation: true,
    enableRemoteModule: false,
    preload: join(__dirname, '../preload/authWin.js')
  }

  static ELECTRON_WEB_SERVER_PORT = 41830
  static ELECTRON_DEV_NETEASE_API_PORT = 40001

  static APP_INDEX_URL_DEV = 'http://localhost:41830/index.html'
  static APP_INDEX_URL_PROD = 'http://localhost:41830/#/index.html'
  // static APP_OSD_URL_PROD = join(__dirname, '../../osdlyric.html')
  static APP_OSD_URL = 'http://localhost:41830/osdlyric.html'
  // static APP_OSD_URL_PROD = join(__dirname, '../index.html')
}

// ======== newADD start======
/*
 * electron-builder 的 linux.icon 主要负责安装包和桌面启动器图标；
 * 直接启动 linux-unpacked 可执行文件时，仍需显式设置 BrowserWindow 图标。
 */
if (!Constants.IS_MAC) {
  app.on('browser-window-created', (_event, window) => {
    window.setIcon(Constants.APP_ICON_PATH)
  })
}
// =========== newADD end ========
