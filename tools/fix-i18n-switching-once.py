"""Apply the one-time language-switching and custom UI localization fixes."""

from __future__ import annotations

import json
from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:80]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


def add_locale_messages(path: str, language: str) -> None:
    file_path = Path(path)
    data = json.loads(file_path.read_text(encoding="utf-8"))

    messages = {
        "zh": {
            "common": {
                "selectPlaceholder": "请选择",
                "noData": "暂无数据",
                "searchPlaceholder": "搜索...",
                "reset": "重置",
                "change": "更改",
                "select": "选择",
                "input": "输入",
                "confirm": "确定",
                "login": "登录",
                "logout": "登出",
                "space": "空格",
            },
            "appFontSize": {
                "text": "主界面字体大小",
                "desc": "调节主窗口整体字号，不影响桌面歌词和菜单栏歌词",
            },
            "osdColors": {
                "background": "背景色",
                "played": "已播放颜色",
                "unplayed": "未播放颜色",
                "shadow": "阴影颜色",
            },
            "extension": {
                "enabled": "已开启",
                "disabled": "已停用",
                "installPrefix": "如果未安装插件，可点击",
                "here": "此处",
                "downloadSuffix": "下载",
            },
            "misc": {
                "proxyProtocol": "代理协议",
                "updateProxy": "更新代理",
                "proxyDisabled": "已关闭代理",
                "proxyUpdated": "已更新代理设置",
            },
            "stream": {
                "serviceAction": "单击选择，右击选择并{action}",
                "logoutConfirm": "确定登出{service}吗？",
            },
            "autoCache": {"cacheCleared": "清除缓存成功"},
            "playbackRate": {"title": "倍速播放", "presets": "倍速预设", "current": "当前倍速"},
            "pitch": {"title": "音调调节", "presets": "音调预设", "current": "当前音调"},
            "heartMode": {
                "start": "根据我喜欢的音乐开启心动模式",
                "loading": "正在生成心动模式…",
                "loadingWait": "心动模式正在加载，请稍候",
                "loginRequired": "心动模式需要先登录网易云音乐",
                "generating": "正在根据我喜欢的音乐生成心动模式…",
                "likedPlaylistMissing": "未找到“我喜欢的音乐”歌单",
                "recommendationMissing": "未获取到心动模式推荐歌曲",
                "started": "已开启心动模式，共 {count} 首",
                "likedPlaylistEmpty": "“我喜欢的音乐”歌单为空",
                "failed": "心动模式加载失败，请稍后重试",
                "timeout": "心动模式响应超时，请重试",
                "updated": "心动模式状态已更新",
                "success": "心动模式已开启",
                "error": "心动模式操作失败",
            },
            "compact": {
                "coverAlt": "当前歌曲封面",
                "previous": "上一首",
                "play": "播放",
                "pause": "暂停",
                "next": "下一首",
                "toggleMain": "显示或隐藏主窗口",
                "like": "加入喜欢",
                "unlike": "取消喜欢",
            },
            "diagnostics": {
                "releaseNotesLabel": "版本变化",
                "title": "更新与诊断",
                "lastError": "最近一次更新检查失败：{error}",
                "copy": "复制诊断信息",
                "export": "导出诊断文件",
                "openLog": "打开日志文件",
                "openRelease": "打开发布页面",
                "development": "开发环境",
                "linuxPackage": "Linux 安装包",
                "macosUnsigned": "macOS 未签名构建",
                "windowsPackage": "Windows 安装包",
                "desktopPackage": "桌面安装包",
                "browser": "浏览器环境",
                "reportTitle": "VutronMusic Custom 诊断信息",
                "generatedAt": "生成时间",
                "appVersion": "应用版本",
                "latestVersion": "最新版本",
                "installFormat": "安装格式",
                "platform": "运行平台",
                "devEnvironment": "开发环境",
                "systemLanguage": "系统语言",
                "screenSize": "屏幕尺寸",
                "windowSize": "窗口尺寸",
                "pixelRatio": "设备像素比",
                "pageZoom": "页面缩放",
                "updateError": "更新检查错误",
                "yes": "是",
                "no": "否",
                "none": "无",
                "copied": "诊断信息已复制到剪贴板",
                "exported": "诊断文件已导出",
                "logLocated": "已在文件管理器中定位日志文件",
            },
        },
        "zht": {
            "common": {
                "selectPlaceholder": "請選擇",
                "noData": "暫無資料",
                "searchPlaceholder": "搜尋...",
                "reset": "重設",
                "change": "更改",
                "select": "選擇",
                "input": "輸入",
                "confirm": "確定",
                "login": "登入",
                "logout": "登出",
                "space": "空白鍵",
            },
            "appFontSize": {
                "text": "主介面字體大小",
                "desc": "調整主視窗整體字級，不影響桌面歌詞與選單列歌詞",
            },
            "osdColors": {
                "background": "背景色",
                "played": "已播放顏色",
                "unplayed": "未播放顏色",
                "shadow": "陰影顏色",
            },
            "extension": {
                "enabled": "已啟用",
                "disabled": "已停用",
                "installPrefix": "若尚未安裝外掛，可點擊",
                "here": "此處",
                "downloadSuffix": "下載",
            },
            "misc": {
                "proxyProtocol": "代理協定",
                "updateProxy": "更新代理",
                "proxyDisabled": "已關閉代理",
                "proxyUpdated": "已更新代理設定",
            },
            "stream": {
                "serviceAction": "按一下選擇，按右鍵選擇並{action}",
                "logoutConfirm": "確定登出 {service} 嗎？",
            },
            "autoCache": {"cacheCleared": "清除快取成功"},
            "playbackRate": {"title": "倍速播放", "presets": "倍速預設", "current": "目前倍速"},
            "pitch": {"title": "音調調整", "presets": "音調預設", "current": "目前音調"},
            "heartMode": {
                "start": "根據我喜歡的音樂開啟心動模式",
                "loading": "正在產生心動模式…",
                "loadingWait": "心動模式正在載入，請稍候",
                "loginRequired": "心動模式需要先登入網易雲音樂",
                "generating": "正在根據我喜歡的音樂產生心動模式…",
                "likedPlaylistMissing": "找不到「我喜歡的音樂」歌單",
                "recommendationMissing": "未取得心動模式推薦歌曲",
                "started": "已開啟心動模式，共 {count} 首",
                "likedPlaylistEmpty": "「我喜歡的音樂」歌單為空",
                "failed": "心動模式載入失敗，請稍後重試",
                "timeout": "心動模式回應逾時，請重試",
                "updated": "心動模式狀態已更新",
                "success": "心動模式已開啟",
                "error": "心動模式操作失敗",
            },
            "compact": {
                "coverAlt": "目前歌曲封面",
                "previous": "上一首",
                "play": "播放",
                "pause": "暫停",
                "next": "下一首",
                "toggleMain": "顯示或隱藏主視窗",
                "like": "加入喜歡",
                "unlike": "取消喜歡",
            },
            "diagnostics": {
                "releaseNotesLabel": "版本變更",
                "title": "更新與診斷",
                "lastError": "最近一次更新檢查失敗：{error}",
                "copy": "複製診斷資訊",
                "export": "匯出診斷檔案",
                "openLog": "開啟日誌檔案",
                "openRelease": "開啟發佈頁面",
                "development": "開發環境",
                "linuxPackage": "Linux 安裝包",
                "macosUnsigned": "macOS 未簽名建置",
                "windowsPackage": "Windows 安裝包",
                "desktopPackage": "桌面安裝包",
                "browser": "瀏覽器環境",
                "reportTitle": "VutronMusic Custom 診斷資訊",
                "generatedAt": "產生時間",
                "appVersion": "應用程式版本",
                "latestVersion": "最新版本",
                "installFormat": "安裝格式",
                "platform": "執行平台",
                "devEnvironment": "開發環境",
                "systemLanguage": "系統語言",
                "screenSize": "螢幕尺寸",
                "windowSize": "視窗尺寸",
                "pixelRatio": "裝置像素比",
                "pageZoom": "頁面縮放",
                "updateError": "更新檢查錯誤",
                "yes": "是",
                "no": "否",
                "none": "無",
                "copied": "診斷資訊已複製到剪貼簿",
                "exported": "診斷檔案已匯出",
                "logLocated": "已在檔案管理器中定位日誌檔案",
            },
        },
        "en": {
            "common": {
                "selectPlaceholder": "Select",
                "noData": "No data",
                "searchPlaceholder": "Search...",
                "reset": "Reset",
                "change": "Change",
                "select": "Select",
                "input": "Input",
                "confirm": "Confirm",
                "login": "Log in",
                "logout": "Log out",
                "space": "Space",
            },
            "appFontSize": {
                "text": "Main UI Font Size",
                "desc": "Adjust the main-window UI font size without changing desktop or menu-bar lyrics.",
            },
            "osdColors": {
                "background": "Background",
                "played": "Played lyric",
                "unplayed": "Unplayed lyric",
                "shadow": "Text shadow",
            },
            "extension": {
                "enabled": "Enabled",
                "disabled": "Disabled",
                "installPrefix": "If the extension is not installed, click",
                "here": "here",
                "downloadSuffix": "to download it.",
            },
            "misc": {
                "proxyProtocol": "Proxy protocol",
                "updateProxy": "Update proxy",
                "proxyDisabled": "Proxy disabled",
                "proxyUpdated": "Proxy settings updated",
            },
            "stream": {
                "serviceAction": "Click to select; right-click to select and {action}",
                "logoutConfirm": "Log out of {service}?",
            },
            "autoCache": {"cacheCleared": "Cache cleared"},
            "playbackRate": {"title": "Playback Speed", "presets": "Speed presets", "current": "Current speed"},
            "pitch": {"title": "Pitch", "presets": "Pitch presets", "current": "Current pitch"},
            "heartMode": {
                "start": "Start Heart Mode from Liked Songs",
                "loading": "Generating Heart Mode…",
                "loadingWait": "Heart Mode is already loading. Please wait.",
                "loginRequired": "Log in to NetEase Cloud Music before starting Heart Mode.",
                "generating": "Generating Heart Mode from Liked Songs…",
                "likedPlaylistMissing": "Could not find the Liked Songs playlist.",
                "recommendationMissing": "No Heart Mode recommendations were returned.",
                "started": "Heart Mode started with {count} tracks",
                "likedPlaylistEmpty": "The Liked Songs playlist is empty.",
                "failed": "Heart Mode failed to load. Please try again later.",
                "timeout": "Heart Mode timed out. Please retry.",
                "updated": "Heart Mode status updated",
                "success": "Heart Mode started",
                "error": "Heart Mode operation failed",
            },
            "compact": {
                "coverAlt": "Current track cover",
                "previous": "Previous",
                "play": "Play",
                "pause": "Pause",
                "next": "Next",
                "toggleMain": "Show or hide main window",
                "like": "Like",
                "unlike": "Unlike",
            },
            "diagnostics": {
                "releaseNotesLabel": "Version changes",
                "title": "Updates & Diagnostics",
                "lastError": "Last update check failed: {error}",
                "copy": "Copy diagnostics",
                "export": "Export diagnostics",
                "openLog": "Open log file",
                "openRelease": "Open release page",
                "development": "Development",
                "linuxPackage": "Linux package",
                "macosUnsigned": "Unsigned macOS build",
                "windowsPackage": "Windows package",
                "desktopPackage": "Desktop package",
                "browser": "Browser",
                "reportTitle": "VutronMusic Custom diagnostics",
                "generatedAt": "Generated at",
                "appVersion": "App version",
                "latestVersion": "Latest version",
                "installFormat": "Install format",
                "platform": "Platform",
                "devEnvironment": "Development",
                "systemLanguage": "System language",
                "screenSize": "Screen size",
                "windowSize": "Window size",
                "pixelRatio": "Device pixel ratio",
                "pageZoom": "Page zoom",
                "updateError": "Update check error",
                "yes": "Yes",
                "no": "No",
                "none": "None",
                "copied": "Diagnostics copied to clipboard",
                "exported": "Diagnostics file exported",
                "logLocated": "Log file located in the file manager",
            },
        },
    }[language]

    data.setdefault("common", {}).update(messages["common"])
    settings = data.setdefault("settings", {})
    settings.setdefault("general", {})["appFontSize"] = messages["appFontSize"]
    settings.setdefault("osdLyric", {})["colors"] = messages["osdColors"]
    settings.setdefault("extension", {}).update(messages["extension"])
    settings.setdefault("misc", {}).update(messages["misc"])
    settings.setdefault("stream", {}).update(messages["stream"])
    settings.setdefault("autoCacheTrack", {}).update(messages["autoCache"])
    settings.setdefault("update", {})["diagnostics"] = messages["diagnostics"]

    player = data.setdefault("player", {})
    player["playbackRateModal"] = messages["playbackRate"]
    player["pitchModal"] = messages["pitch"]
    player["heartMode"] = messages["heartMode"]
    player["compactControls"] = messages["compact"]

    file_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# 1) Reactive feature language + injected control refresh.
