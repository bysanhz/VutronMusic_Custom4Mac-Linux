<div align="center">
  <a href="https://github.com/bysanhz/VutronMusic_Custom4Mac-Linux">
    <img src="buildAssets/icons/icon.png" alt="VutronMusic Logo" width="156" height="156">
  </a>
  <h2>VutronMusic Custom for macOS & Linux</h2>
  <p>面向 macOS 与 Linux 桌面环境持续适配的第三方网易云音乐播放器</p>
</div>

> 本仓库基于 [stark81/VutronMusic](https://github.com/stark81/VutronMusic) 进行二次开发。
> 原项目及其核心功能版权归原作者与相关贡献者所有；本仓库由
> [bysanhz](https://github.com/bysanhz) 维护，重点增加 macOS/Linux 桌面适配、
> 窗口连续缩放、桌面歌词交互与布局优化。

## 项目定位

上游 VutronMusic 已提供完整的网易云、本地音乐、流媒体、歌词和音频处理能力。
本仓库在保留这些功能的基础上，针对 macOS 与 Linux 的窗口行为、不同分辨率、
窄窗口布局和桌面歌词体验进行持续定制。

本仓库不是对上游作者身份的替代。提交问题或功能建议前，请先确认问题是否来自：

- 本仓库新增的 macOS/Linux 定制功能：在本仓库反馈；
- 上游已有的通用功能：可同时参考上游项目与上游 Wiki。

## 本仓库新增与重点维护功能

### 主窗口连续缩放

- 字体、SVG 图标、封面、按钮、间距和圆角使用同一 Electron `zoomFactor` 连续缩放；
- 设置页提供主界面最小字号与最大字号参考值；
- 最大字号不设置固定上限，最小字号仅要求大于 0；
- 窗口横向、纵向和对角缩放均会连续影响完整界面；
- 对窗口拖动过程进行限频，降低频繁重排和页面栅格化导致的卡顿。

### 自适应布局

- 设置页普通选项、外观预览、强调色和服务卡片可根据空间自动换行；
- 首页、探索页、歌手、专辑和封面网格会根据实际内容区宽度调整列数；
- 虚拟封面列表同步更新列数和滚动位置缓存；
- 窄窗口下优先重排内容，确有横向溢出时显示底部半透明辅助滚动条。

### 桌面歌词增强

- 支持普通模式与紧凑模式；
- 桌面歌词窗口可独立设置最小字号和最大字号缩放参考值；
- 歌词、封面、按钮、间距和圆角随桌面歌词窗口整体连续缩放；
- 锁定后隐藏封面控制区并启用鼠标穿透；
- 优化 macOS/Linux 下窗口拉伸、拖动和边缘按钮点击命中区域；
- 紧凑模式封面提供 2 × 3 控制网格：
  - 上一首；
  - 播放/暂停；
  - 下一首；
  - 显示/隐藏主窗口；
  - 心动模式；
  - 喜欢/取消喜欢；
- 爱心按钮始终显示，其余五个按钮仅在鼠标进入封面区域时显示。

### 真正的网易云心动模式

桌面歌词中的心动模式按钮不调用私人 FM，也不调用每日推荐歌曲。
当前实现流程为：

1. 获取登录账号的“我喜欢的音乐”歌单；
2. 从喜欢歌曲中随机选择一首作为种子歌曲；
3. 请求网易云 `/playmode/intelligence/list` 智能播放接口；
4. 使用种子歌曲与算法推荐序列替换当前播放队列；
5. 立即开始一次新的心动模式播放。

## 上游功能

本仓库继续保留上游项目的主要能力：

- Vue 3、TypeScript、Pinia、Fastify 与 better-sqlite3；
- 网易云账号、歌单、云盘、评论和歌词功能；
- 本地歌曲、离线歌单、在线信息匹配；
- 外挂 LRC、内嵌歌词和逐字歌词；
- Navidrome、Jellyfin 和 Emby 流媒体音乐；
- 音效、均衡器、变调、变速等高级音频功能；
- macOS 状态栏歌词和 Touch Bar 歌词；
- Linux MPRIS、托盘及桌面环境歌词扩展支持。

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

执行 TypeScript 检查并构建前端：

```bash
yarn run build:pre
```

Linux 打包：

```bash
yarn run build:linux
```

macOS 打包：

```bash
yarn run build:mac
```

构建过程会执行：

```text
Prettier 格式化 → vue-tsc 类型检查 → Vite 构建 → electron-builder 打包
```

`build:pre` 会运行 `prettier . --write`，因此构建后建议检查：

```bash
git status --short
```

## 使用说明

- 网易云账号登录问题可参考上游
  [账号登录 Wiki](https://github.com/stark81/VutronMusic/wiki/%E8%B4%A6%E5%8F%B7%E7%99%BB%E9%99%86)；
- Linux 插件、逐字歌词与流媒体配置可参考
  [上游 Wiki](https://github.com/stark81/VutronMusic/wiki/)；
- 心动模式需要登录网易云账号，并且“我喜欢的音乐”中至少存在一首歌曲；
- 修改 preload、桌面歌词窗口或 Electron 主进程代码后，需要完整退出并重新启动，
  仅依赖 Vite 热更新可能无法加载最新逻辑。

## 上游项目与致谢

- 原项目：[stark81/VutronMusic](https://github.com/stark81/VutronMusic)；
- UI 与部分功能参考：[YesPlayMusic](https://github.com/qier222/YesPlayMusic)；
- 侧边导航栏设计参考“方格音乐”；
- 本地音乐统计区域参考：[NSMusicS](https://github.com/Super-Badmen-Viper/NSMusicS)；
- 逐字歌词格式支持参考：[LDDC](https://github.com/chenmozhijin/LDDC)；
- Electron 脚手架：[vutron](https://github.com/jooy2/vutron)。

感谢上游作者及所有相关开源项目贡献者。

## 开源许可

本仓库继承并保留上游项目中的许可证、版权声明与第三方依赖许可。
项目代码基于 [MIT License](https://opensource.org/licenses/MIT) 开源。

本项目仅用于个人学习与研究，请遵守所在地区法律法规及相关服务条款，
不得用于侵犯版权、绕过付费授权或其他非法用途。

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
