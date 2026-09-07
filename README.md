<div align="center">
  <a href="https://github.com/bysanhz/VutronMusic_Custom4Mac-Linux">
    <img src=".github/resources/vutron-icon-v3.3.0.webp" alt="VutronMusic Logo" width="156" height="156">
  </a>
  <h2>VutronMusic Custom for macOS & Linux</h2>
  <p>面向 macOS 与 Linux 持续适配的第三方网易云音乐桌面播放器</p>

  [![Code Quality](https://github.com/bysanhz/VutronMusic_Custom4Mac-Linux/actions/workflows/ci.yml/badge.svg)](https://github.com/bysanhz/VutronMusic_Custom4Mac-Linux/actions/workflows/ci.yml)
  [![Release](https://github.com/bysanhz/VutronMusic_Custom4Mac-Linux/actions/workflows/build.yml/badge.svg)](https://github.com/bysanhz/VutronMusic_Custom4Mac-Linux/actions/workflows/build.yml)
  [![Latest Release](https://img.shields.io/github/v/release/bysanhz/VutronMusic_Custom4Mac-Linux?display_name=tag)](https://github.com/bysanhz/VutronMusic_Custom4Mac-Linux/releases/latest)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
</div>

> 本仓库基于 [stark81/VutronMusic](https://github.com/stark81/VutronMusic) 二次开发。
> 原项目及其核心功能版权归原作者与相关贡献者所有。本仓库由
> [bysanhz](https://github.com/bysanhz) 维护，重点完善 macOS/Linux/Windows 跨平台适配、
> 主窗口连续缩放、桌面歌词交互、歌词时间校正、Heart Mode 个性化推荐与跨窗口播放控制。

## 项目定位

VutronMusic Custom 保留上游的网易云账号、在线歌单、本地音乐、流媒体、歌词与音频处理能力，并针对以下场景持续维护：

- macOS Apple Silicon 与 Intel 桌面环境；
- Linux x86_64 与 ARM64 桌面环境；
- Windows x64 与 ARM64；
- 不同分辨率、DPI 和窗口宽高比；
- 桌面歌词的拖动、缩放、锁定、局部穿透与紧凑控制；
- 主窗口、桌面歌词、托盘歌词和副歌标记之间的状态同步；
- 播放队列切换、心动模式、会话恢复和睡眠定时器之间的一致播放语义。

本项目不是网易云音乐官方客户端，也不代表上游作者。与本仓库定制功能相关的问题请提交到本仓库 Issues。

## 下载与平台支持

正式版本由 GitHub Actions 根据版本标签自动构建并发布到
[Releases](https://github.com/bysanhz/VutronMusic_Custom4Mac-Linux/releases)。

**当前正式版本：[`v3.3.0`](https://github.com/bysanhz/VutronMusic_Custom4Mac-Linux/releases/tag/v3.3.0)**（2026-09-07）。

| 平台 | 架构 | 安装包 | 更新方式 |
| --- | --- | --- | --- |
| Linux | x86_64 | AppImage / Deb / RPM / Snap | AppImage 支持应用内更新；其他格式跳转 Release |
| Linux | ARM64 | AppImage / Deb / RPM | 应用内检查版本，跳转 Release 手动下载 |
| macOS | Apple Silicon | 本机源码构建（推荐）/ 未签名 DMG arm64 | 应用内检查版本，跳转 Release |
| macOS | Intel | 本机源码构建（推荐）/ 未签名 DMG x64 | 应用内检查版本，跳转 Release |
| Windows | x64 | 安装版 / Portable | 支持应用内更新 |
| Windows | ARM64 | 安装版 | 支持应用内更新 |

### v3.3.0 重点更新

- 使用新的 VutronMusic 应用图标，并统一由构建前图标生成脚本产出各平台图标资源；
- Heart Mode 新增 ✨ 助手、五种风格 Profile、自定义算法总开关、多 Seed 候选、反馈学习、多样性重排与 Rolling Queue；
- Heart Mode 配置统一收口到 ✨ 助手，移除系统设置页中的重复入口；
- 软件启动时不再自动检查更新，只有用户在“软件更新”中主动点击“检查更新”后才联网检查；
- 歌曲缓存新增 `0.1–1024 GB` 自定义上限，并继续沿用原有缓存淘汰逻辑；
- 统一设置页选择器、输入框、按钮和开关的字体层级与右侧对齐方式，修复“音质选择”“顺序优先”等视觉不一致问题。

完整版本说明见 [`v3.3.0 Release`](https://github.com/bysanhz/VutronMusic_Custom4Mac-Linux/releases/tag/v3.3.0)。

macOS Release 中的 DMG 当前未进行 Apple Developer ID 签名和公证，下载后可能被 Gatekeeper 判定为“已损坏”或阻止打开。你可以选择按下方“macOS 下载版安装”处理单个 VutronMusic 应用，也可以在自己的电脑上拉取源码并按本文“macOS 本机构建”一节生成与当前机器架构匹配的应用。仓库不会要求用户安装或配置签名证书。

### macOS 下载版安装（未签名 DMG）

> 仅建议对从本仓库 [Releases](https://github.com/bysanhz/VutronMusic_Custom4Mac-Linux/releases) 下载、并且你确认来源可信的 VutronMusic 安装包执行以下操作。下面的方法只移除 VutronMusic 自身的下载隔离属性，不会关闭 macOS 全局 Gatekeeper。

先根据 Mac 架构选择正确的安装包：

- Apple Silicon（M1/M2/M3/M4/M5 等）下载 `arm64` DMG；
- Intel Mac 下载 `x64` DMG。

不确定当前机器架构时，在“终端”中执行：

```bash
uname -m
```

输出 `arm64` 表示 Apple Silicon；输出 `x86_64` 表示 Intel。

下载完成后：

1. 双击打开 DMG；
2. 将 `VutronMusic` 拖到 `Applications`（应用程序）文件夹；
3. 如果首次启动时出现“VutronMusic 已损坏，无法打开”或被 macOS 阻止，请打开“终端”并执行：

```bash
xattr -dr com.apple.quarantine /Applications/VutronMusic.app
open /Applications/VutronMusic.app
```

如果第一条命令提示权限不足，再执行：

```bash
sudo xattr -dr com.apple.quarantine /Applications/VutronMusic.app
open /Applications/VutronMusic.app
```

`sudo` 会要求输入当前 macOS 用户密码；终端输入密码时不会显示字符，这是正常现象。

如果已经安装过旧版本，请确认实际应用路径仍为：

```text
/Applications/VutronMusic.app
```

也可以检查安装包架构是否与当前 Mac 匹配：

```bash
file /Applications/VutronMusic.app/Contents/MacOS/VutronMusic
```

Apple Silicon 版本应包含 `arm64`，Intel 版本应包含 `x86_64`。

上述 `xattr` 命令的作用是删除 Chrome、Safari 等浏览器为互联网下载文件添加的 `com.apple.quarantine` 隔离属性。由于当前 GitHub Release 的 macOS 包没有 Developer ID 签名与 Apple 公证，Gatekeeper 可能因此拒绝启动。此方法仅针对 `/Applications/VutronMusic.app`，不会降低其他应用的系统安全检查级别。

**不建议**为了运行本应用执行关闭全局 Gatekeeper 的命令，例如：

```bash
sudo spctl --master-disable
```

如果仍然无法启动，请保留终端中的错误信息，并在本仓库 Issues 中附上 macOS 版本、机器架构和 VutronMusic 版本。

## 定制功能

### 主窗口连续缩放

- 字体、SVG 图标、封面、按钮、间距和圆角通过同一 Electron `zoomFactor` 连续缩放；
- 窗口横向、纵向和对角拖动均会连续影响完整界面；
- 对窗口拖动过程限频，降低频繁重排和栅格化造成的卡顿；
- 极端宽高比使用较短轴保护，避免窄高窗口中的控件异常放大；
- 首页、探索页、歌手、专辑、设置页和虚拟封面列表会根据内容区宽度自动重排。

### 桌面歌词增强

- 支持普通模式与紧凑模式；
- 桌面歌词窗口具有独立的缩放参考值；
- 歌词、封面、按钮、间距和圆角随窗口整体连续缩放；
- 紧凑模式锁定后，歌词区域保持鼠标穿透，左侧封面控制区仍可正常操作；
- 左侧封面与控制按钮是否显示由独立设置项控制；
- 优化 macOS/Linux 下窗口拉伸、拖动和边缘控件命中区域；
- 紧凑模式提供上一首、播放/暂停、下一首、主窗口显隐、心动模式和喜欢控制；
- 样式预设支持覆盖内置预设、另存为、恢复默认、未保存提示和撤销修改；
- 首次打开桌面歌词时同步当前歌曲、歌词行、偏移、封面和喜欢状态。

### 歌词时间校正

- 全局校正用于所有歌曲，单曲校正仅作用于当前歌曲；
- 播放页右键菜单可打开“本曲歌词时间校正”，支持 `±0.1s`、`±0.5s`、直接输入和重置；
- 单曲校正与全局校正相加，界面会显示本曲、全局和实际偏移；
- 单曲校正按歌曲 ID 保存，切歌和重启后继续生效；
- 歌曲原有 `offset` 不会被覆盖，用户校正作为独立增量叠加；
- 正值表示歌词提前，负值表示歌词延后；
- 主歌词、逐字歌词、桌面歌词、托盘歌词和副歌位置共用同一个有效偏移。

### 播放起点与队列历史

- 手动选歌、上一首、下一首、私人 FM 和心动模式统一从 `0:00` 开始；
- 暂停后继续、同一歌曲音源刷新和应用启动恢复仍保留原进度；
- 播放器菜单提供“播放历史与队列”，记录最近播放歌曲和最多 12 个队列快照；
- 可恢复心动模式或临时播放前的队列；
- 当前队列可直接保存为本地歌单；
- 最近播放记录最多保存 50 首，并可一键清空。

### Heart Mode / 网易云心动模式

Heart Mode 仍以网易云 `/playmode/intelligence/list` 为候选来源，但在 v3.3.0 中加入了可选的本地个性化排序与会话学习层。

- ✨ 助手是 Heart Mode 的唯一配置入口，顶部提供“当前 / 心动模式设置 / 操作说明”三个 Tab；
- “使用自定义心动算法”是持久化总开关：
  - 开启时启用多 Seed 候选、个性化 Scorer、播放反馈学习、Seed 分支偏好、多样性重排与 Rolling Queue；
  - 关闭时绕过自定义 Scorer 与 Session 学习，下一次启动 Heart Mode 时按网易云单 Seed 原始推荐顺序播放；
  - 关闭开关不会强制替换当前正在播放的队列；
- 提供 Continuous、Balanced、Diverse、Explore、Custom 五种风格 Profile；
- 可调参数包括风格跳脱度、新鲜度、熟悉感、重复容忍度、兴趣分支数、短/中/长期冷却以及同艺人、同 Seed 最小间隔；
- “兴趣分支（Seed）”表示由一首 Seed 扩展出的推荐路线，而不是单首歌曲评分；
- 支持“多来点这种”“跳远一点”等显式 steering，用于临时调整当前 Session 的推荐方向；
- 播放时长、跳过、完整播放、喜欢等反馈用于更新当前会话偏好；seek 本身不会被直接当作有效收听时长；
- Heart Mode 前的原队列仍可从“播放历史与队列”的快照中恢复。

Heart Mode 需要登录网易云账号，并且“我喜欢的音乐”中至少存在一首可用歌曲。

### 睡眠定时器

- 提供 15、30、60、90 分钟快捷选项；
- 支持 1–1440 分钟自定义时间；
- 支持“本曲结束”和“队列结束”；
- 结束动作可选择暂停播放或退出应用；
- 可选择不淡出、淡出 5 秒、15 秒或 30 秒；
- 定时设置会记住上一次使用的自定义时间、结束动作和淡出时长；
- 播放页右键菜单实时显示剩余时间。

### 歌曲缓存

- 缓存上限除预设值外新增“自定义”选项；
- 自定义范围为 `0.1–1024 GB`，设置会持久化保存；
- 底层继续以 MB 计量，并沿用既有的缓存淘汰策略；
- 缓存超过上限时自动清理较早的缓存歌曲，不改变现有播放与下载语义。

### 设置页交互一致性

- Heart Mode 配置不再同时出现在系统设置页和 ✨ 助手中，避免重复入口与状态歧义；
- CustomSelect、输入框、按钮与开关统一右侧控件列宽、字号和字重；
- 修复“音质选择”等控件字体层级与其他设置项不一致的问题；
- 修复“顺序优先”等选择器与上方开关视觉未对齐的问题；
- 右侧控件真正靠右对齐，同时保留安全边距，不贴近窗口边缘。

### 更新与诊断

- 软件启动时不会自动访问更新服务，也不会自动检查新版本；
- 只有用户进入“软件更新”并点击“检查更新”后，应用才会主动联网检查；
- Windows 与 Linux AppImage 继续使用 `electron-updater` 处理可用更新的下载与安装；
- Linux Deb / RPM、macOS 未签名 DMG 等手动安装格式在发现新版本后会提示用户，并提供打开 GitHub Release 下载页的入口；
- 非 AppImage Linux 环境不会误调用 AppImage 更新器；
- 设置页提供一键诊断快照，汇总版本、系统、GPU、播放状态、桌面歌词、定时器、队列和最近错误；
- 诊断快照不会包含密码、Cookie 或完整本地路径；
- 设置页仍可导出设置、打开日志文件和打开 Release 页面；
- 主进程与渲染进程会捕获未处理 Promise，并对短时间内的重复错误去重；
- Discord 未运行时只记录一次可忽略警告，不影响播放器启动。

### 安全与稳定性加固

- 主窗口与桌面歌词窗口启用 Electron 沙箱、严格 CSP、受信来源 IPC 校验和外部导航拦截；
- Vue I18n 使用 CSP 安全的 JIT AST 编译模式，`script-src` 不再依赖 `unsafe-eval`；
- `atom://` 本地资源读取限制到已登记音乐目录、应用资源、音频缓存和用户主动选择的文件或目录，并按资源类型校验扩展名与文件大小；
- 流媒体密码、访问令牌、Last.fm 会话密钥和第三方 Cookie 使用系统安全存储加密，渲染进程只接收是否已保存密码，不接收明文密码；
- SQLite 迁移按语义版本排序并在事务中执行，迁移前创建备份；持久化数据库不可用时会明确记录内存回退状态；
- 本地音乐扫描会防止歌曲 ID 与已有缓存记录冲突，扫描失败会结束扫描状态并写入日志；
- 重叠弹窗和右键菜单使用引用计数滚动锁，不会互相提前解除页面滚动限制；
- CI 固定使用唯一的 `vite.config.ts`，并执行安全与功能回归测试、格式、Lint、类型检查和构建。

## 上游功能

本仓库继续保留上游项目的主要能力：

- Vue 3、TypeScript、Pinia、Fastify 与 better-sqlite3；
- 网易云账号、歌单、云盘、评论和歌词；
- 本地歌曲、离线歌单与在线信息匹配；
- 外挂 LRC、内嵌歌词和逐字歌词；
- Navidrome、Jellyfin 和 Emby；
- 均衡器、混响、变调、变速和淡入淡出；
- macOS 状态栏歌词与 Touch Bar 歌词；
- Linux MPRIS、托盘和桌面环境歌词扩展。

## 开发环境

建议使用：

```text
Node.js >= 22.6.0
Yarn 1.22.22
Python 3
```

安装依赖：

```bash
yarn install
```

开发运行：

```bash
yarn dev
```

只读质量检查：

```bash
yarn run format:check
yarn lint
yarn run vue:type-check
yarn playwright test tests/security-hardening.spec.ts tests/feature-regression.spec.ts
yarn vite --config vite.config.ts build
```

### 同步源码

仓库处于正常状态时：

```bash
git pull --ff-only origin main
```

如果出现 `MERGE_HEAD exists`，说明之前的合并尚未结束。确认不需要保留这次未完成合并后，可执行：

```bash
git status
git merge --abort
git pull --ff-only origin main
```

不要在不清楚本地修改内容时直接使用 `git reset --hard`。

### macOS 本机构建

先安装 Xcode Command Line Tools，并确认 Node.js 与 Yarn 版本：

```bash
xcode-select --install
node --version
yarn --version
```

安装冻结依赖并执行完整检查：

```bash
yarn install --frozen-lockfile --network-timeout 600000
yarn run format:check
yarn lint
yarn run vue:type-check
yarn playwright test tests/security-hardening.spec.ts tests/feature-regression.spec.ts
yarn vite --config vite.config.ts build
```

Apple Silicon（M1/M2/M3/M4/M5）构建 ARM64 DMG：

```bash
rm -rf "release/$(node -p \"require('./package.json').version\")"
yarn run build:mac -- --arm64 -p never
```

Intel Mac 构建 x64 DMG：

```bash
rm -rf "release/$(node -p \"require('./package.json').version\")"
yarn run build:mac -- --x64 -p never
```

构建完成后查看产物：

```bash
VERSION="$(node -p \"require('./package.json').version\")"
find "release/${VERSION}" -maxdepth 2 -type f -name '*.dmg' -print
open "release/${VERSION}"
```

本机构建不会进行 Developer ID 签名或 Apple 公证。由于产物由本机生成，通常可以直接打开。若要跳过 DMG、直接检查 `.app`，可生成解包目录：

```bash
VERSION="$(node -p \"require('./package.json').version\")"
rm -rf "release/${VERSION}"
yarn run build:pre
CSC_IDENTITY_AUTO_DISCOVERY=false ./node_modules/.bin/electron-builder \
  --config=buildAssets/builder/config.js \
  --mac --arm64 --dir -p never
find "release/${VERSION}" -maxdepth 3 -name 'VutronMusic.app' -print
```

Intel Mac 将上面的 `--arm64` 替换为 `--x64`。

### Linux 本地打包

```bash
yarn run build:linux
```

构建过程执行：

```text
vue-tsc 类型检查 → Vite 构建 → electron-builder 打包
```

构建过程不会自动改写源码。统一格式需显式执行：

```bash
yarn run format:fix
```

## 自动发布流程

`.github/workflows/build.yml` 是唯一的版本标签发布工作流。推送 `v*.*.*` 标签时会：

1. 校验标签版本与 `package.json` 一致；
2. 使用冻结的 `yarn.lock` 安装依赖；
3. 执行 Prettier、ESLint、Vue TypeScript、回归测试和 Vite 检查；
4. 构建 Linux x64/ARM64、macOS ARM64/x64、Windows x64/ARM64；
5. 汇总安装包和更新元数据；
6. 使用 `.github/release-notes/vX.Y.Z.md` 发布正式 GitHub Release。

发布新版本时先更新 `package.json`、`yarn.lock` 和对应的版本更新说明，完成本地验证后执行：

```bash
VERSION=x.y.z

git add package.json yarn.lock ".github/release-notes/v${VERSION}.md"
git commit -m "发布 VutronMusic ${VERSION}"
git push origin main

git tag -a "v${VERSION}" -m "VutronMusic ${VERSION}"
git push origin "v${VERSION}"
```

标签版本必须和 `package.json` 的版本完全一致，否则发布工作流会立即停止。

手动运行 `build.yml` 时：
- 若填写已有的 `release_tag=vX.Y.Z`，会校验标签版本与 `package.json`，并将该标签发布为正式 Release；
- 若不填写 `release_tag`，则创建带时间戳的 Draft Release，不覆盖正式版本标签。

## 使用与排查

- Heart Mode 需要登录网易云账号，并且“我喜欢的音乐”中至少有一首歌曲；关闭“使用自定义心动算法”后，新的 Heart Mode 会话回到网易云原始单 Seed 推荐顺序；
- 修改 preload、桌面歌词窗口或 Electron 主进程后，需要完整退出并重新启动；
- 播放页右键菜单包含本曲歌词时间校正、播放历史与队列、睡眠定时器等入口；
- Linux Deb / RPM 与未签名 macOS 构建只在用户主动点击“检查更新”后检查新版本，不执行静默安装；
- macOS 下载版 DMG 被 Gatekeeper 拦截时，请按本文“macOS 下载版安装（未签名 DMG）”处理，或使用本机构建流程；
- 出现问题时，可在设置页复制一键诊断快照并打开日志文件；
- 网易云账号登录和通用功能可参考[上游 Wiki](https://github.com/stark81/VutronMusic/wiki/)。

## 上游项目与致谢

- 原项目：[stark81/VutronMusic](https://github.com/stark81/VutronMusic)；
- UI 与部分功能参考：[YesPlayMusic](https://github.com/qier222/YesPlayMusic)；
- 侧边导航栏设计参考“方格音乐”；
- 本地音乐统计区域参考：[NSMusicS](https://github.com/Super-Badmen-Viper/NSMusicS)；
- 逐字歌词格式支持参考：[LDDC](https://github.com/chenmozhijin/LDDC)；
- Electron 脚手架：[vutron](https://github.com/jooy2/vutron)。

感谢上游作者及所有相关开源项目贡献者。

## 开源许可

本仓库继承并保留上游项目中的许可证、版权声明和第三方依赖许可，项目代码基于 [MIT License](LICENSE) 开源。

本项目仅用于个人学习与研究。请遵守所在地区法律法规、版权要求和相关服务条款，不得用于侵犯版权、绕过付费授权或其他非法用途。

## 截图

![本地音乐][localMusic-screenShot]

![首页][home-screenShot]

![探索][explore-screenShot]

![音乐库][library-screenShot]

![我喜欢的音乐][likepage-screenShot]

![本地音乐][local-music-screenShot]

![歌单][playlist-screenShot]

![播放页][playpage-screenShot]

![评论][comment-screenShot]

![搜索][search-screenShot]

![用户页][user-screenShot]

![MV][mv-screenShot]

![托盘歌词][tray-lyric-screenShot]

![媒体控制][media-controls-screenShot]

[localMusic-screenShot]: images/localMusic.jpg
[home-screenShot]: images/home.jpg
[explore-screenShot]: images/explore.jpg
[library-screenShot]: images/library.jpg
[likepage-screenShot]: images/like-page.jpg
[local-music-screenShot]: images/local-music.jpg
[playlist-screenShot]: images/playlists.jpg
[playpage-screenShot]: images/play-page.jpg
[comment-screenShot]: images/comment-page.jpg
[search-screenShot]: images/search-lyric.jpg
[user-screenShot]: images/user.jpg
[tray-lyric-screenShot]: images/tray-TouchBar-lyric.jpg
[mv-screenShot]: images/mv.jpg
[media-controls-screenShot]: images/media-control-lyric.png