replace_once(
    "src/renderer/utils/v327FeatureShared.ts",
    "export type SupportedLanguage = 'zh' | 'zht' | 'en'\nexport type JsonRecord = Record<string, any>\n",
    "import { ref } from 'vue'\n\nexport type SupportedLanguage = 'zh' | 'zht' | 'en'\nexport type JsonRecord = Record<string, any>\n\nexport const FEATURE_LANGUAGE_CHANGE_EVENT = 'vutronmusic-language-change'\n",
)
replace_once(
    "src/renderer/utils/v327FeatureShared.ts",
    "export const resolveFeatureLanguage = (): SupportedLanguage => {\n  try {\n    const settings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}')\n    const language = settings?.general?.language\n    return language === 'zh' || language === 'zht' ? language : 'en'\n  } catch {\n    return 'en'\n  }\n}\n",
    "const readFeatureLanguage = (): SupportedLanguage => {\n  try {\n    const settings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}')\n    const language = settings?.general?.language\n    return language === 'zh' || language === 'zht' ? language : 'en'\n  } catch {\n    return 'en'\n  }\n}\n\nconst featureLanguage = ref<SupportedLanguage>(readFeatureLanguage())\n\nexport const resolveFeatureLanguage = (): SupportedLanguage => featureLanguage.value\n\nconst dispatchFeatureLanguageChange = (language: SupportedLanguage): void => {\n  window.dispatchEvent(\n    new CustomEvent(FEATURE_LANGUAGE_CHANGE_EVENT, { detail: { language } })\n  )\n}\n\nexport const setFeatureLanguage = (language: string): void => {\n  const nextLanguage: SupportedLanguage =\n    language === 'zh' || language === 'zht' ? language : 'en'\n  featureLanguage.value = nextLanguage\n  dispatchFeatureLanguageChange(nextLanguage)\n}\n\nif (typeof window !== 'undefined') {\n  window.addEventListener('storage', (event) => {\n    if (event.key !== SETTINGS_STORAGE_KEY) return\n    const nextLanguage = readFeatureLanguage()\n    if (featureLanguage.value === nextLanguage) return\n    featureLanguage.value = nextLanguage\n    dispatchFeatureLanguageChange(nextLanguage)\n  })\n}\n",
)
replace_once(
    "src/renderer/utils/v327FeatureShared.ts",
    "  item.className = 'item'\n",
    "  item.className = 'item vutronmusic-v327-settings-item'\n",
)
replace_once(
    "src/renderer/utils/v327FeatureShared.ts",
    "const initializeSharedObserver = (): void => {\n  if (settingsObserver) return\n",
    "const refreshInjectedControlsForLanguage = (): void => {\n  document.querySelectorAll('.vutronmusic-v327-settings-item').forEach((element) => element.remove())\n  controlsReady = false\n  ensureAllControls()\n}\n\nconst initializeSharedObserver = (): void => {\n  if (settingsObserver) return\n",
)
replace_once(
    "src/renderer/utils/v327FeatureShared.ts",
    "  settingsObserver.observe(document.documentElement, {\n    childList: true,\n    subtree: true\n  })\n",
    "  settingsObserver.observe(document.documentElement, {\n    childList: true,\n    subtree: true\n  })\n  window.addEventListener(FEATURE_LANGUAGE_CHANGE_EVENT, refreshInjectedControlsForLanguage)\n",
)
replace_once(
    "src/renderer/utils/v327FeatureShared.ts",
    "        settingsObserver?.disconnect()\n        settingsObserver = null\n",
    "        settingsObserver?.disconnect()\n        settingsObserver = null\n        window.removeEventListener(\n          FEATURE_LANGUAGE_CHANGE_EVENT,\n          refreshInjectedControlsForLanguage\n        )\n",
)

