/* eslint-disable no-template-curly-in-string */
const dotenv = require('dotenv')

const baseConfig = {
  productName: 'VutronMusic',
  // ======== newADD start======
  // 固定应用身份，避免不同构建回退到 electron-builder 默认标识。
  appId: 'com.bysanhz.vutronmusic',
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
    icon: 'buildAssets/icons/icon.icns',
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
    icon: 'buildAssets/icons/icon.ico',
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
    icon: 'buildAssets/icons/icon.png',
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
