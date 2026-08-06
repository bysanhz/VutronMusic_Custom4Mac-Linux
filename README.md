<div align="center">
  <a href="https://github.com/bysanhz/VutronMusic_Custom4Mac-Linux">
    <img src="new_icon.png" alt="VutronMusic Logo" width="156" height="156">
  </a>
  <h2>VutronMusic Custom for macOS & Linux</h2>
  <p>面向 macOS 与 Linux 持续适配的第三方网易云音乐桌面播放器</p>

  [![Code Quality](https://github.com/bysanhz/VutronMusic_Custom4Mac-Linux/actions/workflows/ci.yml/badge.svg)](https://github.com/bysanhz/VutronMusic_Custom4Mac-Linux/actions/workflows/ci.yml)
  [![Release](https://github.com/bysanhz/VutronMusic_Custom4Mac-Linux/actions/workflows/build.yml/badge.svg)](https://github.com/bysanhz/VutronMusic_Custom4Mac-Linux/actions/workflows/build.yml)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
</div>

> 本仓库基于 [stark81/VutronMusic](https://github.com/stark81/VutronMusic) 二次开发。
> 原项目及其核心功能版权归原作者与相关贡献者所有。本仓库由
> [bysanhz](https://github.com/bysanhz) 维护，重点完善 macOS/Linux 桌面适配、
> 主窗口连续缩放、桌面歌词交互、歌词时间校正与跨窗口播放控制。

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

| 平台 | 架构 | 安装包 | 更新方式 |
| --- | --- | --- | --- |
| Linux | x86_64 | AppImage / Deb / RPM / Snap | AppImage 支持应用内更新；其他格式跳转 Release |
| Linux | ARM64 | AppImage / Deb / RPM | 应用内检查版本，跳转 Release 手动下载 |
| macOS | Apple Silicon | 本机源码构建（推荐）/ 未签名 DMG arm64 | 应用内检查版本，跳转 Release |
| macOS | Intel | 本机源码构建（推荐）/ 未签名 DMG x64 | 应用内检查版本，跳转 Release |
| Windows | x64 | 安装版 / Portable | 支持应用内更新 |
| Windows | ARM64 | 安装版 | 支持应用内更新 |

macOS Release 中的 DMG 当前未进行 Apple Developer ID 签名和公证，下载后可能被 Gatekeeper 判定为“已损坏”或阻止打开。macOS 用户推荐在自己的电脑上拉取源码并按本文“macOS 本机构建”一节生成与当前机器架构匹配的应用。仓库不会要求用户安装或配置签名证书。

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

### 网易云心动模式

桌面歌词中的心动模式按钮使用网易云智能播放接口，而不是私人 FM 或每日推荐：

1. 获取登录账号的“我喜欢的音乐”歌单；
2. 随机选择一首喜欢歌曲作为种子；
3. 请求 `/playmode/intelligence/list`；
4. 使用种子歌曲与推荐结果替换当前播放队列；
5. 种子歌曲始终从 `0:00` 开始播放；
6. 心动模式前的原队列可从队列快照中恢复。

### 睡眠定时器

- 提供 15、30、60、90 分钟快捷选项；
- 支持 1–1440 分钟自定义时间；
- 支持“本曲结束”和“队列结束”；
- 结束动作可选择暂停播放或退出应用；
- 可选择不淡出、淡出 5 秒、15 秒或 30 秒；
- 定时设置会记住上一次使用的自定义时间、结束动作和淡出时长；
- 播放页右键菜单实时显示剩余时间。

### 更新与诊断

- 开发环境、Linux AppImage、Linux Deb 和 macOS 构建使用不同更新策略；
- 非 AppImage 环境不会调用 AppImage 更新器；
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

手动运行 `build.yml` 时会创建带时间戳的 Draft Release，不会覆盖正式版本标签。

## 使用与排查

- 心动模式需要登录网易云账号，并且“我喜欢的音乐”中至少有一首歌曲；
- 修改 preload、桌面歌词窗口或 Electron 主进程后，需要完整退出并重新启动；
- 播放页右键菜单包含本曲歌词时间校正、播放历史与队列、睡眠定时器等入口；
- Linux Deb 和未签名 macOS 构建只负责检查新版本，不执行静默安装；
- macOS 下载版 DMG 被 Gatekeeper 拦截时，优先使用本文的本机构建流程；
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