# 2) Cover-control injected setting follows same-window language changes.
replace_once(
    "src/renderer/utils/osdCoverControlsSettings.ts",
    "import {\n  readOsdCoverControlsVisibility,\n  saveOsdCoverControlsVisibility\n} from './osdCoverControlsVisibility'\n",
    "import {\n  readOsdCoverControlsVisibility,\n  saveOsdCoverControlsVisibility\n} from './osdCoverControlsVisibility'\nimport { FEATURE_LANGUAGE_CHANGE_EVENT, resolveFeatureLanguage } from './v327FeatureShared'\n",
)
start = "const resolveLanguage = (): SupportedLanguage => {\n  try {\n    const settings = JSON.parse(localStorage.getItem('settings') || '{}')\n    const language = settings?.general?.language\n    return language === 'zh' || language === 'zht' ? language : 'en'\n  } catch {\n    return 'en'\n  }\n}\n"
replace_once(
    "src/renderer/utils/osdCoverControlsSettings.ts",
    start,
    "const resolveLanguage = (): SupportedLanguage => resolveFeatureLanguage()\n",
)
replace_once(
    "src/renderer/utils/osdCoverControlsSettings.ts",
    "/** 在桌面歌词设置面板中确保开关存在。 */\nconst ensureControl = () => {",
    "/** 在桌面歌词设置面板中确保开关存在。 */\nconst ensureControl = () => {",
)
replace_once(
    "src/renderer/utils/osdCoverControlsSettings.ts",
    "  const handleStorage = (event: StorageEvent) => {\n    if (event.key !== STORAGE_KEY) return\n    const input = document.querySelector<HTMLInputElement>('#showCompactCoverControls')\n    if (input) input.checked = event.newValue !== 'false'\n  }\n  window.addEventListener('storage', handleStorage)\n",
    "  const handleStorage = (event: StorageEvent) => {\n    if (event.key !== STORAGE_KEY) return\n    const input = document.querySelector<HTMLInputElement>('#showCompactCoverControls')\n    if (input) input.checked = event.newValue !== 'false'\n  }\n  const handleLanguageChange = () => {\n    const item = document.getElementById(CONTROL_ID)\n    const text = TEXTS[resolveLanguage()]\n    const title = item?.querySelector<HTMLElement>('.title')\n    const description = item?.querySelector<HTMLElement>('.description')\n    if (title) title.textContent = text.title\n    if (description) description.textContent = text.description\n  }\n  window.addEventListener('storage', handleStorage)\n  window.addEventListener(FEATURE_LANGUAGE_CHANGE_EVENT, handleLanguageChange)\n",
)
replace_once(
    "src/renderer/utils/osdCoverControlsSettings.ts",
    "      window.removeEventListener('storage', handleStorage)\n",
    "      window.removeEventListener('storage', handleStorage)\n      window.removeEventListener(FEATURE_LANGUAGE_CHANGE_EVENT, handleLanguageChange)\n",
)

