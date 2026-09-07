/* eslint-disable no-template-curly-in-string */
const dotenv = require('dotenv')

const baseConfig = {
  productName: 'VutronMusic',
  // ======== newADD start======
  // 固定应用身份，避免不同构建回退到 electron-builder 默认标识。
  appId: 'com.bysanhz.vutronmusic',
  // build:pre 会先从已校验的 buildAssets/icon-source 分片重建图标，并生成透明背景的标准图标。
  // 将通用应用图标与 24x24 托盘图标复制到 resources，供运行时直接读取。
  extraResources: [
    {
      from: 'buildAssets/generated-icons/1024x1024.png',
      to: 'app-icon.png'
    },
    {
      from: 'buildAssets/generated-icons/tray/24x24.png',
      to: 'app-tray-icon.png'
    }
  ],
  // =========== newADD end ========
  asar: true,
  asarUnpack: [
    '**/node_modules/sharp/**/*',
    '**/node_modules/@img/**/*',
    'dist/main/workers/*.js',
    '**/node_modules/taglib-wasm/**/*'
  ],
  extends: null,
  artifactName: '${productName}-${version}_${os}_${arch}.${ext}',
  directories: {
    output: './release/${version}'
  },
  mac: {
    // 未显式设置 buildVersion 时，electron-builder 自动使用 package.json 的 version。
    hardenedRuntime: true,
    gatekeeperAssess: false,
    notarize: false,
    // ======== newADD start======
    // build:pre 会根据 buildAssets/icon-source 生成实际尺寸和文件名一致的标准图标。
    icon: 'buildAssets/generated-icons/1024x1024.png',
    // =========== newADD end ========
    type: 'distribution',
    target: [{ target: 'dmg', arch: 'x64' }]
  },
  dmg: {
    contents: [
      {
        x: 410,
        y: 150,
        type: 'link',
        path: '/Applications'
      },
      {
        x: 130,
        y: 150,
        type: 'file'
      }
    ],
    sign: false
  },
  win: {
    // ======== newADD start======
    icon: 'buildAssets/generated-icons/1024x1024.png',
    // =========== newADD end ========
    target: [
      { target: 'zip', arch: 'x64' },
      { target: 'portable', arch: 'x64' },
      { target: 'nsis', arch: 'x64' }
    ]
  },
  portable: {
    artifactName: '${productName}-${version}_${os}_${arch}-Portable.${ext}'
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    runAfterFinish: true
  },
  linux: {
    executableName: 'vutron',
    // ======== newADD start======
    // electron-builder 26.x 在 Linux 下要求图标目录中的文件使用 NxN.png 命名，
    // 且实际像素尺寸与文件名一致，避免回退到旧 icon.png。
    icon: 'buildAssets/generated-icons/linux',
    // electron-builder 26.8.1 尚不支持 syncDesktopName。使用其默认的
    // vutron.desktop 文件名，并显式写入与 Electron desktopName 一致的 WM_CLASS。
    desktop: {
      entry: {
        StartupWMClass: 'VutronMusic'
      }
    },
    // =========== newADD end ========
    category: 'Utility',
    target: [
      {
        target: 'AppImage',
        arch: 'x64'
      },
      {
        target: 'deb',
        arch: 'x64'
      }
    ]
  }
}

dotenv.config()

baseConfig.copyright = `ⓒ ${new Date().getFullYear()} $\{author}`
baseConfig.files = [
  /* A list of files not to be included in the build. */
  /*
    (Required) The files and folders listed below should not be included in the build.
  */
  'dist/**/*',
  'dist-native/*',
  '!dist/main/index.dev.js',
  '!docs/**/*',
  '!tests/**/*',
  '!release/**/*',
  '!**/.build-id/**'
]

// TODO: Notarize for macOS
baseConfig.mac.identity = null
/* if (process.env.MAC_NOTARIZE === 'true') {
  baseConfig.afterSign = './buildAssets/builder/notarize.ts'
} else {
  baseConfig.mac.identity = null
} */

module.exports = {
  ...baseConfig
}
