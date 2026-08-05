// Warning: This file is only used in the development environment
// and is removed at build time.
import { installExtension, VUEJS_DEVTOOLS } from 'electron-extension-installer'

const enableVueDevTools = process.env.VUTRON_ENABLE_VUE_DEVTOOLS === '1'

if (enableVueDevTools) {
  void installExtension(VUEJS_DEVTOOLS, {
    loadExtensionOptions: {
      allowFileAccess: true
    }
  })
    .then((extension) => {
      console.info(`[DevTools] 已加载 ${extension.name}`)
    })
    .catch((error) => {
      console.warn('[DevTools] Vue DevTools 加载失败，应用将继续运行', error)
    })
} else {
  console.info(
    '[DevTools] 默认不加载 Vue DevTools；需要时使用 VUTRON_ENABLE_VUE_DEVTOOLS=1 yarn dev'
  )
}