# 3) SystemSettings language-driven labels are computed and same-window features are notified.
replace_once(
    "src/renderer/views/SystemSettings.vue",
    "import { serviceType, serviceName, Appearance, ProxyType } from '@/types/music.d'\n",
    "import { serviceType, serviceName, Appearance, ProxyType } from '@/types/music.d'\nimport { setFeatureLanguage, type SupportedLanguage } from '../utils/v327FeatureShared'\n",
)
replace_once(
    "src/renderer/views/SystemSettings.vue",
    "  set: (value) => {\n    language.value = value\n    locale.value = value\n  }\n})\n",
    "  set: (value) => {\n    language.value = value\n    locale.value = value\n    setFeatureLanguage(value as SupportedLanguage)\n  }\n})\n",
)
for name in [
    "languageOption",
    "closeOptions",
    "trayColorOptions",
    "typeOptions",
    "modeOptions",
    "translateOptions",
    "osdLyricAlignOptions",
    "sizeLimitOptions",
    "musicQualityOptions",
    "embedCoverArtOption",
    "embedStyleOption",
    "trackInfoOptions",
    "orderFirstOptions",
]:
    path = Path("src/renderer/views/SystemSettings.vue")
    text = path.read_text(encoding="utf-8")
    marker = f"const {name} = ["
    index = text.find(marker)
    if index < 0:
        raise RuntimeError(f"missing option array: {name}")
    start_index = index + len(f"const {name} = ")
    depth = 0
    end_index = None
    for i in range(start_index, len(text)):
        ch = text[i]
        if ch == '[':
            depth += 1
        elif ch == ']':
            depth -= 1
            if depth == 0:
                end_index = i + 1
                break
    if end_index is None:
        raise RuntimeError(f"unterminated option array: {name}")
    text = text[:start_index] + "computed(() => " + text[start_index:end_index] + ")" + text[end_index:]
    path.write_text(text, encoding="utf-8")

replacements = {
    '<div class="title">主界面字体大小</div>': '<div class="title">{{ $t(\'settings.general.appFontSize.text\') }}</div>',
    '<div class="description">调节主窗口整体字号，不影响桌面歌词和菜单栏歌词</div>': '<div class="description">{{ $t(\'settings.general.appFontSize.desc\') }}</div>',
    '<div class="text">背景色</div>': '<div class="text">{{ $t(\'settings.osdLyric.colors.background\') }}</div>',
    '<div class="text">已播放颜色</div>': '<div class="text">{{ $t(\'settings.osdLyric.colors.played\') }}</div>',
    '<div class="text">未播放颜色</div>': '<div class="text">{{ $t(\'settings.osdLyric.colors.unplayed\') }}</div>',
    '<div class="text">阴影颜色</div>': '<div class="text">{{ $t(\'settings.osdLyric.colors.shadow\') }}</div>',
    "extensionCheckResult ? '已开启' : '已停用'": "extensionCheckResult ? $t('settings.extension.enabled') : $t('settings.extension.disabled')",
    '>如果未安装插件，可点击\n                    <a @click="openOnBrowser(\'https://github.com/stark81/media-controls\')">此处</a>\n                    下载</div': ">{{ $t('settings.extension.installPrefix') }}\n                    <a @click=\"openOnBrowser('https://github.com/stark81/media-controls')\">{{ $t('settings.extension.here') }}</a>\n                    {{ $t('settings.extension.downloadSuffix') }}</div",
    '>重置</button': ">{{ $t('common.reset') }}</button",
    "autoCacheTrack.path ? '更改' : '选择'": "autoCacheTrack.path ? $t('common.change') : $t('common.select')",
    '>输入</button': ">{{ $t('common.input') }}</button",
    '>选择</button': ">{{ $t('common.select') }}</button",
    '>确定</button': ">{{ $t('common.confirm') }}</button",
    '<div>代理协议：</div>': '<div>{{ $t(\'settings.misc.proxyProtocol\') }}：</div>',
    '<button @click="updateProxy">更新代理</button>': '<button @click="updateProxy">{{ $t(\'settings.misc.updateProxy\') }}</button>',
    "showToast('清除缓存成功')": "showToast(t('settings.autoCacheTrack.cacheCleared'))",
    "showToast(proxyType.value === ProxyType.Disable ? '已关闭代理' : '已更新代理设置')": "showToast(\n    proxyType.value === ProxyType.Disable\n      ? t('settings.misc.proxyDisabled')\n      : t('settings.misc.proxyUpdated')\n  )",
    "shortcut = shortcut.replace('Space', '空格')": "shortcut = shortcut.replace('Space', t('common.space'))",
}
for old, new in replacements.items():
    path = Path("src/renderer/views/SystemSettings.vue")
    text = path.read_text(encoding="utf-8")
    if old not in text:
        if old in {">重置</button", ">输入</button", ">选择</button", ">确定</button"}:
            continue
        raise RuntimeError(f"SystemSettings replacement missing: {old[:90]!r}")
    text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")

replace_once(
    "src/renderer/views/SystemSettings.vue",
    "const serviceTitle = (platform: serviceType) => {\n  const title = platform.status === 'logout' ? '登录' : '登出'\n  return `单击选择，右击选择并${title}`\n}\n",
    "const serviceTitle = (platform: serviceType) => {\n  const action = t(platform.status === 'logout' ? 'common.login' : 'common.logout')\n  return t('settings.stream.serviceAction', { action })\n}\n",
)
replace_once(
    "src/renderer/views/SystemSettings.vue",
    "    if (confirm(`确定登出${platform.name}吗？`)) {\n",
    "    if (confirm(t('settings.stream.logoutConfirm', { service: platform.name }))) {\n",
)

# 4) CustomSelect default UI text uses i18n and updates immediately.
replace_once(
    "src/renderer/components/CustomSelect.vue",
    "import { useNormalStateStore } from '../store/state'\nimport { storeToRefs } from 'pinia'\n",
    "import { useNormalStateStore } from '../store/state'\nimport { storeToRefs } from 'pinia'\nimport { useI18n } from 'vue-i18n'\n",
)
replace_once(
    "src/renderer/components/CustomSelect.vue",
    "          :placeholder=\"searchPlaceholder\"\n",
    "          :placeholder=\"effectiveSearchPlaceholder\"\n",
)
replace_once(
    "src/renderer/components/CustomSelect.vue",
    "        {{ noDataText }}\n",
    "        {{ effectiveNoDataText }}\n",
)
replace_once(
    "src/renderer/components/CustomSelect.vue",
    "    placeholder: '请选择',\n    noDataText: '暂无数据',\n    // ======== newADD start======\n    searchPlaceholder: '搜索...',\n",
    "    placeholder: '',\n    noDataText: '',\n    // ======== newADD start======\n    searchPlaceholder: '',\n",
)
replace_once(
    "src/renderer/components/CustomSelect.vue",
    "const { enableScrolling } = storeToRefs(useNormalStateStore())\n",
    "const { enableScrolling } = storeToRefs(useNormalStateStore())\nconst { t } = useI18n()\nconst effectivePlaceholder = computed(() => props.placeholder || t('common.selectPlaceholder'))\nconst effectiveNoDataText = computed(() => props.noDataText || t('common.noData'))\nconst effectiveSearchPlaceholder = computed(\n  () => props.searchPlaceholder || t('common.searchPlaceholder')\n)\n",
)
replace_once(
    "src/renderer/components/CustomSelect.vue",
    "  return selectedOption.value ? selectedOption.value.label : props.placeholder\n",
    "  return selectedOption.value ? selectedOption.value.label : effectivePlaceholder.value\n",
)

# 5) Playback rate / pitch modals.
replace_once("src/renderer/components/ModalPlayback.vue", '    title="倍速播放"\n', "    :title=\"$t('player.playbackRateModal.title')\"\n")
replace_once("src/renderer/components/ModalPlayback.vue", '      <div class="preset-grid" aria-label="倍速预设">\n', "      <div class=\"preset-grid\" :aria-label=\"$t('player.playbackRateModal.presets')\">\n")
replace_once("src/renderer/components/ModalPlayback.vue", '        <span class="current-value">当前倍速: {{ formatCurrentRate(playbackRate) }}</span>\n', "        <span class=\"current-value\">{{ $t('player.playbackRateModal.current') }}: {{ formatCurrentRate(playbackRate) }}</span>\n")
replace_once("src/renderer/components/ModalPitch.vue", '    title="音调调节"\n', "    :title=\"$t('player.pitchModal.title')\"\n")
replace_once("src/renderer/components/ModalPitch.vue", '      <div class="preset-grid" aria-label="音调预设">\n', "      <div class=\"preset-grid\" :aria-label=\"$t('player.pitchModal.presets')\">\n")
replace_once("src/renderer/components/ModalPitch.vue", '        <span class="current-value">当前音调: {{ `${pitch.toFixed(2)}x` }}</span>\n', "        <span class=\"current-value\">{{ $t('player.pitchModal.current') }}: {{ `${pitch.toFixed(2)}x` }}</span>\n")

# 6) LatestVersion diagnostics UI.
replace_once(
    "src/renderer/components/LatestVersion.vue",
    '<ul v-if="releaseNoteItems.length" class="update-release" aria-label="版本变化">',
    '<ul v-if="releaseNoteItems.length" class="update-release" :aria-label="$t(\'settings.update.diagnostics.releaseNotesLabel\')">',
)
for old, new in {
    '<div class="diagnostic-panel__title">更新与诊断</div>': '<div class="diagnostic-panel__title">{{ $t(\'settings.update.diagnostics.title\') }}</div>',
    '      最近一次更新检查失败：{{ updateError }}': "      {{ $t('settings.update.diagnostics.lastError', { error: updateError }) }}",
    '<button @click="copyDiagnostics">复制诊断信息</button>': '<button @click="copyDiagnostics">{{ $t(\'settings.update.diagnostics.copy\') }}</button>',
    '<button @click="downloadDiagnostics">导出诊断文件</button>': '<button @click="downloadDiagnostics">{{ $t(\'settings.update.diagnostics.export\') }}</button>',
    '<button v-if="isElectron" @click="openLogFile">打开日志文件</button>': '<button v-if="isElectron" @click="openLogFile">{{ $t(\'settings.update.diagnostics.openLog\') }}</button>',
    '<button v-if="releaseUrl" @click="openReleasePage">打开发布页面</button>': '<button v-if="releaseUrl" @click="openReleasePage">{{ $t(\'settings.update.diagnostics.openRelease\') }}</button>',
}.items():
    replace_once("src/renderer/components/LatestVersion.vue", old, new)
replace_once(
    "src/renderer/components/LatestVersion.vue",
    "import { useNormalStateStore } from '../store/state'\n",
    "import { useNormalStateStore } from '../store/state'\nimport { useI18n } from 'vue-i18n'\n",
)
replace_once(
    "src/renderer/components/LatestVersion.vue",
    "const { latestVersion, updateError } = toRefs(stateStore)\n",
    "const { latestVersion, updateError } = toRefs(stateStore)\nconst { t } = useI18n()\n",
)
replace_once(
    "src/renderer/components/LatestVersion.vue",
    "  const labels: Record<string, string> = {\n    development: '开发环境',\n    appimage: 'Linux AppImage',\n    'linux-package': 'Linux 安装包',\n    'macos-unsigned': 'macOS 未签名构建',\n    'windows-package': 'Windows 安装包',\n    package: '桌面安装包',\n    browser: '浏览器环境'\n  }\n",
    "  const labels: Record<string, string> = {\n    development: t('settings.update.diagnostics.development'),\n    appimage: 'Linux AppImage',\n    'linux-package': t('settings.update.diagnostics.linuxPackage'),\n    'macos-unsigned': t('settings.update.diagnostics.macosUnsigned'),\n    'windows-package': t('settings.update.diagnostics.windowsPackage'),\n    package: t('settings.update.diagnostics.desktopPackage'),\n    browser: t('settings.update.diagnostics.browser')\n  }\n",
)
replace_once(
    "src/renderer/components/LatestVersion.vue",
    "  return [\n    'VutronMusic Custom 诊断信息',\n    `生成时间: ${new Date().toISOString()}`,\n    `应用版本: ${appVersion.value}`,\n    `最新版本: ${latest}`,\n    `安装格式: ${installFormatLabel.value}`,\n    `运行平台: ${platformLabel.value}`,\n    `开发环境: ${window.env?.isDev ? '是' : '否'}`,\n    `系统语言: ${navigator.language}`,\n    `屏幕尺寸: ${screenSize}`,\n    `窗口尺寸: ${viewportSize}`,\n    `设备像素比: ${window.devicePixelRatio}`,\n    `页面缩放: ${getZoomFactor().toFixed(3)}`,\n    `User-Agent: ${navigator.userAgent}`,\n    `更新检查错误: ${updateError.value || '无'}`\n  ].join('\\n')\n",
    "  const d = 'settings.update.diagnostics'\n  return [\n    t(`${d}.reportTitle`),\n    `${t(`${d}.generatedAt`)}: ${new Date().toISOString()}`,\n    `${t(`${d}.appVersion`)}: ${appVersion.value}`,\n    `${t(`${d}.latestVersion`)}: ${latest}`,\n    `${t(`${d}.installFormat`)}: ${installFormatLabel.value}`,\n    `${t(`${d}.platform`)}: ${platformLabel.value}`,\n    `${t(`${d}.devEnvironment`)}: ${t(window.env?.isDev ? `${d}.yes` : `${d}.no`)}`,\n    `${t(`${d}.systemLanguage`)}: ${navigator.language}`,\n    `${t(`${d}.screenSize`)}: ${screenSize}`,\n    `${t(`${d}.windowSize`)}: ${viewportSize}`,\n    `${t(`${d}.pixelRatio`)}: ${window.devicePixelRatio}`,\n    `${t(`${d}.pageZoom`)}: ${getZoomFactor().toFixed(3)}`,\n    `User-Agent: ${navigator.userAgent}`,\n    `${t(`${d}.updateError`)}: ${updateError.value || t(`${d}.none`)}`\n  ].join('\\n')\n",
)
for old, key in {
    "setActionMessage('诊断信息已复制到剪贴板')": "copied",
    "setActionMessage('诊断文件已导出')": "exported",
    "setActionMessage('已在文件管理器中定位日志文件')": "logLocated",
}.items():
    text = Path("src/renderer/components/LatestVersion.vue").read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"LatestVersion action missing: {old}")
    text = text.replace(old, f"setActionMessage(t('settings.update.diagnostics.{key}'))")
    Path("src/renderer/components/LatestVersion.vue").write_text(text, encoding="utf-8")

# 7) OSD compact controls follow language changes without installing the full i18n plugin.
replace_once(
    "src/renderer/components/CompactCoverControls.vue",
    "import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'\n",
    "import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'\n",
)
replace_once(
    "src/renderer/components/CompactCoverControls.vue",
    "import SvgIcon from './SvgIcon.vue'\n",
    "import SvgIcon from './SvgIcon.vue'\nimport { resolveFeatureLanguage } from '../utils/v327FeatureShared'\n",
)
for old, new in {
    'alt="当前歌曲封面"': ':alt="text.coverAlt"',
    'title="上一首"': ':title="text.previous"',
    ":title=\"isPlaying ? '暂停' : '播放'\"": ':title="isPlaying ? text.pause : text.play"',
    'title="下一首"': ':title="text.next"',
    'title="显示或隐藏主窗口"': ':title="text.toggleMain"',
    ":title=\"isLiked ? '取消喜欢' : '加入喜欢'\"": ':title="isLiked ? text.unlike : text.like"',
}.items():
    replace_once("src/renderer/components/CompactCoverControls.vue", old, new)
replace_once(
    "src/renderer/components/CompactCoverControls.vue",
    "const rootRef = ref<HTMLElement | null>(null)\n",
    "const TEXTS = {\n  zh: {\n    coverAlt: '当前歌曲封面', previous: '上一首', play: '播放', pause: '暂停', next: '下一首',\n    toggleMain: '显示或隐藏主窗口', like: '加入喜欢', unlike: '取消喜欢',\n    heartStart: '根据我喜欢的音乐开启心动模式', heartLoading: '正在生成心动模式…',\n    heartTimeout: '心动模式响应超时，请重试', heartSuccess: '心动模式已开启', heartError: '心动模式操作失败'\n  },\n  zht: {\n    coverAlt: '目前歌曲封面', previous: '上一首', play: '播放', pause: '暫停', next: '下一首',\n    toggleMain: '顯示或隱藏主視窗', like: '加入喜歡', unlike: '取消喜歡',\n    heartStart: '根據我喜歡的音樂開啟心動模式', heartLoading: '正在產生心動模式…',\n    heartTimeout: '心動模式回應逾時，請重試', heartSuccess: '心動模式已開啟', heartError: '心動模式操作失敗'\n  },\n  en: {\n    coverAlt: 'Current track cover', previous: 'Previous', play: 'Play', pause: 'Pause', next: 'Next',\n    toggleMain: 'Show or hide main window', like: 'Like', unlike: 'Unlike',\n    heartStart: 'Start Heart Mode from Liked Songs', heartLoading: 'Generating Heart Mode…',\n    heartTimeout: 'Heart Mode timed out. Please retry.', heartSuccess: 'Heart Mode started', heartError: 'Heart Mode operation failed'\n  }\n} as const\n\nconst text = computed(() => TEXTS[resolveFeatureLanguage()])\nconst rootRef = ref<HTMLElement | null>(null)\n",
)
replace_once(
    "src/renderer/components/CompactCoverControls.vue",
    "const heartModeLoading = ref(false)\nconst heartModeTitle = ref('根据我喜欢的音乐开启心动模式')\n",
    "const heartModeLoading = ref(false)\nconst heartModeState = ref<'idle' | 'loading' | 'timeout' | 'success' | 'error'>('idle')\nconst heartModeTitle = computed(() => {\n  if (heartModeState.value === 'loading') return text.value.heartLoading\n  if (heartModeState.value === 'timeout') return text.value.heartTimeout\n  if (heartModeState.value === 'success') return text.value.heartSuccess\n  if (heartModeState.value === 'error') return text.value.heartError\n  return text.value.heartStart\n})\n",
)
replace_once("src/renderer/components/CompactCoverControls.vue", "  heartModeTitle.value = '正在生成心动模式…'\n", "  heartModeState.value = 'loading'\n")
replace_once("src/renderer/components/CompactCoverControls.vue", "    heartModeTitle.value = '心动模式响应超时，请重试'\n", "    heartModeState.value = 'timeout'\n")
replace_once(
    "src/renderer/components/CompactCoverControls.vue",
    "  heartModeTitle.value = String(event.data?.message || '心动模式状态已更新')\n  if (event.data?.status === 'loading') return\n\n  heartModeLoading.value = false\n",
    "  if (event.data?.status === 'loading') {\n    heartModeState.value = 'loading'\n    return\n  }\n  heartModeState.value = event.data?.status === 'success' ? 'success' : 'error'\n  heartModeLoading.value = false\n",
)

# 8) Main-window Heart Mode messages use active Vue locale.
repls = {
    "publishHeartModeResult(requestId, 'error', '心动模式正在加载，请稍候')": "publishHeartModeResult(requestId, 'error', i18n.global.t('player.heartMode.loadingWait'))",
    "const message = '心动模式需要先登录网易云音乐'": "const message = i18n.global.t('player.heartMode.loginRequired')",
    "stateStore.showToast('正在根据我喜欢的音乐生成心动模式…')": "stateStore.showToast(i18n.global.t('player.heartMode.generating'))",
    "publishHeartModeResult(requestId, 'loading', '正在生成心动模式…')": "publishHeartModeResult(requestId, 'loading', i18n.global.t('player.heartMode.loading'))",
    "const message = '未找到“我喜欢的音乐”歌单'": "const message = i18n.global.t('player.heartMode.likedPlaylistMissing')",
    "const message = '未获取到心动模式推荐歌曲'": "const message = i18n.global.t('player.heartMode.recommendationMissing')",
    "const message = `已开启心动模式，共 ${heartModeTrackIDs.length} 首`": "const message = i18n.global.t('player.heartMode.started', { count: heartModeTrackIDs.length })",
    "? '“我喜欢的音乐”歌单为空'\n        : '心动模式加载失败，请稍后重试'": "? i18n.global.t('player.heartMode.likedPlaylistEmpty')\n        : i18n.global.t('player.heartMode.failed')",
}
for old, new in repls.items():
    replace_once("src/renderer/main.ts", old, new)

# 9) Locale files.
add_locale_messages("src/renderer/locales/zh-hans.json", "zh")
add_locale_messages("src/renderer/locales/zh-hant.json", "zht")
add_locale_messages("src/renderer/locales/en.json", "en")

# 10) Regression coverage.
test_path = Path("tests/feature-regression.spec.ts")
test_text = test_path.read_text(encoding="utf-8")
anchor = "  test('registers diagnostics and playback-history integrations', () => {\n"
if anchor not in test_text:
    raise RuntimeError("regression test anchor missing")
new_test = """  test('keeps language switching reactive across Vue and injected controls', () => {\n    const settings = readSource('src/renderer/views/SystemSettings.vue')\n    const shared = readSource('src/renderer/utils/v327FeatureShared.ts')\n    const select = readSource('src/renderer/components/CustomSelect.vue')\n    const playback = readSource('src/renderer/components/ModalPlayback.vue')\n    const pitch = readSource('src/renderer/components/ModalPitch.vue')\n    const diagnostics = readSource('src/renderer/components/LatestVersion.vue')\n    const compact = readSource('src/renderer/components/CompactCoverControls.vue')\n\n    expect(settings).toContain('setFeatureLanguage(value as SupportedLanguage)')\n    expect(settings).toContain('const languageOption = computed(() => [')\n    expect(settings).toContain('const translateOptions = computed(() => [')\n    expect(shared).toContain("FEATURE_LANGUAGE_CHANGE_EVENT = 'vutronmusic-language-change'")\n    expect(shared).toContain('const featureLanguage = ref<SupportedLanguage>')\n    expect(shared).toContain('refreshInjectedControlsForLanguage')\n    expect(select).toContain("t('common.selectPlaceholder')")\n    expect(select).toContain("t('common.searchPlaceholder')")\n    expect(playback).toContain("$t('player.playbackRateModal.title')")\n    expect(pitch).toContain("$t('player.pitchModal.title')")\n    expect(diagnostics).toContain("settings.update.diagnostics.title")\n    expect(compact).toContain('computed(() => TEXTS[resolveFeatureLanguage()])')\n  })\n\n"""
test_path.write_text(test_text.replace(anchor, new_test + anchor), encoding="utf-8")
